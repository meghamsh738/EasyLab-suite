const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const net = require('net')
const path = require('path')

const isDev = !app.isPackaged
const rootDir = path.join(__dirname, '..', '..')
const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
const { access: accessFile, readFile } = fs.promises

const STATIC_MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const MODULES = {
  labnotebook: {
    id: 'labnotebook',
    label: 'Lab Notebook',
    storage: 'Lab Notebook',
    type: 'static',
    tutorial: {
      title: 'Lab Notebook Tutorial',
      intro: 'Track experiments with local-first storage and structured notes.',
      steps: [
        'Click "Today entry" to start a dated note in seconds.',
        'Use guided sections for setup, procedure, observations, and next steps.',
        'Open Settings to configure storage paths and sync folder defaults.',
      ],
    },
  },
  cdna: {
    id: 'cdna',
    label: 'cDNA Calculator',
    storage: 'cDNA',
    type: 'fastapi',
    port: 8011,
    tutorial: {
      title: 'cDNA Calculator Tutorial',
      intro: 'Paste concentrations, set target RNA, and generate export-ready mix tables.',
      steps: [
        'Paste sample concentrations or enable the example input.',
        'Set target RNA and overage, then click "Calculate volumes".',
        'Review outputs and export CSV or Excel from the actions panel.',
      ],
    },
  },
  'qpcr-planner': {
    id: 'qpcr-planner',
    label: 'qPCR Planner',
    storage: 'qPCR Planner',
    type: 'fastapi',
    port: 8012,
    tutorial: {
      title: 'qPCR Planner Tutorial',
      intro: 'Build 384-well layouts and compute per-gene mix totals quickly.',
      steps: [
        'Paste sample labels or set sample count for generated placeholders.',
        'Add genes, controls, replicates, and optional plate overrides.',
        'Click "Compute layout", then review plate preview and export TSV.',
      ],
    },
  },
  'qpcr-analysis': {
    id: 'qpcr-analysis',
    label: 'qPCR Analysis',
    storage: 'qPCR Analysis',
    type: 'streamlit',
    port: 8501,
    tutorial: {
      title: 'qPCR Analysis Tutorial',
      intro: 'Go from raw Cq data to normalized results and a final report.',
      steps: [
        'Choose example/upload/paste input from the sidebar.',
        'Clean wells, review replicate stats, and fit standard curves.',
        'Quantify samples, normalize to reference gene, then export Excel.',
      ],
    },
  },
  'elisa-analysis': {
    id: 'elisa-analysis',
    label: 'ELISA Analysis',
    storage: 'ELISA Analysis',
    type: 'static',
    tutorial: {
      title: 'ELISA Analysis Tutorial',
      intro: 'Map wells first, then run absorbance analysis with QC controls.',
      steps: [
        'Configure layout tab with sample columns and manual standard assignments.',
        'Switch to analysis tab and paste reader output for 450/570 workflow.',
        'Inspect QC flags and export cleaned concentration results.',
      ],
    },
  },
  'animal-pairing': {
    id: 'animal-pairing',
    label: 'Animal Pairing',
    storage: 'Animal Pairing',
    type: 'fastapi',
    port: 8021,
    tutorial: {
      title: 'Animal Pairing Tutorial',
      intro: 'Enter cohorts and generate balanced pair assignments.',
      steps: [
        'Load or paste animal metadata and required pairing constraints.',
        'Run pairing and review flagged conflicts before exporting.',
        'Save outputs to your configured export folder.',
      ],
    },
  },
  breeding: {
    id: 'breeding',
    label: 'Breeding Pair Selector',
    storage: 'Breeding',
    type: 'fastapi',
    port: 8022,
    tutorial: {
      title: 'Breeding Pair Selector Tutorial',
      intro: 'Build breeding plans from genotype and colony constraints.',
      steps: [
        'Paste breeder list and target genotype goals.',
        'Generate candidate pairs and inspect compatibility notes.',
        'Export final breeding sheet for scheduling.',
      ],
    },
  },
  ymaze: {
    id: 'ymaze',
    label: 'Y-Maze Randomizer',
    storage: 'Y-Maze',
    type: 'fastapi',
    port: 8023,
    tutorial: {
      title: 'Y-Maze Randomizer Tutorial',
      intro: 'Randomize trial assignments with reproducible settings.',
      steps: [
        'Set cohorts, trial count, and randomization seed.',
        'Generate assignment matrix and validate balancing checks.',
        'Export schedule for experiment execution.',
      ],
    },
  },
}

