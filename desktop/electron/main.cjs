const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const net = require('net')
const path = require('path')

const isDev = !app.isPackaged
const rootDir = path.join(__dirname, '..', '..')
const iconPath = path.join(__dirname, '..', 'build', 'icon.png')

const MODULES = {
  labnotebook: {
    id: 'labnotebook',
    label: 'Lab Notebook',
    storage: 'Lab Notebook',
    type: 'static',
  },
  cdna: {
    id: 'cdna',
    label: 'cDNA Calculator',
    storage: 'cDNA',
    type: 'fastapi',
    port: 8011,
  },
  'qpcr-planner': {
    id: 'qpcr-planner',
    label: 'qPCR Planner',
    storage: 'qPCR Planner',
    type: 'fastapi',
    port: 8012,
  },
  'qpcr-analysis': {
    id: 'qpcr-analysis',
    label: 'qPCR Analysis',
    storage: 'qPCR Analysis',
    type: 'streamlit',
    port: 8501,
  },
  'animal-pairing': {
    id: 'animal-pairing',
    label: 'Animal Pairing',
    storage: 'Animal Pairing',
    type: 'fastapi',
    port: 8021,
  },
  breeding: {
    id: 'breeding',
    label: 'Breeding Pair Selector',
    storage: 'Breeding',
    type: 'fastapi',
    port: 8022,
  },
  ymaze: {
    id: 'ymaze',
    label: 'Y-Maze Randomizer',
    storage: 'Y-Maze',
    type: 'fastapi',
    port: 8023,
  },
}

const windows = new Map()
const backendProcesses = new Map()

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

  if (config.type === 'streamlit') {
    win.loadURL(`http://127.0.0.1:${config.port}`)
  } else {
    const moduleRoot = getModuleRoot(moduleId)
    const indexPath = path.join(moduleRoot, 'web', 'index.html')
    const query = config.port ? { apiBase: `http://127.0.0.1:${config.port}` } : undefined
    win.loadFile(indexPath, { query })
  }

  win.on('closed', () => {
    windows.delete(moduleId)
    if (config.type === 'fastapi' || config.type === 'streamlit') {
      stopBackend(moduleId)
    }
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
})

app.on('window-all-closed', () => {
  Array.from(backendProcesses.keys()).forEach((moduleId) => stopBackend(moduleId))
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
