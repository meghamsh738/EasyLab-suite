import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import labNotebookIcon from './assets/module-icons/labnotebook.svg'
import cdnaIcon from './assets/module-icons/cdna.svg'
import qpcrPlannerIcon from './assets/module-icons/qpcr-planner.svg'
import qpcrAnalysisIcon from './assets/module-icons/qpcr-analysis.svg'
import elisaIcon from './assets/module-icons/elisa-analysis.svg'
import animalPairingIcon from './assets/module-icons/animal-pairing.svg'
import breedingIcon from './assets/module-icons/breeding.svg'
import ymazeIcon from './assets/module-icons/ymaze.svg'

type ModuleId =
  | 'labnotebook'
  | 'cdna'
  | 'qpcr-planner'
  | 'qpcr-analysis'
  | 'elisa-analysis'
  | 'animal-pairing'
  | 'breeding'
  | 'ymaze'

type SuiteInfo = {
  name: string
  version: string
  platform: string
  isPackaged?: boolean
}

type ElectronAPI = {
  launchModule: (moduleId: ModuleId) => Promise<void>
  openModuleInSuite?: (moduleId: ModuleId) => Promise<void>
  prewarmModule?: (moduleId: ModuleId) => Promise<boolean>
  getSuiteInfo?: () => Promise<SuiteInfo>
  getAppInfo?: () => Promise<SuiteInfo>
  setZoomFactor?: (value: number) => Promise<number>
}

type ModuleGroup = 'Notebook' | 'Planning' | 'Analysis' | 'Colony' | 'Behaviour'

type ModuleDefinition = {
  id: ModuleId
  name: string
  group: ModuleGroup
  summary: string
  workflow: string
  inputs: string
  outputs: string
  accent: string
  icon: string
  tags: string[]
}

const getElectronAPI = (): ElectronAPI | null => {
  const api = (window as Window & { electronAPI?: ElectronAPI }).electronAPI
  return api ?? null
}

const MODULES: ModuleDefinition[] = [
  {
    id: 'labnotebook',
    name: 'Lab Notebook',
    group: 'Notebook',
    summary: 'Daily entries, attachments, signatures, WhatsApp and Telegram captures.',
    workflow: 'Write, import, review',
    inputs: 'Notes, images, files',
    outputs: 'Notebook state, exports',
    accent: '#3156D4',
    icon: labNotebookIcon,
    tags: ['Daily logs', 'Intake', 'Attachments'],
  },
  {
    id: 'cdna',
    name: 'cDNA Calculator',
    group: 'Planning',
    summary: 'Reaction setup and dilution calculations for cDNA runs.',
    workflow: 'Plan reactions',
    inputs: 'RNA/sample table',
    outputs: 'Master mix table',
    accent: '#C77916',
    icon: cdnaIcon,
    tags: ['Dilutions', 'Volumes', 'Export'],
  },
  {
    id: 'qpcr-planner',
    name: 'qPCR Planner',
    group: 'Planning',
    summary: '384-well layout planning with controls and gene overrides.',
    workflow: 'Build plate map',
    inputs: 'Sample list',
    outputs: 'Plate layout',
    accent: '#088B74',
    icon: qpcrPlannerIcon,
    tags: ['Layout', 'Controls', 'Overrides'],
  },
  {
    id: 'qpcr-analysis',
    name: 'qPCR Analysis',
    group: 'Analysis',
    summary: 'Ct normalization, comparisons, figures, and report exports.',
    workflow: 'Analyze run',
    inputs: 'Ct tables',
    outputs: 'Plots, report',
    accent: '#B45309',
    icon: qpcrAnalysisIcon,
    tags: ['Normalization', 'Plots', 'Report'],
  },
  {
    id: 'elisa-analysis',
    name: 'ELISA Analysis',
    group: 'Analysis',
    summary: 'Plate-reader absorbance analysis with standard curve QC.',
    workflow: 'Fit curve',
    inputs: 'Plate data',
    outputs: 'Concentrations',
    accent: '#7C3AED',
    icon: elisaIcon,
    tags: ['Standards', 'QC', 'Quantification'],
  },
  {
    id: 'animal-pairing',
    name: 'Animal Pairing',
    group: 'Colony',
    summary: 'Cohort balancing and animal pairing from colony sheets.',
    workflow: 'Group animals',
    inputs: 'CSV/XLSX',
    outputs: 'Cohort export',
    accent: '#2563EB',
    icon: animalPairingIcon,
    tags: ['Cohorts', 'Genotypes', 'Excel'],
  },
  {
    id: 'breeding',
    name: 'Breeding Pair Selector',
    group: 'Colony',
    summary: 'Breeder matching from gene targets and probability thresholds.',
    workflow: 'Select pairs',
    inputs: 'Gene catalog',
    outputs: 'Pair list',
    accent: '#168451',
    icon: breedingIcon,
    tags: ['Breeding', 'Genes', 'Probability'],
  },
  {
    id: 'ymaze',
    name: 'Y-Maze Randomizer',
    group: 'Behaviour',
    summary: 'Balanced learning/reversal schedules and exit-arm assignments.',
    workflow: 'Randomize schedule',
    inputs: 'Animal rows',
    outputs: 'CSV/Excel',
    accent: '#C0266A',
    icon: ymazeIcon,
    tags: ['Schedule', 'Randomize', 'Export'],
  },
]