const windows = new Map()
const backendProcesses = new Map()
const staticServers = new Map()

const ensureDirectories = (paths) => {
  const targets = Object.values(paths || {}).filter((val) => typeof val === 'string' && val.trim())
  targets.forEach((target) => fs.mkdirSync(target, { recursive: true }))
}

const getDefaultPaths = (moduleId) => {
  const moduleFolder = MODULES[moduleId]?.storage ?? MODULES[moduleId]?.label ?? 'Suite'
  const base = path.join(app.getPath('documents'), 'Easylab', moduleFolder)
  return {
    dataPath: path.join(base, 'data'),
    attachmentsPath: path.join(base, 'attachments'),
    exportsPath: path.join(base, 'exports'),
    syncPath: path.join(base, 'sync'),
  }
}

const waitForPort = (port, timeoutMs = 8000) => new Promise((resolve, reject) => {
  const start = Date.now()
  const check = () => {
    const socket = net.createConnection({ port }, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => {
      socket.destroy()
      if (Date.now() - start > timeoutMs) reject(new Error('timeout'))
      else setTimeout(check, 300)
    })
  }
  check()
})

const isPortOpen = (port) => new Promise((resolve) => {
  const socket = net.createConnection({ port }, () => {
    socket.end()
    resolve(true)
  })
  socket.on('error', () => {
    socket.destroy()
    resolve(false)
  })
})

const resolvePythonCandidates = () => {
  const candidates = []
  if (process.env.APP_PYTHON_PATH) candidates.push(process.env.APP_PYTHON_PATH)

  const bundledCandidates = [
    // Dev: runtime lives under the repo
    path.join(rootDir, 'desktop', 'runtime', 'python', 'python.exe'),
    path.join(rootDir, 'desktop', 'runtime', 'python', 'bin', 'python3'),
    path.join(rootDir, 'desktop', 'runtime', 'python', 'bin', 'python'),
    // Packaged: runtime is shipped as an extraResource
    path.join(process.resourcesPath, 'runtime', 'python', 'python.exe'),
    path.join(process.resourcesPath, 'runtime', 'python', 'bin', 'python3'),
    path.join(process.resourcesPath, 'runtime', 'python', 'bin', 'python'),
  ].filter((candidate) => candidate && fs.existsSync(candidate))

  candidates.push(...bundledCandidates)
  candidates.push('python', 'python3', 'py')
  return Array.from(new Set(candidates))
}

const getModuleRoot = (moduleId) => {
  const baseRoot = isDev ? rootDir : process.resourcesPath
  return path.join(baseRoot, 'apps', moduleId)
}

const getMimeType = (filePath) => STATIC_MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'

const normalizeRequestPath = (rawPath) => {
  const normalized = path.posix.normalize(rawPath || '/')
  if (normalized === '/' || normalized === '.') return 'index.html'
  return normalized.replace(/^\/+/, '')
}

const stopStaticServer = (moduleId) => {
  const running = staticServers.get(moduleId)
  if (!running) return
  running.server.close()
  staticServers.delete(moduleId)
}

const ensureStaticServer = async (moduleId) => {
  const cached = staticServers.get(moduleId)
  if (cached) return cached

  const moduleRoot = getModuleRoot(moduleId)
  const webRoot = path.resolve(path.join(moduleRoot, 'web'))
  const indexFile = path.join(webRoot, 'index.html')
  await accessFile(indexFile)

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1')
      const relPath = normalizeRequestPath(requestUrl.pathname)
      let filePath = path.resolve(webRoot, relPath)

      if (!filePath.startsWith(webRoot)) {
        res.statusCode = 403
        res.end('Forbidden')
        return
      }

      let bytes
      try {
        bytes = await readFile(filePath)
      } catch {
        if (!path.extname(filePath)) {
          filePath = path.join(webRoot, 'index.html')
          bytes = await readFile(filePath)
        } else {
          res.statusCode = 404
          res.end('Not found')
          return
        }
      }

      res.statusCode = 200
      res.setHeader('Content-Type', getMimeType(filePath))
      res.end(bytes)
    } catch (err) {
      res.statusCode = 500
      res.end('Internal server error')
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error(`Failed to resolve static server address for ${moduleId}`)
  }

  const record = {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
  staticServers.set(moduleId, record)
  return record
}

