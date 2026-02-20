const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const net = require('net')
const path = require('path')

const isDev = !app.isPackaged
const rootDir = path.join(__dirname, '..', '..')
const fallbackIconPath = path.join(__dirname, '..', 'build', 'icon.png')
const suiteIconPath = path.join(__dirname, 'icons', 'suite.png')

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
  'elisa-analysis': {
    id: 'elisa-analysis',
    label: 'ELISA Analysis',
    storage: 'ELISA Analysis',
    type: 'static',
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

const moduleIconPaths = Object.fromEntries(
  Object.keys(MODULES).map((moduleId) => [moduleId, path.join(__dirname, 'icons', `${moduleId}.png`)]),
)

const resolveWindowIcon = (moduleId) => {
  const candidates = []
  if (moduleId && moduleIconPaths[moduleId]) candidates.push(moduleIconPaths[moduleId])
  candidates.push(suiteIconPath, fallbackIconPath)
  return candidates.find((candidate) => candidate && fs.existsSync(candidate))
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

const isPyLauncher = (candidate) => path.basename(candidate).toLowerCase() === 'py'

const withPythonLauncherArgs = (candidate, args) => {
  if (!isPyLauncher(candidate)) return { command: candidate, args }
  const hasMajorHint = args.includes('-3') || args.includes('-2')
  return { command: candidate, args: hasMajorHint ? args : ['-3', ...args] }
}

const runPythonSync = (candidate, args, { cwd, env, timeoutMs = 120000 } = {}) => {
  const launch = withPythonLauncherArgs(candidate, args)
  return spawnSync(launch.command, launch.args, {
    cwd,
    env,
    stdio: 'pipe',
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
  })
}

const canRunPython = (candidate) => {
  const probe = runPythonSync(candidate, ['-c', 'import sys; print(sys.executable)'])
  return probe.status === 0
}

const hasRequiredImports = (candidate, imports) => {
  if (!imports.length) return canRunPython(candidate)
  const script = imports.map((name) => `import ${name}`).join(';')
  const check = runPythonSync(candidate, ['-c', script])
  return check.status === 0
}

const getModuleRequirementsPath = (moduleRoot, moduleType) => {
  if (moduleType === 'streamlit') return path.join(moduleRoot, 'requirements.txt')
  return path.join(moduleRoot, 'backend', 'requirements.txt')
}

const getBootstrapVenvRoot = (moduleId) => path.join(app.getPath('userData'), 'python-envs', moduleId)

const getBootstrapVenvPython = (moduleId) => {
  const venvRoot = getBootstrapVenvRoot(moduleId)
  if (process.platform === 'win32') return path.join(venvRoot, 'Scripts', 'python.exe')
  return path.join(venvRoot, 'bin', 'python3')
}

const buildWindowsPythonCandidates = () => {
  const candidates = []
  const localAppData = process.env.LOCALAPPDATA
  const userProfile = process.env.USERPROFILE
  const programFiles = process.env.ProgramFiles
  const programFilesX86 = process.env['ProgramFiles(x86)']
  const commonRoots = [programFiles, programFilesX86, userProfile].filter(Boolean)
  const versions = ['312', '311', '310']

  if (localAppData) {
    versions.forEach((ver) => {
      candidates.push(path.join(localAppData, 'Programs', 'Python', `Python${ver}`, 'python.exe'))
    })
    candidates.push(path.join(localAppData, 'Microsoft', 'WindowsApps', 'python.exe'))
    candidates.push(path.join(localAppData, 'Microsoft', 'WindowsApps', 'py.exe'))
  }

  commonRoots.forEach((root) => {
    versions.forEach((ver) => {
      candidates.push(path.join(root, `Python${ver}`, 'python.exe'))
      candidates.push(path.join(root, 'Python', `Python${ver}`, 'python.exe'))
    })
  })

  return candidates.filter((candidate) => candidate && fs.existsSync(candidate))
}

const ensureModulePython = (moduleId, moduleType, moduleRoot) => {
  const requiredImports = moduleType === 'streamlit'
    ? ['streamlit', 'pandas', 'numpy', 'matplotlib', 'openpyxl']
    : ['fastapi', 'uvicorn']
  const requirementsPath = getModuleRequirementsPath(moduleRoot, moduleType)
  const venvPython = getBootstrapVenvPython(moduleId)

  if (fs.existsSync(venvPython) && hasRequiredImports(venvPython, requiredImports)) {
    return { python: venvPython, usedBootstrap: false, reason: '' }
  }

  const candidates = resolvePythonCandidates()
  for (const candidate of candidates) {
    if (!canRunPython(candidate)) continue
    if (hasRequiredImports(candidate, requiredImports)) {
      return { python: candidate, usedBootstrap: false, reason: '' }
    }
  }

  if (!fs.existsSync(requirementsPath)) {
    return { python: null, usedBootstrap: false, reason: `Requirements file missing: ${requirementsPath}` }
  }

  for (const candidate of candidates) {
    if (!canRunPython(candidate)) continue
    try {
      const venvRoot = getBootstrapVenvRoot(moduleId)
      fs.mkdirSync(venvRoot, { recursive: true })
      const createVenv = runPythonSync(candidate, ['-m', 'venv', venvRoot], { cwd: moduleRoot, timeoutMs: 300000 })
      if (createVenv.status !== 0 || !fs.existsSync(venvPython)) continue

      runPythonSync(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], {
        cwd: moduleRoot,
        timeoutMs: 600000,
        env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' },
      })
      const installReq = runPythonSync(venvPython, ['-m', 'pip', 'install', '-r', requirementsPath], {
        cwd: moduleRoot,
        timeoutMs: 900000,
        env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' },
      })
      if (installReq.status !== 0) continue
      if (hasRequiredImports(venvPython, requiredImports)) {
        return { python: venvPython, usedBootstrap: true, reason: '' }
      }
    } catch (err) {
      continue
    }
  }

  return {
    python: null,
    usedBootstrap: false,
    reason: `No usable Python + dependencies found for ${MODULES[moduleId]?.label ?? moduleId}.`,
  }
}

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
  if (process.platform === 'win32') candidates.push(...buildWindowsPythonCandidates())
  candidates.push('python', 'python3', 'py')
  return Array.from(new Set(candidates))
}

