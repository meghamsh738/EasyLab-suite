import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

/* eslint-disable react-hooks/set-state-in-effect */

type ModuleId =
  | 'labnotebook'
  | 'cdna'
  | 'qpcr-planner'
  | 'qpcr-analysis'
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
  getSuiteInfo?: () => Promise<SuiteInfo>
  getAppInfo?: () => Promise<SuiteInfo>
}

const getElectronAPI = (): ElectronAPI | null => {
  const api = (window as Window & { electronAPI?: ElectronAPI }).electronAPI
  return api ?? null
}

const MODULES: Array<{
  id: ModuleId
  name: string
  summary: string
  description: string
  accent: string
  tags: string[]
}> = [
  {
    id: 'labnotebook',
    name: 'Lab Notebook',
    summary: 'Offline-first experiment logs with signatures and attachments.',
    description: 'Capture protocols, observations, and approvals with a clean timeline view.',
    accent: '#A7B6FF',
    tags: ['Experiments', 'Signatures', 'Attachments']
  },
  {
    id: 'cdna',
    name: 'cDNA Calculator',
    summary: 'Plan master mixes, dilutions, and reaction volumes in minutes.',
    description: 'Build cDNA runs with consistent volumes, templates, and export-ready tables.',
    accent: '#F7C97A',
    tags: ['Master mix', 'Dilutions', 'Exports']
  },
  {
    id: 'qpcr-planner',
    name: 'qPCR Planner',
    summary: 'Design 384-well layouts and gene plate overrides without guesswork.',
    description: 'Paste sample lists, set controls, and get multi-plate layouts instantly.',
    accent: '#79D6C1',
    tags: ['Plate layout', 'Controls', 'Overrides']
  },
  {
    id: 'qpcr-analysis',
    name: 'qPCR Analysis',
    summary: 'Analyze Ct tables, normalize runs, and export figures fast.',
    description: 'Load sample sheets, map genes, and generate ready-to-share reports.',
    accent: '#E18A3D',
    tags: ['Normalization', 'Plots', 'Reports']
  },
  {
    id: 'animal-pairing',
    name: 'Animal Pairing',
    summary: 'Balance cohorts or generate breeding pairs from colony sheets.',
    description: 'Upload CSV/XLSX, filter genotypes, and export grouped animals or male/female pairs.',
    accent: '#60A5FA',
    tags: ['Cohorts', 'Genotypes', 'Excel export']
  },
  {
    id: 'breeding',
    name: 'Breeding Pair Selector',
    summary: 'Target a genotype and surface direct + indirect breeder matches.',
    description: 'Manage a gene catalog, apply probability thresholds, and export recommended breeder pairs.',
    accent: '#34D399',
    tags: ['Breeding', 'Genes', 'Probabilities']
  },
  {
    id: 'ymaze',
    name: 'Y-Maze Randomizer',
    summary: 'Generate balanced learning/reversal schedules and exit-arm assignments.',
    description: 'Paste animal rows, tune day/trial counts, and export CSV/Excel schedules per day.',
    accent: '#F472B6',
    tags: ['Scheduling', 'Randomization', 'CSV/Excel']
  }
]

const fallbackInfo: SuiteInfo = {
  name: 'Easylab Suite',
  version: 'Web preview',
  platform: 'web'
}

function App() {
  const electron = getElectronAPI()
  const [suiteInfo, setSuiteInfo] = useState<SuiteInfo>(fallbackInfo)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => (electron ? 'loading' : 'ready'))
  const [errorMessage, setErrorMessage] = useState('')
  const [webNotice, setWebNotice] = useState<ModuleId | null>(null)

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

  const statusLabel = useMemo(() => {
    if (status === 'loading') return 'Loading suite modules…'
    if (status === 'error') return 'Suite offline'
    return 'All modules ready'
  }, [status])

  const handleLaunch = async (moduleId: ModuleId) => {
    if (!electron) {
      setWebNotice(moduleId)
      return
    }
    try {
      await electron.launchModule(moduleId)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to launch module.')
      setStatus('error')
    }
  }

  const activeNotice = webNotice ? MODULES.find((module) => module.id === webNotice) : null

  return (
    <div className="suite" data-testid="suite-root">
      <header className="suite-hero">
        <div className="hero-top">
          <div className="hero-badge">Easylab</div>
          <div className="hero-meta">
            <span>{suiteInfo.name}</span>
            <span className="dot" />
            <span>{suiteInfo.version}</span>
            <span className="dot" />
            <span>{suiteInfo.platform}</span>
          </div>
        </div>
        <div className="hero-main">
          <div>
            <h1>Easylab Suite</h1>
            <p>
              Launch every lab tool you need from a single, focused workspace. Each module opens in its own
              window with consistent storage paths and desktop-ready performance.
            </p>
          </div>
          <div className="hero-status" data-testid="suite-status">
            <span className={`status-dot status-${status}`} />
            <span>{statusLabel}</span>
          </div>
        </div>
      </header>

      {status === 'loading' && (
        <div className="suite-banner" data-testid="suite-loading">
          Syncing suite configuration…
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

      <section className="module-grid" aria-label="Suite modules">
        {MODULES.map((module) => (
          <article
            key={module.id}
            className="module-card"
            data-testid={`module-card-${module.id}`}
            style={{ ['--accent' as string]: module.accent }}
          >
            <div className="card-header">
              <div className="card-title">
                <div className="module-icon" aria-hidden="true" />
                <div>
                  <h2>{module.name}</h2>
                  <p className="summary">{module.summary}</p>
                </div>
              </div>
              <button
                type="button"
                className="primary"
                data-testid={`module-launch-${module.id}`}
                onClick={() => handleLaunch(module.id)}
              >
                Launch
              </button>
            </div>
            <p className="description">{module.description}</p>
            <div className="tag-row" aria-label={`${module.name} capabilities`}>
              {module.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      {MODULES.length === 0 && (
        <section className="empty" data-testid="suite-empty">
          <h2>No modules configured</h2>
          <p>Add module paths in the desktop installer to enable tools.</p>
        </section>
      )}

      <section className="suite-footer">
        <div>
          <h3>Workspace defaults</h3>
          <p>Storage paths follow your Documents/Easylab directory with module-specific subfolders.</p>
        </div>
        <div className="footer-cards">
          <div className="footer-card">
            <span className="label">Status</span>
            <strong>{status === 'ready' ? 'Operational' : status === 'loading' ? 'Connecting' : 'Needs review'}</strong>
          </div>
          <div className="footer-card">
            <span className="label">Security</span>
            <strong>Local-only data</strong>
          </div>
          <div className="footer-card">
            <span className="label">Exports</span>
            <strong>CSV, Excel, PDF</strong>
          </div>
        </div>
      </section>

      <footer className="suite-signature" data-testid="suite-signature">
        <span className="sig-primary">Made by Meghamsh Teja Konda</span>
        <span className="sig-dot" aria-hidden="true" />
        <a className="sig-link" href="mailto:meghamshteja555@gmail.com">
          meghamshteja555@gmail.com
        </a>
      </footer>

      {activeNotice && (
        <div className="modal" role="dialog" aria-modal="true" data-testid="web-modal">
          <div className="modal-card">
            <h2>Desktop required</h2>
            <p>
              {activeNotice.name} launches inside the Easylab desktop app. Install the Windows build to open
              this module.
            </p>
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