const injectTutorialButton = async (win, config) => {
  if (!win || win.isDestroyed() || !config?.tutorial) return
  const payload = JSON.stringify({
    label: config.label,
    title: config.tutorial.title,
    intro: config.tutorial.intro,
    steps: config.tutorial.steps,
  })

  const script = `
    (() => {
      const data = ${payload};
      if (!data || !Array.isArray(data.steps) || !document || !document.body) return;
      if (document.getElementById('__easylab_tutorial_button')) return;

      const style = document.createElement('style');
      style.id = '__easylab_tutorial_style';
      style.textContent = \`
        #__easylab_tutorial_button{
          position:fixed;
          top:12px;
          right:12px;
          z-index:2147483640;
          border:2px solid #111827;
          border-radius:999px;
          padding:10px 16px;
          font:700 13px/1.2 "Segoe UI", Inter, sans-serif;
          letter-spacing:0.06em;
          text-transform:uppercase;
          background:#facc15;
          color:#111827;
          cursor:pointer;
          box-shadow:0 10px 24px rgba(0,0,0,0.26);
        }
        #__easylab_tutorial_button:hover{
          transform:translateY(-1px);
        }
        #__easylab_tutorial_overlay{
          position:fixed;
          inset:0;
          z-index:2147483641;
          background:rgba(7,10,16,0.52);
          display:none;
          align-items:center;
          justify-content:center;
          padding:18px;
        }
        #__easylab_tutorial_overlay.open{
          display:flex;
        }
        #__easylab_tutorial_modal{
          width:min(620px,100%);
          background:#ffffff;
          color:#111827;
          border-radius:14px;
          border:1px solid rgba(20,24,28,0.18);
          box-shadow:0 24px 52px rgba(0,0,0,0.28);
          padding:18px;
          display:flex;
          flex-direction:column;
          gap:10px;
          max-height:min(82vh,760px);
          overflow:auto;
        }
        #__easylab_tutorial_modal h2{
          margin:0;
          font:700 18px/1.25 "Segoe UI", Inter, sans-serif;
        }
        #__easylab_tutorial_modal p{
          margin:0;
          font:500 13px/1.5 "Segoe UI", Inter, sans-serif;
          color:#374151;
        }
        #__easylab_tutorial_steps{
          margin:0;
          padding-left:20px;
          display:grid;
          gap:8px;
          font:500 13px/1.45 "Segoe UI", Inter, sans-serif;
        }
        #__easylab_tutorial_close{
          align-self:flex-end;
          border:1px solid rgba(20,24,28,0.35);
          border-radius:999px;
          padding:7px 14px;
          background:#ffffff;
          color:#0f172a;
          font:600 12px/1.2 "Segoe UI", Inter, sans-serif;
          text-transform:uppercase;
          letter-spacing:0.05em;
          cursor:pointer;
        }
      \`;
      document.head.appendChild(style);

      const trigger = document.createElement('button');
      trigger.id = '__easylab_tutorial_button';
      trigger.type = 'button';
      trigger.textContent = 'Tutorial';
      trigger.setAttribute('aria-label', 'Open tutorial');

      const overlay = document.createElement('div');
      overlay.id = '__easylab_tutorial_overlay';

      const modal = document.createElement('div');
      modal.id = '__easylab_tutorial_modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      const title = document.createElement('h2');
      title.textContent = data.title || (data.label + ' tutorial');

      const intro = document.createElement('p');
      intro.textContent = data.intro || '';

      const steps = document.createElement('ol');
      steps.id = '__easylab_tutorial_steps';
      data.steps.forEach((step) => {
        const li = document.createElement('li');
        li.textContent = step;
        steps.appendChild(li);
      });

      const close = document.createElement('button');
      close.id = '__easylab_tutorial_close';
      close.type = 'button';
      close.textContent = 'Close';

      modal.appendChild(title);
      modal.appendChild(intro);
      modal.appendChild(steps);
      modal.appendChild(close);
      overlay.appendChild(modal);

      const openModal = () => overlay.classList.add('open');
      const closeModal = () => overlay.classList.remove('open');

      trigger.addEventListener('click', openModal);
      close.addEventListener('click', closeModal);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeModal();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeModal();
      });

      document.body.appendChild(trigger);
      document.body.appendChild(overlay);
    })();
  `

  await win.webContents.executeJavaScript(script, true)
}

