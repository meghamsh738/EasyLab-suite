import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './LabInventory.css'

const STORAGE_KEY = 'easylab.next.lab-inventory.v1'
const BACKUP_FORMAT = 'easylab-lab-inventory'
const BACKUP_VERSION = 1
const MAX_BACKUP_BYTES = 20 * 1024 * 1024
const MAX_ITEMS = 5_000
const MAX_EVENTS = 25_000
const EXPIRING_DAYS = 30

type InventoryItem = {
  id: string
  name: string
  category: string
  location: string
  lot: string
  unit: string
  amount: number
  reorderPoint: number
  expiry: string
  notes: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

type EventAction = 'created' | 'edited' | 'received' | 'used' | 'archived' | 'restored' | 'imported'

type InventoryEvent = {
  id: string
  itemId: string
  itemName: string
  action: EventAction
  amountAfter: number | null
  details: string
  timestamp: string
}

type InventorySnapshot = { items: InventoryItem[]; history: InventoryEvent[] }
type StorageStatus = 'loading' | 'ready' | 'read-error' | 'corrupt' | 'write-error' | 'conflict'
type FilterKey = 'all' | 'low' | 'expiring' | 'expired' | 'archived'
type DialogState =
  | { type: 'item'; item: InventoryItem | null }
  | { type: 'adjust'; itemId: string; action: 'received' | 'used' }
  | { type: 'archive'; itemId: string }
  | { type: 'import'; fileName: string; snapshot: InventorySnapshot }
  | null

type ItemDraft = {
  name: string
  category: string
  location: string
  lot: string
  unit: string
  amount: string
  reorderPoint: string
  expiry: string
  notes: string
}

type ImportMode = 'merge' | 'replace'

const EMPTY_SNAPSHOT: InventorySnapshot = { items: [], history: [] }
const CATEGORIES = ['Reagent', 'Consumable', 'Equipment', 'Buffer', 'Antibody', 'Other']
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All items' },
  { key: 'low', label: 'Low stock' },
  { key: 'expiring', label: 'Expiring soon' },
  { key: 'expired', label: 'Expired' },
  { key: 'archived', label: 'Archived' },
]

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validateItem(value: unknown, index: number): InventoryItem {
  if (!isRecord(value)) throw new Error(`Item ${index + 1} must be an object.`)
  const requiredStrings = ['id', 'name', 'category', 'location', 'unit', 'createdAt', 'updatedAt'] as const
  for (const key of requiredStrings) {
    if (typeof value[key] !== 'string' || value[key].trim() === '') {
      throw new Error(`Item ${index + 1} is missing a valid ${key}.`)
    }
  }
  for (const key of ['lot', 'expiry', 'notes'] as const) {
    if (typeof value[key] !== 'string') throw new Error(`Item ${index + 1} has an invalid ${key}.`)
  }
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount < 0) {
    throw new Error(`Item ${index + 1} has an invalid amount.`)
  }
  if (typeof value.reorderPoint !== 'number' || !Number.isFinite(value.reorderPoint) || value.reorderPoint < 0) {
    throw new Error(`Item ${index + 1} has an invalid reorder point.`)
  }
  if (typeof value.archived !== 'boolean') throw new Error(`Item ${index + 1} has an invalid archive status.`)
  if (value.expiry !== '' && !isValidIsoDate(value.expiry as string)) throw new Error(`Item ${index + 1} has an invalid expiry date.`)
  if (!Number.isFinite(Date.parse(value.createdAt as string))) {
    throw new Error(`Item ${index + 1} has an invalid creation date.`)
  }
  if (!Number.isFinite(Date.parse(value.updatedAt as string))) throw new Error(`Item ${index + 1} has an invalid update date.`)
  return {
    id: value.id as string,
    name: value.name as string,
    category: value.category as string,
    location: value.location as string,
    lot: value.lot as string,
    unit: value.unit as string,
    amount: value.amount,
    reorderPoint: value.reorderPoint,
    expiry: value.expiry as string,
    notes: value.notes as string,
    archived: value.archived,
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  }
}

function validateEvent(value: unknown, index: number): InventoryEvent {
  const actions: EventAction[] = ['created', 'edited', 'received', 'used', 'archived', 'restored', 'imported']
  if (!isRecord(value)) throw new Error(`Change ${index + 1} must be an object.`)
  if (typeof value.id !== 'string' || typeof value.itemId !== 'string' || typeof value.itemName !== 'string') {
    throw new Error(`Change ${index + 1} has invalid item details.`)
  }
  if (typeof value.action !== 'string' || !actions.includes(value.action as EventAction)) {
    throw new Error(`Change ${index + 1} has an invalid action.`)
  }
  if (value.amountAfter !== null && (typeof value.amountAfter !== 'number' || !Number.isFinite(value.amountAfter) || value.amountAfter < 0)) {
    throw new Error(`Change ${index + 1} has an invalid resulting amount.`)
  }
  if (typeof value.details !== 'string' || typeof value.timestamp !== 'string' || !Number.isFinite(Date.parse(value.timestamp))) {
    throw new Error(`Change ${index + 1} has invalid notes or date.`)
  }
  return {
    id: value.id,
    itemId: value.itemId,
    itemName: value.itemName,
    action: value.action as EventAction,
    amountAfter: value.amountAfter as number | null,
    details: value.details,
    timestamp: value.timestamp,
  }
}