const GROUPS: Array<'All' | ModuleGroup> = ['All', 'Notebook', 'Planning', 'Analysis', 'Colony', 'Behaviour']
const SUMMARIES: Record<ModuleId, string> = {
  labnotebook: 'Notes, attachments, and experiment records.',
  cdna: 'RNA dilutions and reaction setup.',
  'qpcr-planner': 'Plate layouts, controls, and master mixes.',
  'qpcr-analysis': 'Ct normalization, figures, and reports.',
  'elisa-analysis': 'Standard curves and concentration analysis.',
  'animal-pairing': 'Balanced cohorts from your colony data.',
  breeding: 'Pair selection for target genotypes.',
  ymaze: 'Balanced schedules and arm assignments.',
}
const VIEW_KEY = 'easylab.suite.library-view'
type LibraryView = { query: string; activeGroup: 'All' | ModuleGroup }
const readView = (): LibraryView => {
  try {
    const view = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null')
    if (view && typeof view.query === 'string' && GROUPS.includes(view.activeGroup)) return view
  } catch { /* The library also works when storage is unavailable. */ }
  return { query: '', activeGroup: 'All' }
}

function DesktopNotice({ module, onClose }: { module: ModuleDefinition; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
  const close = () => { dialogRef.current?.close(); onClose() }
  return (
    <dialog ref={dialogRef} className="desktop-notice" aria-labelledby="notice-title" aria-describedby="notice-detail"
      data-testid="web-modal" onCancel={event => { event.preventDefault(); close() }}
      onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); dialogRef.current?.querySelector('button')?.focus() } }}
      onClick={event => { if (event.target === event.currentTarget) close() }}>
      <img src={module.icon} alt="" width="48" height="48" />
      <h2 id="notice-title">Open in the desktop app</h2>
      <p id="notice-detail">{module.name} runs inside Easylab Suite. Open the installed app to use this tool with your local files.</p>
      <button className="primary" onClick={close}>Got it</button>
    </dialog>
  )
}