const spawnFastApi = async (moduleId, port) => {
  if (backendProcesses.has(moduleId)) return
  if (await isPortOpen(port)) return

  const moduleRoot = getModuleRoot(moduleId)
  const defaultPaths = getDefaultPaths(moduleId)
  ensureDirectories(defaultPaths)
  const env = {
    ...process.env,
    PYTHONPATH: moduleRoot,
    EASYLAB_MODULE_ID: moduleId,
    EASYLAB_DATA_PATH: defaultPaths.dataPath,
    EASYLAB_ATTACHMENTS_PATH: defaultPaths.attachmentsPath,
    EASYLAB_EXPORTS_PATH: defaultPaths.exportsPath,
    EASYLAB_SYNC_PATH: defaultPaths.syncPath,
  }

  const candidates = resolvePythonCandidates()
  for (const candidate of candidates) {
    try {
      const proc = spawn(candidate, ['-m', 'uvicorn', 'backend.main:app', '--port', String(port)], {
        cwd: moduleRoot,
        env,
        stdio: 'ignore',
        windowsHide: true,
      })

      const ready = await Promise.race([
        waitForPort(port, 6000),
        new Promise((_, reject) => proc.once('error', reject)),
      ])

      if (ready) {
        backendProcesses.set(moduleId, proc)
        proc.on('exit', () => backendProcesses.delete(moduleId))
        return
      }
    } catch (err) {
      continue
    }
  }

  dialog.showMessageBox({
    type: 'warning',
    title: 'Backend not started',
    message: `The ${MODULES[moduleId]?.label ?? 'module'} backend could not start. Ensure a bundled Python runtime is present, or install Python 3.10+ / set APP_PYTHON_PATH, then restart.`,
  })
}

const spawnStreamlit = async (moduleId, port) => {
  if (backendProcesses.has(moduleId)) return
  if (await isPortOpen(port)) return

  const moduleRoot = getModuleRoot(moduleId)
  const appPath = path.join(moduleRoot, 'app.py')
  const defaultPaths = getDefaultPaths(moduleId)
  ensureDirectories(defaultPaths)
  const env = {
    ...process.env,
    PYTHONPATH: moduleRoot,
    EASYLAB_MODULE_ID: moduleId,
    EASYLAB_DATA_PATH: defaultPaths.dataPath,
    EASYLAB_ATTACHMENTS_PATH: defaultPaths.attachmentsPath,
    EASYLAB_EXPORTS_PATH: defaultPaths.exportsPath,
    EASYLAB_SYNC_PATH: defaultPaths.syncPath,
  }

  const candidates = resolvePythonCandidates()
  for (const candidate of candidates) {
    try {
      const proc = spawn(candidate, [
        '-m',
        'streamlit',
        'run',
        appPath,
        '--server.headless',
        'true',
        '--server.port',
        String(port),
        '--server.address',
        '127.0.0.1',
      ], {
        cwd: moduleRoot,
        env,
        stdio: 'ignore',
        windowsHide: true,
      })

      const ready = await Promise.race([
        waitForPort(port, 8000),
        new Promise((_, reject) => proc.once('error', reject)),
      ])

      if (ready) {
        backendProcesses.set(moduleId, proc)
        proc.on('exit', () => backendProcesses.delete(moduleId))
        return
      }
    } catch (err) {
      continue
    }
  }

  dialog.showMessageBox({
    type: 'warning',
    title: 'Server not started',
    message: 'The qPCR analysis server could not start. Ensure a bundled Python runtime is present, or install Python 3.10+ / set APP_PYTHON_PATH, then restart.',
  })
}