function parseSnapshot(value: unknown): InventorySnapshot {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION) {
    throw new Error('This file is not a supported Lab Inventory backup.')
  }
  if (!Array.isArray(value.items) || value.items.length > MAX_ITEMS) {
    throw new Error(`The backup must contain no more than ${MAX_ITEMS.toLocaleString()} items.`)
  }
  const history = value.history === undefined ? [] : value.history
  if (!Array.isArray(history) || history.length > MAX_EVENTS) {
    throw new Error(`The backup must contain no more than ${MAX_EVENTS.toLocaleString()} changes.`)
  }
  const items = value.items.map(validateItem)
  const itemIds = new Set<string>()
  for (const item of items) {
    if (itemIds.has(item.id)) throw new Error(`The backup contains duplicate item IDs (${item.name}).`)
    itemIds.add(item.id)
  }
  const events = history.map(validateEvent)
  return { items, history: events }
}

function makeEvent(
  item: Pick<InventoryItem, 'id' | 'name'>,
  action: EventAction,
  amountAfter: number | null,
  details: string,
  timestamp = new Date().toISOString(),
): InventoryEvent {
  return { id: makeId(), itemId: item.id, itemName: item.name, action, amountAfter, details, timestamp }
}

function escapeCsv(value: string | number): string {
  const raw = String(value)
  const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

function downloadFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

function itemKey(item: Pick<InventoryItem, 'name' | 'lot' | 'location'>): string {
  return [item.name, item.lot, item.location].map(value => value.trim().toLocaleLowerCase()).join('\u0000')
}

function todayIso(): string {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function daysUntil(date: string): number | null {
  if (!date || !isValidIsoDate(date)) return null
  const today = new Date(`${todayIso()}T00:00:00.000Z`).getTime()
  const target = new Date(`${date}T00:00:00.000Z`).getTime()
  return Math.round((target - today) / 86_400_000)
}

function isLow(item: InventoryItem): boolean {
  return item.amount <= item.reorderPoint
}

function isExpired(item: InventoryItem): boolean {
  const remaining = daysUntil(item.expiry)
  return remaining !== null && remaining < 0
}

function isExpiring(item: InventoryItem): boolean {
  const remaining = daysUntil(item.expiry)
  return remaining !== null && remaining >= 0 && remaining <= EXPIRING_DAYS
}

function makeDraft(item: InventoryItem | null): ItemDraft {
  if (!item) return {
    name: '', category: 'Reagent', location: '', lot: '', unit: '', amount: '0', reorderPoint: '0', expiry: '', notes: '',
  }
  return {
    name: item.name,
    category: item.category,
    location: item.location,
    lot: item.lot,
    unit: item.unit,
    amount: String(item.amount),
    reorderPoint: String(item.reorderPoint),
    expiry: item.expiry,
    notes: item.notes,
  }
}

function actionLabel(action: EventAction): string {
  const labels: Record<EventAction, string> = {
    created: 'Added item',
    edited: 'Edited item',
    received: 'Received stock',
    used: 'Used stock',
    archived: 'Archived item',
    restored: 'Restored item',
    imported: 'Imported backup',
  }
  return labels[action]
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 12 }).format(value)
}

function localTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function LabInventory({ onBack }: { onBack: () => void }) {
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(EMPTY_SNAPSHOT)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('loading')
  const [storageMessage, setStorageMessage] = useState('')
  const [recoveryText, setRecoveryText] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [draft, setDraft] = useState<ItemDraft>(() => makeDraft(null))
  const [formError, setFormError] = useState('')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustError, setAdjustError] = useState('')
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false)
  const [importError, setImportError] = useState('')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const lastSavedRef = useRef<InventorySnapshot>(EMPTY_SNAPSHOT)
  const lastSavedRawRef = useRef<string | null | undefined>(undefined)
  const modalRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const readInventory = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      lastSavedRawRef.current = saved
      if (saved === null) {
        setSnapshot(EMPTY_SNAPSHOT)
        lastSavedRef.current = EMPTY_SNAPSHOT
        setRecoveryText(null)
        setStorageMessage('')
        setStorageStatus('ready')
        return
      }
      try {
        const parsed = parseSnapshot(JSON.parse(saved))
        setSnapshot(parsed)
        lastSavedRef.current = parsed
        setRecoveryText(null)
        setStorageMessage('')
        setStorageStatus('ready')
      } catch (error) {
        setRecoveryText(saved)
        setStorageMessage(error instanceof Error ? error.message : 'Saved inventory data could not be read.')
        setStorageStatus('corrupt')
      }
    } catch {
      lastSavedRawRef.current = undefined
      setStorageMessage('This browser could not read local storage. Your saved inventory has not been changed.')
      setStorageStatus('read-error')
    }
  }, [])

  useEffect(() => { readInventory() }, [readInventory])

  useEffect(() => {
    const detectOtherWindowChange = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      setStorageMessage('Inventory changed in another Suite window. This window has stopped editing so it does not overwrite newer stock. Reload the latest saved inventory to continue.')
      setStorageStatus('conflict')
    }
    window.addEventListener('storage', detectOtherWindowChange)
    return () => window.removeEventListener('storage', detectOtherWindowChange)
  }, [])

  useEffect(() => {
    if (storageStatus !== 'ready') return
    if (snapshot === lastSavedRef.current) return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (lastSavedRawRef.current === undefined || saved !== lastSavedRawRef.current) {
        setSnapshot(lastSavedRef.current)
        setStorageMessage('Inventory changed in another Suite window. Your change was not saved over it. Reload the latest saved inventory to continue.')
        setStorageStatus('conflict')
        return
      }
      const serialized = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, ...snapshot })
      localStorage.setItem(STORAGE_KEY, serialized)
      lastSavedRef.current = snapshot
      lastSavedRawRef.current = serialized
    } catch {
      setSnapshot(lastSavedRef.current)
      setStorageMessage('The browser could not save this change. Editing is paused and the last saved inventory is still available.')
      setStorageStatus('write-error')
    }
  }, [snapshot, storageStatus])

  useEffect(() => {
    const modal = modalRef.current
    if (dialog && modal && !modal.open) {
      modal.showModal()
      modal.querySelector<HTMLElement>('[autofocus]')?.focus()
    } else if (!dialog && modal?.open) {
      modal.close()
    }
  }, [dialog])

  const activeItems = useMemo(() => snapshot.items.filter(item => !item.archived), [snapshot.items])
  const stats = useMemo(() => ({
    total: activeItems.length,
    low: activeItems.filter(isLow).length,
    expired: activeItems.filter(isExpired).length,
    expiring: activeItems.filter(isExpiring).length,
  }), [activeItems])

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return snapshot.items
      .filter(item => {
        if (filter === 'archived' ? !item.archived : item.archived) return false
        if (filter === 'low' && !isLow(item)) return false
        if (filter === 'expired' && !isExpired(item)) return false
        if (filter === 'expiring' && !isExpiring(item)) return false
        if (!needle) return true
        return [item.name, item.category, item.location, item.lot, item.unit, item.notes]
          .some(value => value.toLocaleLowerCase().includes(needle))
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filter, query, snapshot.items])

  const currentDialogItem = dialog?.type === 'adjust' || dialog?.type === 'archive'
    ? snapshot.items.find(item => item.id === dialog.itemId) ?? null
    : null

  function openNewItem(): void {
    setDraft(makeDraft(null))
    setFormError('')
    setDialog({ type: 'item', item: null })
  }

  function openEditItem(item: InventoryItem): void {
    setDraft(makeDraft(item))
    setFormError('')
    setDialog({ type: 'item', item })
  }

  function updateDraft<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]): void {
    setDraft(previous => ({ ...previous, [key]: value }))
    setFormError('')
  }

  function saveItem(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (storageStatus !== 'ready') return
    if (dialog?.type === 'item' && !dialog.item && snapshot.items.length >= MAX_ITEMS) {
      setFormError(`This inventory can hold up to ${MAX_ITEMS.toLocaleString()} items.`)
      return
    }
    const name = draft.name.trim()
    const category = draft.category.trim()
    const location = draft.location.trim()
    const unit = draft.unit.trim()
    const amount = Number(Number(draft.amount).toPrecision(12))
    const reorderPoint = Number(Number(draft.reorderPoint).toPrecision(12))
    if (!name || !category || !location || !unit) {
      setFormError('Enter an item name, category, storage location, and unit.')
      return
    }
    if (draft.amount.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      setFormError('In-stock amount must be a number at or above zero.')
      return
    }
    if (draft.reorderPoint.trim() === '' || !Number.isFinite(reorderPoint) || reorderPoint < 0) {
      setFormError('Reorder point must be a number at or above zero.')
      return
    }
    if (draft.expiry && !isValidIsoDate(draft.expiry)) {
      setFormError('Enter a real expiry date, or leave the date blank.')
      return
    }
    const candidateKey = itemKey({ name, lot: draft.lot, location })
    const duplicate = snapshot.items.find(item => item.id !== (dialog?.type === 'item' ? dialog.item?.id : undefined)
      && !item.archived && itemKey(item) === candidateKey)
    if (duplicate) {
      setFormError('An active item with the same name, lot, and location already exists.')
      return
    }
    const now = new Date().toISOString()
    const editing = dialog?.type === 'item' ? dialog.item : null
    const next: InventoryItem = {
      id: editing?.id ?? makeId(),
      name,
      category,
      location,
      lot: draft.lot.trim(),
      unit,
      amount,
      reorderPoint,
      expiry: draft.expiry,
      notes: draft.notes.trim(),
      archived: editing?.archived ?? false,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    }
    const historyEvent = makeEvent(next, editing ? 'edited' : 'created', next.amount,
      editing ? `Item details updated. In stock: ${formatQuantity(next.amount)} ${next.unit}.` : `Starting stock: ${formatQuantity(next.amount)} ${next.unit}.`, now)
    setSnapshot(previous => ({
      items: editing ? previous.items.map(item => item.id === next.id ? next : item) : [next, ...previous.items],
      history: [historyEvent, ...previous.history].slice(0, MAX_EVENTS),
    }))
    setDialog(null)
  }

  function applyAdjustment(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (storageStatus !== 'ready' || dialog?.type !== 'adjust' || !currentDialogItem) return
    const amount = Number(Number(adjustAmount).toPrecision(12))
    if (adjustAmount.trim() === '' || !Number.isFinite(amount) || amount <= 0) {
      setAdjustError('Enter an amount greater than zero.')
      return
    }
    if (dialog.action === 'used' && amount > currentDialogItem.amount) {
      setAdjustError(`Only ${formatQuantity(currentDialogItem.amount)} ${currentDialogItem.unit} is in stock.`)
      return
    }
    const updatedAmount = dialog.action === 'received'
      ? currentDialogItem.amount + amount
      : currentDialogItem.amount - amount
    const resultingAmount = Number(updatedAmount.toPrecision(12))
    if (!Number.isFinite(resultingAmount) || resultingAmount < 0) {
      setAdjustError('That change would create an invalid stock amount.')
      return
    }
    const now = new Date().toISOString()
    const updated = { ...currentDialogItem, amount: resultingAmount, updatedAt: now }
    const change = makeEvent(updated, dialog.action, resultingAmount,
      `${dialog.action === 'received' ? '+' : '−'}${formatQuantity(amount)} ${updated.unit} (now ${formatQuantity(resultingAmount)} ${updated.unit})`, now)
    setSnapshot(previous => ({
      items: previous.items.map(item => item.id === updated.id ? updated : item),
      history: [change, ...previous.history].slice(0, MAX_EVENTS),
    }))
    setAdjustAmount('')
    setAdjustError('')
    setDialog(null)
  }

  function setArchived(archived: boolean): void {
    if (storageStatus !== 'ready' || dialog?.type !== 'archive' || !currentDialogItem) return
    const now = new Date().toISOString()
    const updated = { ...currentDialogItem, archived, updatedAt: now }
    const change = makeEvent(updated, archived ? 'archived' : 'restored', updated.amount,
      archived ? 'Archived from active inventory.' : 'Restored to active inventory.', now)
    setSnapshot(previous => ({
      items: previous.items.map(item => item.id === updated.id ? updated : item),
      history: [change, ...previous.history].slice(0, MAX_EVENTS),
    }))
    setFilter('all')
    setDialog(null)
  }

  function exportJson(): void {
    const data = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...snapshot }
    downloadFile('easylab-inventory-backup.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8')
  }

  function exportCsv(): void {
    const headers = ['Name', 'Category', 'Location', 'Lot', 'Unit', 'Amount', 'Reorder point', 'Expiry', 'Notes', 'Archived']
    const rows = snapshot.items.map(item => [
      item.name, item.category, item.location, item.lot, item.unit, item.amount, item.reorderPoint,
      item.expiry, item.notes, item.archived ? 'Yes' : 'No',
    ])
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n')
    downloadFile('easylab-inventory.csv', `\uFEFF${csv}`, 'text/csv;charset=utf-8')
  }

  function downloadRecoveryCopy(): void {
    if (recoveryText === null) return
    downloadFile('easylab-inventory-recovery-copy.txt', recoveryText, 'text/plain;charset=utf-8')
  }

  async function readImportFile(file: File | undefined): Promise<void> {
    setImportError('')
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) {
      setImportError('This file is over 20 MB. Choose a smaller Lab Inventory backup.')
      return
    }
    try {
      const parsed = parseSnapshot(JSON.parse(await file.text()))
      setImportMode(storageStatus === 'corrupt' ? 'replace' : 'merge')
      setRecoveryAcknowledged(false)
      setDialog({ type: 'import', fileName: file.name, snapshot: parsed })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'This backup could not be read.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const matchingImportCount = useMemo(() => {
    if (dialog?.type !== 'import') return 0
    const ids = new Set(snapshot.items.map(item => item.id))
    const keys = new Set(snapshot.items.map(itemKey))
    return dialog.snapshot.items.filter(item => ids.has(item.id) || keys.has(itemKey(item))).length
  }, [dialog, snapshot.items])

  function confirmImport(): void {
    if (dialog?.type !== 'import') return
    const imported = dialog.snapshot
    if (storageStatus === 'read-error' || storageStatus === 'write-error' || storageStatus === 'conflict') return
    if (storageStatus === 'corrupt' && !recoveryAcknowledged) return
    const importedEvent = makeEvent(
      { id: 'inventory', name: 'Inventory backup' },
      'imported',
      null,
      importMode === 'replace'
        ? `Restored ${imported.items.length} item${imported.items.length === 1 ? '' : 's'} from ${dialog.fileName}.`
        : `Added items from ${dialog.fileName}.`,
    )
    if (importMode === 'replace' || storageStatus === 'corrupt') {
      setSnapshot({ items: imported.items, history: [importedEvent, ...imported.history].slice(0, MAX_EVENTS) })
    } else {
      const ids = new Set(snapshot.items.map(item => item.id))
      const keys = new Set(snapshot.items.map(itemKey))
      const accepted = imported.items.filter(item => !ids.has(item.id) && !keys.has(itemKey(item)))
      if (snapshot.items.length + accepted.length > MAX_ITEMS) {
        setImportError(`The combined inventory would exceed ${MAX_ITEMS.toLocaleString()} items.`)
        return
      }
      const acceptedIds = new Set(accepted.map(item => item.id))
      const acceptedHistory = imported.history.filter(event => acceptedIds.has(event.itemId))
      setSnapshot(previous => ({
        items: [...accepted, ...previous.items],
        history: [importedEvent, ...acceptedHistory, ...previous.history].slice(0, MAX_EVENTS),
      }))
    }
    setStorageStatus('ready')
    setStorageMessage('')
    setRecoveryText(null)
    setDialog(null)
    setFilter('all')
  }

  const displayedHistory = showAllHistory ? snapshot.history : snapshot.history.slice(0, 8)

  return (
    <main className="lab-inventory">
      <div className="li-topline">
        <button type="button" className="li-back" onClick={onBack} aria-label="Back to tools">
          <span aria-hidden="true">←</span> Suite home
        </button>
        <span className="li-local-label"><span className="li-local-dot" />{storageStatus === 'ready' ? 'Saved on this device' : storageStatus === 'loading' ? 'Checking device storage' : storageStatus === 'conflict' ? 'Newer data found' : 'Local data needs attention'}</span>
      </div>

      <header className="li-header">
        <div>
          <h1>Lab Inventory</h1>
          <p className="li-lede">Keep track of reagents and supplies across your lab.</p>
        </div>
        <div className="li-header-actions">
          <input ref={fileInputRef} className="li-hidden-input" type="file" accept="application/json,.json" aria-label="Choose a Lab Inventory backup" onChange={event => void readImportFile(event.currentTarget.files?.[0])} />
          <button className="li-button li-button-subtle" type="button" data-testid="inventory-import" disabled={storageStatus === 'loading' || storageStatus === 'read-error' || storageStatus === 'write-error' || storageStatus === 'conflict'} onClick={() => fileInputRef.current?.click()}>
            Import backup
          </button>
          <button className="li-button li-button-subtle" type="button" data-testid="inventory-export-csv" onClick={exportCsv} disabled={storageStatus !== 'ready'}>
            Export CSV
          </button>
          <button className="li-button li-button-primary" type="button" onClick={openNewItem} disabled={storageStatus !== 'ready'} data-testid="inventory-add">
            <span aria-hidden="true">+</span> Add item
          </button>
        </div>
      </header>

      {storageStatus === 'loading' && <div className="li-message li-message-neutral" role="status">Loading saved inventory…</div>}
      {(storageStatus === 'read-error' || storageStatus === 'write-error' || storageStatus === 'conflict') && (
        <div className="li-message li-message-error" role="alert">
          <div><strong>Inventory is read-only right now.</strong><p>{storageMessage}</p></div>
          <button type="button" className="li-button li-button-subtle" onClick={readInventory}>Reload latest inventory</button>
        </div>
      )}
      {storageStatus === 'corrupt' && (
        <div className="li-message li-message-error" role="alert">
          <div><strong>Saved inventory needs recovery.</strong><p>{storageMessage} Editing is paused so the saved data is not overwritten.</p>
            <p>Download a copy first. Then choose a valid backup to restore it.</p></div>
          <button type="button" className="li-button li-button-subtle" onClick={downloadRecoveryCopy}>Download recovery copy</button>
        </div>
      )}
      {importError && <div className="li-message li-message-error" role="alert"><p>{importError}</p><button type="button" aria-label="Dismiss import error" onClick={() => setImportError('')}>×</button></div>}

      {storageStatus === 'ready' && <>
        <section className="li-stat-grid" aria-label="Inventory summary">
          <div className="li-stat"><span>Active items</span><strong>{stats.total}</strong><small>Across all locations</small></div>
          <div className={`li-stat ${stats.low > 0 ? 'li-stat-warn' : ''}`}><span>Low stock</span><strong>{stats.low}</strong><small>At or below reorder point</small></div>
          <div className={`li-stat ${stats.expiring + stats.expired > 0 ? 'li-stat-alert' : ''}`}><span>Expiry attention</span><strong>{stats.expired + stats.expiring}</strong><small>{stats.expired} expired · {stats.expiring} within 30 days</small></div>
        </section>

        <section className="li-inventory-panel" aria-labelledby="li-list-title">
          <div className="li-panel-heading">
            <div><h2 id="li-list-title">Your supplies</h2><p>Search by item, lot, location, or note.</p></div>
            <label className="li-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search inventory" aria-label="Search inventory" /></label>
          </div>
          <div className="li-filter-row" role="group" aria-label="Filter inventory">
            {FILTERS.map(option => {
              const count = option.key === 'all' ? stats.total
                : option.key === 'low' ? stats.low
                  : option.key === 'expired' ? stats.expired
                    : option.key === 'expiring' ? stats.expiring
                      : snapshot.items.filter(item => item.archived).length
              return <button key={option.key} type="button" aria-pressed={filter === option.key} onClick={() => setFilter(option.key)}>{option.label}<span>{count}</span></button>
            })}
          </div>

          <div className="li-item-list" aria-live="polite">
            {visibleItems.length === 0 ? <div className="li-empty">
              <span className="li-empty-icon" aria-hidden="true">▤</span>
              <h3>{query ? 'No matching items' : filter === 'archived' ? 'No archived items' : filter === 'all' ? 'Your inventory starts here' : 'Nothing to review'}</h3>
              <p>{query ? 'Try a different name, lot, or location.' : filter === 'all' ? 'Add the reagents and supplies your lab uses.' : 'There are no items in this group right now.'}</p>
              {filter === 'all' && !query && <button type="button" className="li-button li-button-primary" onClick={openNewItem}>Add your first item</button>}
            </div> : visibleItems.map(item => <InventoryRow
              key={item.id}
              item={item}
              onEdit={openEditItem}
              onAdjust={(target, action) => { setAdjustAmount(''); setAdjustError(''); setDialog({ type: 'adjust', itemId: target.id, action }) }}
              onArchive={target => setDialog({ type: 'archive', itemId: target.id })}
              onRestore={target => setDialog({ type: 'archive', itemId: target.id })}
            />)}
          </div>
          {snapshot.items.length > 0 && <div className="li-list-footer">Showing {visibleItems.length} of {filter === 'archived' ? snapshot.items.filter(item => item.archived).length : activeItems.length} {filter === 'archived' ? 'archived' : 'active'} items</div>}
        </section>

        <section className="li-history-panel" aria-labelledby="li-history-title">
          <div className="li-history-heading"><div><h2 id="li-history-title">Recent changes</h2></div>
            {snapshot.history.length > 8 && <button type="button" className="li-text-button" onClick={() => setShowAllHistory(value => !value)}>{showAllHistory ? 'Show recent' : 'View all'}</button>}
          </div>
          {displayedHistory.length === 0 ? <p className="li-history-empty">Changes to your inventory will appear here.</p> : <ol className="li-history-list">
            {displayedHistory.map(event => <li key={event.id}>
              <span className={`li-history-mark li-history-${event.action}`} aria-hidden="true">{event.action === 'received' ? '↓' : event.action === 'used' ? '↑' : '·'}</span>
              <div className="li-history-copy"><strong>{actionLabel(event.action)}</strong><span>{event.itemName}{event.details ? ` · ${event.details}` : ''}</span></div>
              <time dateTime={event.timestamp}>{localTimestamp(event.timestamp)}</time>
            </li>)}
          </ol>}
          <div className="li-history-actions"><button className="li-text-button" type="button" data-testid="inventory-export-json" onClick={exportJson} disabled={storageStatus !== 'ready'}>Download JSON backup</button><span>Your data stays in this app on this device.</span></div>
        </section>
      </>}

      <dialog ref={modalRef} className="li-dialog" aria-labelledby="li-dialog-title" data-testid="inventory-dialog" onCancel={event => { event.preventDefault(); setDialog(null) }} onClick={event => { if (event.target === event.currentTarget) setDialog(null) }}>
        {dialog && (storageStatus === 'conflict' || storageStatus === 'write-error') && <div className="li-dialog-storage-warning" role="alert">
          <div><strong>This form cannot be saved.</strong><span>{storageMessage}</span></div>
          <button type="button" className="li-button li-button-subtle" onClick={() => { setDialog(null); readInventory() }}>Reload latest inventory</button>
        </div>}
        {dialog?.type === 'item' && <form className="li-dialog-content" onSubmit={saveItem} noValidate>
          <div className="li-dialog-heading"><div><p className="li-eyebrow">INVENTORY ITEM</p><h2 id="li-dialog-title">{dialog.item ? 'Edit item' : 'Add item'}</h2></div><button className="li-icon-button" type="button" aria-label="Close" onClick={() => setDialog(null)}>×</button></div>
          <div className="li-form-grid">
          <Field label="Item name" required><input autoFocus required data-testid="inventory-name" value={draft.name} onChange={event => updateDraft('name', event.currentTarget.value)} maxLength={120} placeholder="e.g. PBS, 1×" /></Field>
          <Field label="Category" required><input required list="li-categories" value={draft.category} onChange={event => updateDraft('category', event.currentTarget.value)} maxLength={60} placeholder="e.g. Reagent" /><datalist id="li-categories">{CATEGORIES.map(category => <option key={category} value={category} />)}</datalist></Field>
            <Field label="Storage location" required><input required value={draft.location} onChange={event => updateDraft('location', event.currentTarget.value)} maxLength={120} placeholder="e.g. Fridge 2 · Shelf B" /></Field>
            <Field label="Lot or reference"><input value={draft.lot} onChange={event => updateDraft('lot', event.currentTarget.value)} maxLength={120} placeholder="Optional" /></Field>
            <Field label="Unit" required><input required value={draft.unit} onChange={event => updateDraft('unit', event.currentTarget.value)} maxLength={32} placeholder="e.g. mL, tubes, g" /></Field>
            <Field label="Amount in stock" required><input required type="number" min="0" step="any" value={draft.amount} onChange={event => updateDraft('amount', event.currentTarget.value)} /></Field>
            <Field label="Reorder point" required help="Show low stock at or below this amount."><input required type="number" min="0" step="any" value={draft.reorderPoint} onChange={event => updateDraft('reorderPoint', event.currentTarget.value)} /></Field>
            <Field label="Expiry date" help="Leave blank if there is no expiry date."><input type="date" value={draft.expiry} onChange={event => updateDraft('expiry', event.currentTarget.value)} /></Field>
            <Field label="Notes" className="li-field-wide"><textarea rows={3} maxLength={1000} value={draft.notes} onChange={event => updateDraft('notes', event.currentTarget.value)} placeholder="Optional handling or ordering notes" /></Field>
          </div>
          {formError && <p className="li-form-error" role="alert">{formError}</p>}
          <div className="li-dialog-actions"><button className="li-button li-button-subtle" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="li-button li-button-primary" type="submit" data-testid="inventory-save" disabled={storageStatus !== 'ready'}>{dialog.item ? 'Save changes' : 'Add to inventory'}</button></div>
        </form>}

        {dialog?.type === 'adjust' && currentDialogItem && <form className="li-dialog-content" onSubmit={applyAdjustment} noValidate>
          <div className="li-dialog-heading"><div><p className="li-eyebrow">STOCK CHANGE</p><h2 id="li-dialog-title">{dialog.action === 'received' ? 'Receive stock' : 'Record use'}</h2></div><button className="li-icon-button" type="button" aria-label="Close" onClick={() => setDialog(null)}>×</button></div>
          <p className="li-dialog-intro"><strong>{currentDialogItem.name}</strong><span>In stock: {formatQuantity(currentDialogItem.amount)} {currentDialogItem.unit}</span></p>
          <Field label={`Amount to ${dialog.action === 'received' ? 'receive' : 'use'} (${currentDialogItem.unit})`} required><input autoFocus required data-testid="inventory-adjust-amount" type="number" min="0.0000001" step="any" value={adjustAmount} onChange={event => { setAdjustAmount(event.currentTarget.value); setAdjustError('') }} /></Field>
          {adjustError && <p className="li-form-error" role="alert">{adjustError}</p>}
          <div className="li-dialog-actions"><button className="li-button li-button-subtle" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="li-button li-button-primary" type="submit" data-testid="inventory-adjust-save" disabled={storageStatus !== 'ready'}>Save stock change</button></div>
        </form>}

        {dialog?.type === 'archive' && currentDialogItem && <div className="li-dialog-content">
          <div className="li-dialog-heading"><div><p className="li-eyebrow">{currentDialogItem.archived ? 'RESTORE ITEM' : 'ARCHIVE ITEM'}</p><h2 id="li-dialog-title">{currentDialogItem.archived ? 'Restore to inventory?' : 'Archive this item?'}</h2></div><button className="li-icon-button" type="button" aria-label="Close" onClick={() => setDialog(null)}>×</button></div>
          <p className="li-dialog-intro"><strong>{currentDialogItem.name}</strong><span>{currentDialogItem.archived ? 'It will return to active inventory.' : 'It will leave the active list. Its details and change history will be kept.'}</span></p>
          <div className="li-dialog-actions"><button className="li-button li-button-subtle" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="li-button li-button-primary" type="button" disabled={storageStatus !== 'ready'} onClick={() => setArchived(!currentDialogItem.archived)}>{currentDialogItem.archived ? 'Restore item' : 'Archive item'}</button></div>
        </div>}

        {dialog?.type === 'import' && <div className="li-dialog-content">
          <div className="li-dialog-heading"><div><p className="li-eyebrow">BACKUP REVIEW</p><h2 id="li-dialog-title">Import inventory</h2></div><button className="li-icon-button" type="button" aria-label="Close" onClick={() => setDialog(null)}>×</button></div>
          <div className="li-import-file"><span className="li-file-glyph" aria-hidden="true">JSON</span><div><strong>{dialog.fileName}</strong><span>{dialog.snapshot.items.length} items · {dialog.snapshot.history.length} recorded changes</span></div></div>
          {storageStatus === 'corrupt' ? <div className="li-import-warning"><strong>The saved inventory could not be read.</strong><p>Restoring this file replaces it. Download the recovery copy first, then confirm that you have saved it.</p><label className="li-check-row"><input type="checkbox" checked={recoveryAcknowledged} onChange={event => setRecoveryAcknowledged(event.currentTarget.checked)} /> I saved a copy of the current data, or accept replacing it.</label></div> : <>
            <p className="li-dialog-intro">{matchingImportCount > 0 ? `${matchingImportCount} imported item${matchingImportCount === 1 ? ' matches' : 's match'} existing IDs or name, lot, and location.` : 'No imported items match what is already saved.'}</p>
            <fieldset className="li-import-options"><legend>Choose what to do</legend>
              <label className="li-import-option"><input type="radio" name="import-mode" value="merge" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} /><span><strong>Add new items</strong><small>Keep current items and skip matches.</small></span></label>
              <label className="li-import-option"><input type="radio" name="import-mode" value="replace" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} /><span><strong>Replace all saved data</strong><small>Use the backup items and change history.</small></span></label>
            </fieldset>
          </>}
          {importError && <p className="li-form-error" role="alert">{importError}</p>}
          <div className="li-dialog-actions"><button className="li-button li-button-subtle" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="li-button li-button-primary" type="button" disabled={(storageStatus !== 'ready' && storageStatus !== 'corrupt') || (storageStatus === 'corrupt' && !recoveryAcknowledged)} onClick={confirmImport}>{storageStatus === 'corrupt' || importMode === 'replace' ? 'Restore backup' : 'Add new items'}</button></div>
        </div>}
      </dialog>
    </main>
  )
}