const getModuleRoot = (moduleId) => {
  const baseRoot = isDev ? rootDir : process.resourcesPath
  return path.join(baseRoot, 'apps', moduleId)
}

const spawnFastApi = async (moduleId, port) => {
  if (backendProcesses.has(moduleId)) return true
  if (await isPortOpen(port)) return true

  const moduleRoot = getModuleRoot(moduleId)
  const pythonResolution = ensureModulePython(moduleId, 'fastapi', moduleRoot)
  if (!pythonResolution.python) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Backend not started',
      message: `The ${MODULES[moduleId]?.label ?? 'module'} backend could not start.`,
      detail: `${pythonResolution.reason}\n\nInstall Python 3.10+ or set APP_PYTHON_PATH, then restart.\nIf Python is installed, ensure pip can install:\n${getModuleRequirementsPath(moduleRoot, 'fastapi')}`,
    })
    return false
  }

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

  try {
    const launch = withPythonLauncherArgs(pythonResolution.python, ['-m', 'uvicorn', 'backend.main:app', '--port', String(port)])
    const proc = spawn(launch.command, launch.args, {
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
      return true
    }
  } catch (err) {
    // fall through to dialog below
  }

  dialog.showMessageBox({
    type: 'warning',
    title: 'Backend not started',
    message: `The ${MODULES[moduleId]?.label ?? 'module'} backend could not start.`,
    detail: `Python used: ${pythonResolution.python}\n\nIf this is the first launch, wait for dependency install to complete and retry.\nOtherwise reinstall dependencies from:\n${getModuleRequirementsPath(moduleRoot, 'fastapi')}`,
  })
  return false
}

const spawnStreamlit = async (moduleId, port) => {
  if (backendProcesses.has(moduleId)) return true
  if (await isPortOpen(port)) return true

  const moduleRoot = getModuleRoot(moduleId)
  const pythonResolution = ensureModulePython(moduleId, 'streamlit', moduleRoot)
  if (!pythonResolution.python) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Server not started',
      message: `The ${MODULES[moduleId]?.label ?? 'module'} server could not start.`,
      detail: `${pythonResolution.reason}\n\nInstall Python 3.10+ or set APP_PYTHON_PATH, then restart.\nIf Python is installed, ensure pip can install:\n${getModuleRequirementsPath(moduleRoot, 'streamlit')}`,
    })
    return false
  }

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

  try {
    const launch = withPythonLauncherArgs(pythonResolution.python, [
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
    ])
    const proc = spawn(launch.command, launch.args, {
      cwd: moduleRoot,
      env,
      stdio: 'ignore',
      windowsHide: true,
    })

    const ready = await Promise.race([
      waitForPort(port, 12000),
      new Promise((_, reject) => proc.once('error', reject)),
    ])

    if (ready) {
      backendProcesses.set(moduleId, proc)
      proc.on('exit', () => backendProcesses.delete(moduleId))
      return true
    }
  } catch (err) {
    // fall through to dialog below
  }

  dialog.showMessageBox({
    type: 'warning',
    title: 'Server not started',
    message: `The ${MODULES[moduleId]?.label ?? 'module'} server could not start.`,
    detail: `Python used: ${pythonResolution.python}\n\nIf this is the first launch, wait for dependency install to complete and retry.\nOtherwise reinstall dependencies from:\n${getModuleRequirementsPath(moduleRoot, 'streamlit')}`,
  })
  return false
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
    icon: resolveWindowIcon(),
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
    const started = await spawnFastApi(moduleId, config.port)
    if (!started) return
  }

  if (config.type === 'streamlit') {
    const started = await spawnStreamlit(moduleId, config.port)
    if (!started) return
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    resizable: true,
    backgroundColor: '#F6F2EA',
    title: `Easylab Suite · ${config.label}`,
    icon: resolveWindowIcon(moduleId),
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