const stopBackend = (moduleId) => {
  const proc = backendProcesses.get(moduleId)
  if (proc) {
    proc.kill()
    backendProcesses.delete(moduleId)
  }
}

const stopModuleServices = (moduleId) => {
  stopBackend(moduleId)
  stopStaticServer(moduleId)
}

const createSuiteWindow = () => {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    resizable: true,
    backgroundColor: '#F6F2EA',
    title: app.getName(),
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5178'
    win.loadURL(devUrl)
  } else {
    const webDist = path.join(rootDir, '.suite-dist', 'web', 'index.html')
    win.loadFile(webDist)
  }

  return win
}

const createModuleWindow = async (moduleId) => {
  const config = MODULES[moduleId]
  if (!config) return

  const existing = windows.get(moduleId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }

  if (config.type === 'fastapi') {
    await spawnFastApi(moduleId, config.port)
  }

  if (config.type === 'streamlit') {
    await spawnStreamlit(moduleId, config.port)
  }

  let moduleUrl = null
  if (config.type !== 'streamlit') {
    try {
      const staticHost = await ensureStaticServer(moduleId)
      const url = new URL('/index.html', staticHost.baseUrl)
      if (config.port) {
        url.searchParams.set('apiBase', `http://127.0.0.1:${config.port}`)
      }
      moduleUrl = url.toString()
    } catch (err) {
      dialog.showMessageBox({
        type: 'error',
        title: `${config.label} unavailable`,
        message: `Unable to load ${config.label}. The bundled web files are missing or inaccessible.`,
        detail: err instanceof Error ? err.message : String(err),
      })
      return
    }
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    resizable: true,
    backgroundColor: '#F6F2EA',
    title: `Easylab Suite · ${config.label}`,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--easylab-module=${moduleId}`],
    },
  })

  let showedLoadError = false
  win.webContents.on('did-fail-load', (_event, _errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || showedLoadError) return
    showedLoadError = true
    dialog.showMessageBox({
      type: 'error',
      title: `${config.label} failed to load`,
      message: `The ${config.label} window could not be rendered.`,
      detail: `${errorDescription}\n${validatedURL || ''}`.trim(),
    })
  })

  win.webContents.on('did-finish-load', () => {
    injectTutorialButton(win, config).catch((err) => {
      console.warn(`Tutorial injection failed for ${moduleId}:`, err)
    })
  })

  if (config.type === 'streamlit') {
    win.loadURL(`http://127.0.0.1:${config.port}`)
  } else {
    win.loadURL(moduleUrl)
  }

  win.on('closed', () => {
    windows.delete(moduleId)
    stopModuleServices(moduleId)
  })

  windows.set(moduleId, win)
}

app.whenReady().then(() => {
  createSuiteWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createSuiteWindow()
  })
})

app.on('before-quit', () => {
  Array.from(backendProcesses.keys()).forEach((moduleId) => stopBackend(moduleId))
  Array.from(staticServers.keys()).forEach((moduleId) => stopStaticServer(moduleId))
})

app.on('window-all-closed', () => {
  Array.from(backendProcesses.keys()).forEach((moduleId) => stopBackend(moduleId))
  Array.from(staticServers.keys()).forEach((moduleId) => stopStaticServer(moduleId))
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('launch-module', async (_event, moduleId) => {
  await createModuleWindow(moduleId)
})

ipcMain.handle('select-directory', async (_event, options = {}) => {
  const { title, defaultPath } = options
  const result = await dialog.showOpenDialog({
    title: title || 'Select folder',
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('ensure-directories', async (_event, paths) => {
  try {
    ensureDirectories(paths)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('get-app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
}))

ipcMain.handle('get-suite-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  isPackaged: app.isPackaged,
}))

ipcMain.handle('get-default-paths', (_event, moduleId) => getDefaultPaths(moduleId))