function Field({ label, required, help, className = '', children }: { label: string; required?: boolean; help?: string; className?: string; children: ReactNode }) {
  return <label className={`li-field ${className}`}>
    <span className="li-field-label">{label}{required && <span className="li-required" aria-hidden="true">Required</span>}</span>
    {children}
    {help && <small>{help}</small>}
  </label>
}

function InventoryRow({
  item,
  onEdit,
  onAdjust,
  onArchive,
  onRestore,
}: {
  item: InventoryItem
  onEdit: (item: InventoryItem) => void
  onAdjust: (item: InventoryItem, action: 'received' | 'used') => void
  onArchive: (item: InventoryItem) => void
  onRestore: (item: InventoryItem) => void
}) {
  const badges = item.archived ? [{ label: 'Archived', kind: 'neutral' }]
    : [
      ...(isExpired(item) ? [{ label: 'Expired', kind: 'danger' }] : []),
      ...(isLow(item) ? [{ label: 'Low stock', kind: 'warning' }] : []),
      ...(!isExpired(item) && isExpiring(item) ? [{ label: 'Expiring soon', kind: 'warning' }] : []),
      ...(!isExpired(item) && !isExpiring(item) && !isLow(item) ? [{ label: 'In range', kind: 'good' }] : []),
    ]
  const remainingDays = daysUntil(item.expiry)
  const expiryLabel = !item.expiry ? 'No expiry date' : isExpired(item) ? `Expired ${item.expiry}` : remainingDays === 0 ? 'Expires today' : item.expiry

  return <article className={`li-item-card ${item.archived ? 'li-item-archived' : ''}`} aria-label={`${item.name}, ${item.amount} ${item.unit}`} data-testid="inventory-item-card">
    <div className="li-item-main"><span className="li-item-avatar" aria-hidden="true">{item.name.slice(0, 1).toLocaleUpperCase()}</span><div><h3>{item.name}</h3><p>{item.category}{item.lot ? ` · Lot ${item.lot}` : ''}</p>{item.notes && <small className="li-item-note">{item.notes}</small>}</div></div>
    <div className="li-item-meta"><span className="li-item-meta-label">Location</span><strong>{item.location}</strong></div>
    <div className="li-item-meta"><span className="li-item-meta-label">Expiry</span><strong className={isExpired(item) ? 'li-expired-text' : ''}>{expiryLabel}</strong></div>
    <div className="li-item-stock"><span className="li-item-meta-label">In stock</span><strong>{formatQuantity(item.amount)} <small>{item.unit}</small></strong><span>Reorder at {formatQuantity(item.reorderPoint)}</span></div>
    <div className="li-item-status" aria-label="Status">{badges.map(badge => <span key={badge.label} className={`li-badge li-badge-${badge.kind}`}>{badge.label}</span>)}</div>
    <div className="li-item-actions">
      {item.archived ? <><button type="button" className="li-small-button" onClick={() => onRestore(item)}>Restore</button><button type="button" className="li-small-button" onClick={() => onEdit(item)}>Edit</button></> : <>
        <button type="button" className="li-small-button" data-testid="inventory-receive" onClick={() => onAdjust(item, 'received')}>Receive</button>
        <button type="button" className="li-small-button" data-testid="inventory-use" onClick={() => onAdjust(item, 'used')} disabled={item.amount <= 0}>Use</button>
        <button type="button" className="li-menu-button" aria-label={`More actions for ${item.name}`} title="Edit or archive" onClick={() => onArchive(item)}>Archive</button>
        <button type="button" className="li-menu-button" aria-label={`Edit ${item.name}`} title="Edit item" onClick={() => onEdit(item)}>Edit</button>
      </>}
    </div>
  </article>
}
