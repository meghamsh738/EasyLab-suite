import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import './GelLabeler.css'
import { labeledPngName, renderLabeledPng } from './exportPng'
import { createProjectJson, loadImageFile, readProjectFile, safeImageName } from './project'
import {
  ANNOTATION_COLORS,
  MAX_ANNOTATIONS,
  MAX_BAND_SIZE_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  type AnnotationColor,
  type AnnotationKind,
  type GelAnnotation,
  type GelSourceImage,
} from './types'

type GelLabelerProps = { onBack: () => void }
type Notice = { kind: 'error' | 'success' | 'info'; message: string }
type GelProjectSaveAPI = { saveGelProject?: (fileName: string, contents: ArrayBuffer) => Promise<boolean> }

function makeId(): string {
  return `label-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000)
}

function imageStem(fileName: string): string {
  return safeImageName(fileName).replace(/\.[^.]+$/, '') || 'gel-image'
}

export default function GelLabeler({ onBack }: GelLabelerProps) {
  const [source, setSource] = useState<GelSourceImage | null>(null)
  const [annotations, setAnnotations] = useState<GelAnnotation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [placementMode, setPlacementMode] = useState<AnnotationKind | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [displayScale, setDisplayScale] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const dirtyRef = useRef(false)

  const selectedAnnotation = useMemo(
    () => annotations.find(annotation => annotation.id === selectedId) ?? null,
    [annotations, selectedId],
  )
  const laneCount = annotations.filter(annotation => annotation.kind === 'lane').length
  const bandCount = annotations.filter(annotation => annotation.kind === 'band').length

  function updateDirty(value: boolean): void {
    dirtyRef.current = value
    setDirty(value)
  }

  useEffect(() => {
    const url = source?.url
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [source?.url])

  const sourceHeight = source?.height
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !sourceHeight) return
    const measure = () => setDisplayScale(stage.getBoundingClientRect().height / sourceHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [sourceHeight])

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [])

  function confirmReplace(): boolean {
    if (!dirtyRef.current) return true
    return window.confirm('This gel project has unsaved changes. Choose Cancel to keep editing, or OK to replace it and discard those changes.')
  }

  function handleBack(): void {
    if (!confirmReplace()) return
    updateDirty(false)
    onBack()
  }

  async function handleImageFile(file: File): Promise<void> {
    if (!confirmReplace()) return
    setBusy(true)
    setNotice(null)
    try {
      const nextSource = await loadImageFile(file)
      setSource(nextSource)
      setAnnotations([])
      setSelectedId(null)
      setPlacementMode(null)
      updateDirty(true)
      setNotice({ kind: 'success', message: `${nextSource.fileName} is ready. Add lane or band labels on the image.` })
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'The image could not be opened.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleProjectFile(file: File): Promise<void> {
    setBusy(true)
    setNotice(null)
    let projectUrl: string | null = null
    try {
      const project = await readProjectFile(file)
      projectUrl = project.source.url
      if (!confirmReplace()) {
        URL.revokeObjectURL(project.source.url)
        return
      }
      setSource(project.source)
      projectUrl = null
      setAnnotations(project.annotations)
      setSelectedId(project.annotations[0]?.id ?? null)
      setPlacementMode(null)
      updateDirty(false)
      setNotice({ kind: 'success', message: `Editable project opened with its original image and ${project.annotations.length} ${project.annotations.length === 1 ? 'label' : 'labels'}.` })
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'The project could not be opened.' })
    } finally {
      if (projectUrl) URL.revokeObjectURL(projectUrl)
      setBusy(false)
    }
  }

  async function handleSaveProject(): Promise<void> {
    if (!source) return
    setBusy(true)
    setNotice(null)
    try {
      const blob = await createProjectJson({ source, annotations })
      const fileName = `${imageStem(source.fileName)}.gel.json`
      const electronApi = (window as Window & { electronAPI?: GelProjectSaveAPI }).electronAPI
      const savedNatively = Boolean(electronApi?.saveGelProject)
      if (electronApi?.saveGelProject) {
        const saved = await electronApi.saveGelProject(fileName, await blob.arrayBuffer())
        if (!saved) {
          setNotice({ kind: 'info', message: 'Project save canceled. Your labels are still open and the unsaved warning remains.' })
          return
        }
      } else {
        saveBlob(blob, fileName)
      }
      updateDirty(false)
      setNotice({
        kind: 'success',
        message: savedNatively
          ? 'Editable project saved with the original image and all labels.'
          : 'Editable project download started. Wait for the browser download to finish before leaving.',
      })
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'The editable project could not be saved.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleExportPng(): Promise<void> {
    if (!source) return
    setBusy(true)
    setNotice(null)
    try {
      const blob = await renderLabeledPng(source, annotations)
      saveBlob(blob, labeledPngName(source.fileName))
      setNotice({
        kind: 'success',
        message: dirtyRef.current
          ? 'Labeled PNG downloaded at the original pixel size. The editable project still has unsaved changes.'
          : 'Labeled PNG downloaded at the original pixel size.',
      })
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'The labeled PNG could not be downloaded.' })
    } finally {
      setBusy(false)
    }
  }

  function addAnnotation(kind: AnnotationKind): void {
    if (busy) return
    if (!source) {
      setNotice({ kind: 'info', message: 'Choose an image before placing labels.' })
      return
    }
    if (annotations.length >= MAX_ANNOTATIONS) {
      setNotice({ kind: 'error', message: `A project can contain up to ${MAX_ANNOTATIONS} labels.` })
      return
    }
    setPlacementMode(kind)
    setNotice({ kind: 'info', message: `Click on the image to place a ${kind === 'lane' ? 'lane label' : 'band label'}.` })
  }

  function placeAnnotation(event: MouseEvent<HTMLDivElement>): void {
    if (busy || !placementMode || !source) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    const number = annotations.filter(annotation => annotation.kind === placementMode).length + 1
    const annotation: GelAnnotation = {
      id: makeId(),
      kind: placementMode,
      x,
      y,
      label: placementMode === 'lane' ? `Lane ${number}` : `Band ${number}`,
      bandSize: '',
      note: '',
      color: placementMode === 'lane' ? 'yellow' : 'mint',
    }
    setAnnotations(current => [...current, annotation])
    setSelectedId(annotation.id)
    setPlacementMode(null)
    updateDirty(true)
    setNotice({ kind: 'info', message: `${annotation.label} placed. Use the label editor to add details or adjust its position.` })
  }

  function updateAnnotation(id: string, changes: Partial<Omit<GelAnnotation, 'id'>>): void {
    if (busy) return
    setAnnotations(current => current.map(annotation => annotation.id === id ? { ...annotation, ...changes } : annotation))
    updateDirty(true)
  }

  function nudgeAnnotation(id: string, horizontal: number, vertical: number): void {
    const annotation = annotations.find(item => item.id === id)
    if (!annotation) return
    updateAnnotation(id, {
      x: Math.min(1, Math.max(0, annotation.x + horizontal)),
      y: Math.min(1, Math.max(0, annotation.y + vertical)),
    })
  }

  function removeAnnotation(id: string): void {
    if (busy) return
    setAnnotations(current => current.filter(annotation => annotation.id !== id))
    setSelectedId(current => current === id ? null : current)
    updateDirty(true)
  }

  function moveWithPointer(event: PointerEvent<HTMLButtonElement>, id: string): void {
    if (busy || placementMode || !source || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!bounds) return
    updateAnnotation(id, {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    })
  }

  function handleAnnotationKeyDown(event: KeyboardEvent<HTMLButtonElement>, annotation: GelAnnotation): void {
    const step = event.shiftKey ? 0.05 : 0.01
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const movement = moves[event.key]
    if (movement) {
      event.preventDefault()
      nudgeAnnotation(annotation.id, movement[0], movement[1])
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      removeAnnotation(annotation.id)
    }
  }

  return (
    <main className="gel-labeler" aria-busy={busy}>
      <header className="gel-header">
        <button className="gel-back" type="button" onClick={handleBack} disabled={busy} aria-label="Back to tools">
          <span aria-hidden="true">←</span> Back to tools
        </button>
        <div className="gel-title-group">
          <div className="gel-title-line">
            <h1>Gel Labeler</h1>
            {dirty && <span className="gel-unsaved">Unsaved changes</span>}
          </div>
          <p className="gel-subtitle">Add clear, editable labels to gel and blot images.</p>
        </div>
      </header>

      <section className="gel-toolbar" aria-label="Image and project actions">
        <div className="gel-toolbar-group">
          <input
            ref={imageInputRef}
            className="gel-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            aria-label="Choose gel or blot image"
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              if (file) void handleImageFile(file)
              event.currentTarget.value = ''
            }}
          />
          <button className="gel-button gel-button-primary" type="button" onClick={() => imageInputRef.current?.click()} disabled={busy}>
            <span aria-hidden="true">＋</span> Choose image
          </button>
          <input
            ref={projectInputRef}
            className="gel-file-input"
            type="file"
            accept="application/json,.json"
            aria-label="Open Gel Labeler project"
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              if (file) void handleProjectFile(file)
              event.currentTarget.value = ''
            }}
          />
          <button className="gel-button gel-button-secondary" type="button" onClick={() => projectInputRef.current?.click()} disabled={busy}>
            Open project
          </button>
        </div>
        <div className="gel-toolbar-group gel-toolbar-save">
          <button className="gel-button gel-button-secondary" type="button" onClick={() => void handleSaveProject()} disabled={!source || busy}>
            Save project
          </button>
          <button className="gel-button gel-button-dark" type="button" onClick={() => void handleExportPng()} disabled={!source || busy}>
            Download labeled PNG <span aria-hidden="true">↓</span>
          </button>
        </div>
      </section>

      {notice && <div className={`gel-notice gel-notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</div>}

      {!source ? (
        <section className="gel-empty-panel" aria-labelledby="gel-empty-title">
          <div className="gel-empty-art" aria-hidden="true">
            <span className="gel-art-lane gel-art-lane-one" />
            <span className="gel-art-lane gel-art-lane-two" />
            <span className="gel-art-lane gel-art-lane-three" />
            <span className="gel-art-band gel-art-band-one" />
            <span className="gel-art-band gel-art-band-two" />
            <span className="gel-art-band gel-art-band-three" />
          </div>
          <div className="gel-empty-copy">
            <h2 id="gel-empty-title">Label a gel or blot image</h2>
            <p>Choose a PNG, JPEG, or WebP image from this device. Your original is kept inside the editable project file.</p>
            <button className="gel-button gel-button-primary" type="button" onClick={() => imageInputRef.current?.click()} disabled={busy}>
              Choose an image
            </button>
            <span className="gel-limit-note">Up to 20 MB · 24 megapixels · PNG, JPEG, WebP</span>
          </div>
        </section>
      ) : (
        <div className="gel-workspace">
          <section className="gel-canvas-panel" aria-labelledby="gel-image-title">
            <div className="gel-panel-heading">
              <div>
                <p className="gel-eyebrow">LABEL CANVAS</p>
                <h2 id="gel-image-title">{source.fileName}</h2>
              </div>
              <span className="gel-image-dimensions">{source.width.toLocaleString()} × {source.height.toLocaleString()} px</span>
            </div>
            <div className={`gel-stage-frame ${placementMode ? 'gel-stage-frame-placement' : ''}`}>
              <div
                ref={stageRef}
                className={`gel-stage ${placementMode ? 'gel-stage-placement' : ''}`}
                data-testid="gel-stage"
                role="group"
                aria-label={placementMode ? `Image canvas. Click to place ${placementMode === 'lane' ? 'a lane label' : 'a band label'}.` : `Original image canvas. ${source.width} by ${source.height} pixels.`}
                onClick={placeAnnotation}
              >
                <img className="gel-source-image" src={source.url} alt={`Original gel or blot image: ${source.fileName}`} draggable="false" />
                {annotations.map(annotation => {
                  const color = ANNOTATION_COLORS[annotation.color]
                  const horizontalTransform = annotation.x < 0.12 ? '0%' : annotation.x > 0.88 ? '-100%' : '-50%'
                  const verticalTransform = annotation.y < 0.12 ? '0%' : annotation.y > 0.88 ? '-100%' : '-50%'
                  const fontSize = Math.max(10, Math.min(48, source.height * 0.032 * displayScale))
                  return (
                    <button
                      key={annotation.id}
                      className={`gel-annotation ${selectedId === annotation.id ? 'gel-annotation-selected' : ''}`}
                      data-testid={selectedId === annotation.id ? 'gel-annotation' : undefined}
                      type="button"
                      disabled={busy}
                      aria-pressed={selectedId === annotation.id}
                      aria-label={`${annotation.kind === 'lane' ? 'Lane label' : 'Band label'} ${annotation.label}. Use arrow keys to move, Shift plus arrow keys for a larger move, or Delete to remove.`}
                      style={{
                        left: `${annotation.x * 100}%`,
                        top: `${annotation.y * 100}%`,
                        transform: `translate(${horizontalTransform}, ${verticalTransform})`,
                        fontSize: `${fontSize}px`,
                        backgroundColor: color.background,
                        borderColor: color.border,
                      }}
                      onPointerDown={event => {
                        event.stopPropagation()
                        if (busy || placementMode) return
                        setSelectedId(annotation.id)
                        event.currentTarget.setPointerCapture(event.pointerId)
                      }}
                      onPointerMove={event => moveWithPointer(event, annotation.id)}
                      onClick={event => { event.stopPropagation(); setSelectedId(annotation.id) }}
                      onKeyDown={event => handleAnnotationKeyDown(event, annotation)}
                    >
                      <span className="gel-annotation-name">{annotation.label}</span>
                      {annotation.bandSize && <span className="gel-annotation-detail">{annotation.bandSize}</span>}
                      {annotation.note && <span className="gel-annotation-note">{annotation.note}</span>}
                    </button>
                  )
                })}
                {annotations.length === 0 && !placementMode && <span className="gel-canvas-hint">Choose a label type, then click on the image</span>}
              </div>
            </div>
            <div className="gel-canvas-footer">
              <span><strong>{annotations.length}</strong> {annotations.length === 1 ? 'label' : 'labels'} · {laneCount} {laneCount === 1 ? 'lane' : 'lanes'} · {bandCount} {bandCount === 1 ? 'band' : 'bands'}</span>
            </div>
          </section>

          <aside className="gel-inspector" aria-label="Label controls">
            <section className="gel-place-tools">
              <div className="gel-section-heading">
                <div><h2>Place a label</h2><p>Select a type, then click on the image.</p></div>
              </div>
              <div className="gel-place-buttons">
                <button
                  className={`gel-place-button ${placementMode === 'lane' ? 'gel-place-button-active' : ''}`}
                  type="button"
                  aria-label="Place lane label"
                  onClick={() => placementMode === 'lane' ? setPlacementMode(null) : addAnnotation('lane')}
                  disabled={!source || busy}
                  aria-pressed={placementMode === 'lane'}
                ><span aria-hidden="true">↕</span><span><strong>Lane label</strong><small>{laneCount} placed</small></span></button>
                <button
                  className={`gel-place-button ${placementMode === 'band' ? 'gel-place-button-active' : ''}`}
                  type="button"
                  aria-label="Place band label"
                  onClick={() => placementMode === 'band' ? setPlacementMode(null) : addAnnotation('band')}
                  disabled={!source || busy}
                  aria-pressed={placementMode === 'band'}
                ><span aria-hidden="true">━</span><span><strong>Band label</strong><small>{bandCount} placed</small></span></button>
              </div>
              {placementMode && <button className="gel-cancel-place" type="button" onClick={() => setPlacementMode(null)} disabled={busy}>Cancel placement</button>}
            </section>

            <section className="gel-label-list-section">
              <div className="gel-section-heading">
                <div><h2>Labels <span className="gel-count-badge">{annotations.length}</span></h2><p>Select a label to edit its details.</p></div>
              </div>
              {annotations.length ? (
                <ul className="gel-label-list" aria-label="Placed labels">
                  {annotations.map((annotation, index) => (
                    <li key={annotation.id}>
                      <button className={`gel-label-row ${selectedId === annotation.id ? 'gel-label-row-active' : ''}`} type="button" disabled={busy} aria-pressed={selectedId === annotation.id} onClick={() => setSelectedId(annotation.id)}>
                        <span className={`gel-label-swatch gel-swatch-${annotation.color}`} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                        <span className="gel-label-row-copy"><strong>{annotation.label}</strong><small>{annotation.kind === 'lane' ? 'Lane' : annotation.bandSize || 'Band'}</small></span>
                        <span className="gel-label-row-chevron" aria-hidden="true">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="gel-list-empty">No labels yet. Add one above, then click the image to place it.</p>
              )}
            </section>

            {selectedAnnotation && (
              <section className="gel-editor-section" aria-labelledby="gel-editor-heading">
                <div className="gel-section-heading gel-section-heading-editor">
                  <div><h2 id="gel-editor-heading">Edit label</h2><p>{selectedAnnotation.kind === 'lane' ? 'Lane annotation' : 'Band annotation'}</p></div>
                </div>
                <label className="gel-field">
                  <span>Label name</span>
                  <input aria-label="Label name" type="text" maxLength={MAX_LABEL_LENGTH} value={selectedAnnotation.label} disabled={busy} onChange={event => updateAnnotation(selectedAnnotation.id, { label: event.currentTarget.value })} />
                </label>
                {selectedAnnotation.kind === 'band' && (
                  <label className="gel-field">
                    <span>Band size <small>optional</small></span>
                    <input aria-label="Band size" type="text" maxLength={MAX_BAND_SIZE_LENGTH} value={selectedAnnotation.bandSize} placeholder="e.g. 42 kDa" disabled={busy} onChange={event => updateAnnotation(selectedAnnotation.id, { bandSize: event.currentTarget.value })} />
                  </label>
                )}
                <label className="gel-field">
                  <span>Notes <small>optional</small></span>
                  <textarea aria-label="Notes" rows={3} maxLength={MAX_NOTE_LENGTH} value={selectedAnnotation.note} placeholder="Add a short descriptive note" disabled={busy} onChange={event => updateAnnotation(selectedAnnotation.id, { note: event.currentTarget.value })} />
                  <small className="gel-char-count">{selectedAnnotation.note.length}/{MAX_NOTE_LENGTH}</small>
                </label>
                <fieldset className="gel-color-field">
                  <legend>Label color</legend>
                  <div className="gel-color-options" role="radiogroup" aria-label="Label color">
                    {(Object.keys(ANNOTATION_COLORS) as AnnotationColor[]).map(color => (
                      <button
                        key={color}
                        className={`gel-color-choice gel-color-${color}`}
                        type="button"
                        role="radio"
                        aria-checked={selectedAnnotation.color === color}
                        aria-label={`${ANNOTATION_COLORS[color].name} label`}
                        disabled={busy}
                        onClick={() => updateAnnotation(selectedAnnotation.id, { color })}
                        onKeyDown={event => {
                          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
                          const choices = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])
                          const currentIndex = choices.indexOf(event.currentTarget)
                          const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
                          const next = choices[(currentIndex + step + choices.length) % choices.length]
                          if (next) {
                            event.preventDefault()
                            next.focus()
                            next.click()
                          }
                        }}
                      />
                    ))}
                  </div>
                </fieldset>
                <div className="gel-move-row">
                  <span>Move label</span>
                  <div className="gel-nudge-buttons" role="group" aria-label="Move selected label">
                    <button type="button" aria-label="Move label up" disabled={busy} onClick={() => nudgeAnnotation(selectedAnnotation.id, 0, -0.01)}>↑</button>
                    <button type="button" aria-label="Move label left" disabled={busy} onClick={() => nudgeAnnotation(selectedAnnotation.id, -0.01, 0)}>←</button>
                    <button type="button" aria-label="Move label down" disabled={busy} onClick={() => nudgeAnnotation(selectedAnnotation.id, 0, 0.01)}>↓</button>
                    <button type="button" aria-label="Move label right" disabled={busy} onClick={() => nudgeAnnotation(selectedAnnotation.id, 0.01, 0)}>→</button>
                  </div>
                </div>
                <p className="gel-keyboard-hint">Tip: select a label on the image and use arrow keys to move it. Hold Shift for a larger step.</p>
                <button className="gel-remove-label" type="button" disabled={busy} onClick={() => removeAnnotation(selectedAnnotation.id)}>Remove label</button>
              </section>
            )}

            <div className="gel-local-note"><span aria-hidden="true">◉</span><p>Images and editable labels stay on this device. Download a project file to save and reopen your work.</p></div>
          </aside>
        </div>
      )}
    </main>
  )
}