function App() {
  const electron = getElectronAPI()
  const [suiteInfo, setSuiteInfo] = useState<SuiteInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [failedModule, setFailedModule] = useState<ModuleId | null>(null)
  const [webNotice, setWebNotice] = useState<ModuleId | null>(null)
  const [{ query, activeGroup }, setView] = useState<LibraryView>(readView)
  const [launchingModule, setLaunchingModule] = useState<ModuleId | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const launchingRef = useRef(false)

  const loadSuiteInfo = useCallback(async () => {
    if (!electron) return
    try {
      const info = electron.getSuiteInfo ? await electron.getSuiteInfo() : await electron.getAppInfo?.()
      if (info) setSuiteInfo(info)
      setErrorMessage('')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load suite information.')
    }
  }, [electron])

  useEffect(() => { void loadSuiteInfo() }, [loadSuiteInfo])
  useEffect(() => {
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ query, activeGroup })) } catch { /* Optional UI preference. */ }
  }, [query, activeGroup])
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !webNotice) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [webNotice])

  const filteredModules = useMemo(() => {
    const term = query.trim().toLowerCase()
    return MODULES.filter(module => (activeGroup === 'All' || module.group === activeGroup) &&
      [module.name, module.group, module.summary, SUMMARIES[module.id], module.workflow, module.inputs, module.outputs, ...module.tags].join(' ').toLowerCase().includes(term))
  }, [activeGroup, query])

  const handleLaunch = async (moduleId: ModuleId) => {
    if (launchingRef.current) return
    if (!electron) { setWebNotice(moduleId); return }
    launchingRef.current = true
    setLaunchingModule(moduleId)
    setErrorMessage('')
    setFailedModule(null)
    try {
      if (electron.openModuleInSuite) await electron.openModuleInSuite(moduleId)
      else await electron.launchModule(moduleId)
    } catch (err) {
      setFailedModule(moduleId)
      setErrorMessage(err instanceof Error ? err.message : 'Unable to open this tool. Please try again.')
    } finally {
      launchingRef.current = false
      setLaunchingModule(null)
    }
  }
  const handlePrewarm = (moduleId: ModuleId) => {
    if (!electron?.prewarmModule || launchingRef.current) return
    void electron.prewarmModule(moduleId).catch(() => { /* Opening the tool reports startup failures. */ })
  }
  const activeNotice = MODULES.find(module => module.id === webNotice)
  const resetView = () => { setView({ query: '', activeGroup: 'All' }); searchRef.current?.focus() }

  return (
    <div className="suite" data-testid="suite-root">
      <a className="skip-link" href="#tool-library">Skip to tools</a>
      <aside className="suite-rail" aria-label="Suite navigation">
        <div className="brand-lockup"><span className="suite-mark" aria-hidden="true">EL</span><h1>Easylab Suite</h1></div>
        <p className="nav-label">Browse</p>
        <nav className="rail-nav" aria-label="Tool categories">
          {GROUPS.map(group => (
            <button key={group} type="button" aria-pressed={activeGroup === group}
              onClick={() => setView(view => ({ ...view, activeGroup: group }))}>
              <span>{group === 'All' ? 'All tools' : group}</span>
              <span className="nav-count">{group === 'All' ? MODULES.length : MODULES.filter(module => module.group === group).length}</span>
            </button>
          ))}
        </nav>
        <footer className="rail-signature" data-testid="suite-signature">
          <p className="build-label">{electron ? (suiteInfo ? `Version ${suiteInfo.version}` : 'Desktop app') : 'Web preview'}</p>
          <span>Made by Meghamsh Teja Konda</span>
          <a href="mailto:meghamshteja555@gmail.com">Contact</a>
        </footer>
      </aside>

      <main className="suite-workspace" id="tool-library" tabIndex={-1}>
        <header className="suite-header">
          <h2>Your lab workspace</h2>
          <p>Plan experiments, work with your data, and keep a clear record.</p>
        </header>
        <div className="search-row" role="search">
          <label htmlFor="module-search" className="sr-only">Search tools or workflows</label>
          <input id="module-search" ref={searchRef} type="search" value={query} autoComplete="off"
            placeholder="Search tools or workflows" onChange={event => setView(view => ({ ...view, query: event.target.value }))} />
          {query ? <button className="clear-search" aria-label="Clear search" onClick={() => { setView(view => ({ ...view, query: '' })); searchRef.current?.focus() }}>Clear</button>
            : <kbd aria-hidden="true">⌘ / Ctrl K</kbd>}
        </div>

        {errorMessage && <div className="suite-banner error" role="alert" data-testid="suite-error">
          <div><strong>{failedModule ? 'Tool could not open' : 'Suite information unavailable'}</strong><p>{errorMessage}</p></div>
          <button onClick={() => failedModule ? void handleLaunch(failedModule) : void loadSuiteInfo()}>Try again</button>
        </div>}
        {launchingModule && <p className="launch-status" role="status">Opening {MODULES.find(module => module.id === launchingModule)?.name}…</p>}

        <div className="library-heading">
          <h2>{query.trim() ? 'Search results' : activeGroup === 'All' ? 'All tools' : activeGroup}</h2>
          <p role="status">{filteredModules.length} {filteredModules.length === 1 ? 'tool' : 'tools'}{query.trim() ? ` matching “${query.trim()}”` : ''}</p>
        </div>
        <section className="module-library" aria-label="Suite modules" aria-busy={Boolean(launchingModule)}>
          {filteredModules.map(module => (
            <article className="module-row" key={module.id} data-testid={`module-card-${module.id}`}>
              <img className="module-icon" src={module.icon} alt="" width="44" height="44" />
              <h3>{module.name}</h3>
              <p className="module-summary">{SUMMARIES[module.id]}</p>
              <span className="module-group">{module.group}</span>
              <button className="primary" data-testid={`module-launch-${module.id}`} aria-label={`Open ${module.name}`}
                onMouseEnter={() => handlePrewarm(module.id)} onFocus={() => handlePrewarm(module.id)}
                onClick={() => void handleLaunch(module.id)} disabled={Boolean(launchingModule)}>
                {launchingModule === module.id ? 'Opening…' : 'Open'}
              </button>
            </article>
          ))}
          {filteredModules.length === 0 && <div className="empty" data-testid="suite-empty">
            <h3>No matching tools</h3><p>Try a tool name, a workflow, or another category.</p>
            <button className="primary" onClick={resetView}>Show all tools</button>
          </div>}
        </section>
      </main>
      {activeNotice && <DesktopNotice module={activeNotice} onClose={() => setWebNotice(null)} />}
    </div>
  )
}

export default App
