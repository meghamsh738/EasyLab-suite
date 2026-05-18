import { useCallback, useEffect, useMemo, useState } from 'react'
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
const RAIL_ITEMS: Array<'All' | ModuleGroup> = ['All', 'Notebook', 'Planning', 'Analysis', 'Colony', 'Behaviour']

const INTAKE_STATUS = [
  { name: 'WhatsApp', detail: 'Text and image intake', state: 'Ready', accent: '#16a34a' },
  { name: 'Telegram', detail: 'Text and image intake', state: 'Ready', accent: '#0284c7' },
]

const fallbackInfo: SuiteInfo = {
  name: 'Easylab Suite',
  version: 'Web preview',
  platform: 'web',
}

function App() {
  const electron = getElectronAPI()
  const [suiteInfo, setSuiteInfo] = useState<SuiteInfo>(fallbackInfo)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => (electron ? 'loading' : 'ready'))
  const [errorMessage, setErrorMessage] = useState('')
  const [webNotice, setWebNotice] = useState<ModuleId | null>(null)
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState<'All' | ModuleGroup>('All')
  const [launchingModule, setLaunchingModule] = useState<ModuleId | null>(null)

  const loadSuiteInfo = useCallback(async () => {
    if (!electron) return

    try {
      const info = electron.getSuiteInfo ? await electron.getSuiteInfo() : await electron.getAppInfo?.()
      if (info) setSuiteInfo(info)
      setStatus('ready')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load suite information.')
      setStatus('error')
    }
  }, [electron])

  useEffect(() => {
    if (!electron) return
    loadSuiteInfo()
  }, [electron, loadSuiteInfo])

  const filteredModules = useMemo(() => {
    const term = query.trim().toLowerCase()
    return MODULES.filter((module) => {
      const groupMatch = activeGroup === 'All' || module.group === activeGroup
      if (!groupMatch) return false
      if (!term) return true
      const haystack = [
        module.name,
        module.group,
        module.summary,
        module.workflow,
        module.inputs,
        module.outputs,
        ...module.tags,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [activeGroup, query])

  const groupedModules = useMemo(() => {
    const groups = new Map<ModuleGroup, ModuleDefinition[]>()
    filteredModules.forEach((module) => {
      const items = groups.get(module.group) ?? []
      groups.set(module.group, [...items, module])
    })
    return Array.from(groups.entries())
  }, [filteredModules])

  const statusLabel = useMemo(() => {
    if (status === 'loading') return 'Loading'
    if (status === 'error') return 'Needs review'
    return 'Ready'
  }, [status])

  const handleLaunch = async (moduleId: ModuleId) => {
    if (!electron) {
      setWebNotice(moduleId)
      return
    }
    try {
      setLaunchingModule(moduleId)
      if (electron.openModuleInSuite) {
        await electron.openModuleInSuite(moduleId)
      } else {
        await electron.launchModule(moduleId)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to launch module.')
      setStatus('error')
    } finally {
      setLaunchingModule(null)
    }
  }

  const handlePrewarm = (moduleId: ModuleId) => {
    if (!electron?.prewarmModule || launchingModule) return
    void electron.prewarmModule(moduleId)
  }

  const activeNotice = webNotice ? MODULES.find((module) => module.id === webNotice) : null

  return (
    <div className="suite" data-testid="suite-root">
      <div className="suite-shell">
        <aside className="suite-rail" aria-label="Suite navigation">
          <div className="brand-lockup rail-brand" aria-label="Easylab Suite">
            <div className="suite-mark">EL</div>
            <div>
              <h1>Easylab Suite</h1>
              <p>
                {suiteInfo.version} / {suiteInfo.platform}
              </p>
            </div>
          </div>

          <nav className="rail-nav" aria-label="Module groups">
            {RAIL_ITEMS.map((group) => {
              const count = group === 'All' ? MODULES.length : MODULES.filter((module) => module.group === group).length
              return (
                <button
                  key={group}
                  type="button"
                  className={group === activeGroup ? 'active' : ''}
                  onClick={() => setActiveGroup(group)}
                >
                  <span>{group === 'All' ? 'Command Center' : group}</span>
                  <strong>{count}</strong>
                </button>
              )
            })}
          </nav>

          <section className="rail-card" aria-label="Local data status">
            <div className="rail-card-head">
              <span>Local data</span>
              <strong>Device only</strong>
            </div>
            <p>Notebook files, module outputs, and intake captures stay on this laptop.</p>
            <div className="rail-metric">
              <span>Database</span>
              <strong>Ready</strong>
            </div>
            <div className="rail-metric">
              <span>Storage</span>
              <strong>Local</strong>
            </div>
          </section>

          <section className="rail-card" aria-label="Intake status">
            <div className="rail-card-head">
              <span>Intake</span>
              <strong>Live</strong>
            </div>
            <div className="intake-list">
              {INTAKE_STATUS.map((item) => (
                <div className="intake-row" key={item.name} style={{ ['--accent' as string]: item.accent }}>
                  <span className="intake-dot" />
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <em>{item.state}</em>
                </div>
              ))}
            </div>
          </section>

          <footer className="rail-signature" data-testid="suite-signature">
            <span>Made by Meghamsh Teja Konda</span>
            <a href="mailto:meghamshteja555@gmail.com">meghamshteja555@gmail.com</a>
          </footer>
        </aside>

        <div className="suite-workspace">
          <header className="suite-header">
            <div>
              <p className="eyebrow">Command Center</p>
              <h2>Overview of lab apps and local intake</h2>
            </div>

            <div className="suite-status" data-testid="suite-status">
              <span className={`status-dot status-${status}`} />
              <span>{statusLabel}</span>
            </div>
          </header>

          <section className="command-surface" aria-label="Module command surface">
            <label className="module-search">
              <span>Search modules</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Notebook, qPCR, ELISA, colony..."
              />
            </label>

            <div className="group-tabs" aria-label="Module groups">
              {GROUPS.map((group) => (
                <button
                  key={group}
                  type="button"
                  className={group === activeGroup ? 'active' : ''}
                  onClick={() => setActiveGroup(group)}
                >
                  {group}
                </button>
              ))}
            </div>

            <div className="ops-strip" aria-label="Workspace summary">
              <div>
                <span>Modules</span>
                <strong>{MODULES.length}</strong>
              </div>
              <div>
                <span>Data</span>
                <strong>Local</strong>
              </div>
              <div>
                <span>Intake</span>
                <strong>WhatsApp + Telegram</strong>
              </div>
            </div>
          </section>

          {status === 'loading' && (
            <div className="suite-banner" data-testid="suite-loading">
              Loading suite configuration.
            </div>
          )}

          {status === 'error' && (
            <div className="suite-banner error" data-testid="suite-error">
              <div>
                <strong>Suite needs attention.</strong> {errorMessage}
              </div>
              <button type="button" className="ghost" onClick={loadSuiteInfo}>
                Retry
              </button>
            </div>
          )}

          <main className="module-console" aria-label="Suite modules">
            {groupedModules.map(([group, modules]) => (
              <section className="module-section" key={group} aria-label={`${group} modules`}>
                <div className="section-head">
                  <h2>{group}</h2>
                  <span>{modules.length}</span>
                </div>

                <div className="module-grid">
                  {modules.map((module) => (
                    <article
                      key={module.id}
                      className="module-card"
                      data-testid={`module-card-${module.id}`}
                      style={{ ['--accent' as string]: module.accent }}
                    >
                      <div className="module-card-main">
                        <div className="module-icon" aria-hidden="true">
                          <img src={module.icon} alt="" />
                        </div>
                        <div className="module-copy">
                          <h3>{module.name}</h3>
                          <p>{module.summary}</p>
                        </div>
                      </div>

                      <dl className="module-facts">
                        <div>
                          <dt>Workflow</dt>
                          <dd>{module.workflow}</dd>
                        </div>
                        <div>
                          <dt>Input</dt>
                          <dd>{module.inputs}</dd>
                        </div>
                        <div>
                          <dt>Output</dt>
                          <dd>{module.outputs}</dd>
                        </div>
                      </dl>

                      <div className="module-card-foot">
                        <div className="tag-row" aria-label={`${module.name} capabilities`}>
                          {module.tags.map((tag) => (
                            <span key={tag} className="tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="primary"
                          data-testid={`module-launch-${module.id}`}
                          onFocus={() => handlePrewarm(module.id)}
                          onMouseEnter={() => handlePrewarm(module.id)}
                          onClick={() => handleLaunch(module.id)}
                          disabled={launchingModule === module.id}
                        >
                          {launchingModule === module.id ? 'Opening' : 'Open'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </main>

          {filteredModules.length === 0 && (
            <section className="empty" data-testid="suite-empty">
              <h2>No matching modules</h2>
              <p>Clear search or choose another group.</p>
            </section>
          )}
        </div>
      </div>

      {activeNotice && (
        <div className="modal" role="dialog" aria-modal="true" data-testid="web-modal">
          <div className="modal-card">
            <h2>Desktop required</h2>
            <p>{activeNotice.name} launches inside the Easylab desktop app.</p>
            <button type="button" className="primary" onClick={() => setWebNotice(null)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
