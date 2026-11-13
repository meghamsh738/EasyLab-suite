const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SUITE_DEV_PORT = 18578

const MODULE_DEV_PORTS = Object.freeze({
  labnotebook: 18530,
  cdna: 18511,
  'qpcr-planner': 18512,
  'qpcr-analysis': 18501,
  'elisa-analysis': null,
  'animal-pairing': 18521,
  breeding: 18522,
  ymaze: 18523,
})

const MODULE_STORAGE_NAMES = Object.freeze({
  labnotebook: 'Lab Notebook',
  cdna: 'cDNA',
  'qpcr-planner': 'qPCR Planner',
  'qpcr-analysis': 'qPCR Analysis',
  'elisa-analysis': 'ELISA Analysis',
  'animal-pairing': 'Animal Pairing',
  breeding: 'Breeding',
  ymaze: 'Y-Maze',
})

const MODULE_SOURCE_ENV_KEYS = Object.freeze([
  'EASYLAB_LABNOTE_PATH',
  'EASYLAB_CDNA_PATH',
  'EASYLAB_QPCR_PLANNER_PATH',
  'EASYLAB_QPCR_ANALYSIS_PATH',
  'EASYLAB_ELISA_ANALYSIS_PATH',
  'EASYLAB_ANIMAL_PAIRING_PATH',
  'EASYLAB_BREEDING_PATH',
  'EASYLAB_YMAZE_PATH',
])

const PATH_OVERRIDE_ENV_KEYS = new Set([
  'APP_DIST_DIR',
  'LABNOTE_DIST_DIR',
  'APP_PYTHON_PATH',
  'EASYLAB_APPS_ROOT',
  'EASYLAB_DATA_ROOT',
  'EASYLAB_DATA_PATH',
  'EASYLAB_ATTACHMENTS_PATH',
  'EASYLAB_EXPORTS_PATH',
  'EASYLAB_SYNC_PATH',
  'EASYLAB_SETTINGS_PATH',
  'EASYLAB_WHATSAPP_CONFIG',
  'EASYLAB_TELEGRAM_CONFIG',
  'PYTHONHOME',
  'PYTHONPATH',
  'PYTHONUSERBASE',
  'PYTHONPYCACHEPREFIX',
  'XDG_CACHE_HOME',
  'MPLCONFIGDIR',
  'PYTHON_EGG_CACHE',
  'VIRTUAL_ENV',
  'PIP_TARGET',
  'PIP_PREFIX',
  'PIP_USER',
  'PIP_CONFIG_FILE',
  'PIP_CACHE_DIR',
  'PLAYWRIGHT_OUTPUT_DIR',
  'PLAYWRIGHT_REUSE_SERVER',
  'VITE_DEV_SERVER_URL',
  'STREAMLIT_SERVER_PORT',
  'STREAMLIT_SERVER_ADDRESS',
  'UVICORN_HOST',
  'UVICORN_PORT',
])

const EXTERNAL_INTAKE_ENV_KEYS = Object.freeze([
  'EASYLAB_WHATSAPP_ENABLED',
  'EASYLAB_WHATSAPP_INTAKE_PORT',
  'EASYLAB_WHATSAPP_TIMEZONE',
  'WHATSAPP_ALLOWED_SENDERS',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_GRAPH_API_VERSION',
  'EASYLAB_TELEGRAM_ENABLED',
  'EASYLAB_TELEGRAM_POLL_INTERVAL_MS',
  'TELEGRAM_ALLOWED_CHAT_IDS',
  'TELEGRAM_BOT_TOKEN',
])

const isPathInside = (parentPath, candidatePath) => {
  const parent = path.resolve(parentPath)
  const candidate = path.resolve(candidatePath)
  const relative = path.relative(parent, candidate)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

const isPathInsideOrEqual = (parentPath, candidatePath) => (
  path.resolve(parentPath) === path.resolve(candidatePath) || isPathInside(parentPath, candidatePath)
)

const resolveRuntimeLayout = ({ suiteRoot, runtimeRootOverride, packaged = false, appDataRoot }) => {
  const absoluteSuiteRoot = path.resolve(suiteRoot)
  const nextRoot = path.dirname(absoluteSuiteRoot)
  const allowedRoot = packaged
    ? path.join(path.resolve(appDataRoot), 'Easylab Suite Next Dev')
    : nextRoot
  const defaultRuntimeRoot = path.join(allowedRoot, 'runtime')

  if (runtimeRootOverride && !path.isAbsolute(runtimeRootOverride)) {
    throw new Error('EASYLAB_RUNTIME_ROOT must be an absolute path inside the EasyLab Next workspace.')
  }

  const runtimeRoot = path.resolve(runtimeRootOverride || defaultRuntimeRoot)
  if (!isPathInside(allowedRoot, runtimeRoot)) {
    throw new Error(`EASYLAB_RUNTIME_ROOT must stay inside the Next-only runtime area: ${allowedRoot}`)
  }
  if (!packaged && (
    isPathInside(absoluteSuiteRoot, runtimeRoot)
    || isPathInside(path.join(nextRoot, 'modules'), runtimeRoot)
  )) {
    throw new Error('EASYLAB_RUNTIME_ROOT must be separate from Suite source and module worktrees.')
  }

  return {
    nextRoot,
    allowedRoot,
    runtimeRoot,
    dataRoot: path.join(runtimeRoot, 'data'),
    userDataPath: path.join(runtimeRoot, 'electron-user-data'),
    sessionDataPath: path.join(runtimeRoot, 'electron-session-data'),
    pythonEnvRoot: path.join(runtimeRoot, 'python-envs'),
    pythonCacheRoot: path.join(runtimeRoot, 'python-cache'),
    pipCachePath: path.join(runtimeRoot, 'pip-cache'),
  }
}

const assertNoSymlinkPathComponents = (boundaryRoot, targetPath, fsImpl = fs) => {
  const boundary = path.resolve(boundaryRoot)
  const target = path.resolve(targetPath)
  if (!isPathInsideOrEqual(boundary, target)) {
    throw new Error(`Path escapes its Next-only boundary: ${target}`)
  }

  const components = path.relative(boundary, target).split(path.sep).filter(Boolean)
  let current = boundary
  const boundaryStat = fsImpl.lstatSync(current)
  if (boundaryStat.isSymbolicLink() || !boundaryStat.isDirectory()) {
    throw new Error(`Isolation boundary must be a real directory: ${boundary}`)
  }

  for (const [index, component] of components.entries()) {
    current = path.join(current, component)
    let stat
    try {
      stat = fsImpl.lstatSync(current)
    } catch (error) {
      if (error && error.code === 'ENOENT') break
      throw error
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in isolated paths: ${current}`)
    if (index < components.length - 1 && !stat.isDirectory()) {
      throw new Error(`Isolated path component is not a directory: ${current}`)
    }
  }
}

const assertIsolatedFilePath = (boundaryRoot, targetPath, fsImpl = fs) => {
  const boundary = path.resolve(boundaryRoot)
  const target = path.resolve(targetPath)
  if (!isPathInside(boundary, target)) {
    throw new Error(`File path escapes its Next-only boundary: ${target}`)
  }
  assertNoSymlinkPathComponents(boundary, target, fsImpl)
  try {
    if (!fsImpl.lstatSync(target).isFile()) {
      throw new Error(`Isolated file path must be a regular file: ${target}`)
    }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error
  }
}

const ensureRealDirectoryPath = (targetPath, fsImpl = fs) => {
  const target = path.resolve(targetPath)
  const root = path.parse(target).root
  const components = path.relative(root, target).split(path.sep).filter(Boolean)
  let current = root

  for (const component of components) {
    current = path.join(current, component)
    let stat
    try {
      stat = fsImpl.lstatSync(current)
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
      fsImpl.mkdirSync(current)
      stat = fsImpl.lstatSync(current)
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in isolated paths: ${current}`)
    if (!stat.isDirectory()) throw new Error(`Isolated path component is not a directory: ${current}`)
  }
}

const ensureRuntimeLayout = (layout, fsImpl = fs) => {
  const directories = [
    layout.allowedRoot,
    layout.runtimeRoot,
    layout.dataRoot,
    layout.userDataPath,
    layout.sessionDataPath,
    layout.pythonEnvRoot,
    layout.pythonCacheRoot,
    path.join(layout.pythonCacheRoot, 'bytecode'),
    path.join(layout.pythonCacheRoot, 'matplotlib'),
    path.join(layout.pythonCacheRoot, 'xdg'),
    layout.pipCachePath,
  ]
  directories.forEach((directory) => {
    if (!isPathInsideOrEqual(layout.allowedRoot, directory)) {
      throw new Error(`Next runtime directories must stay under ${layout.allowedRoot}: ${directory}`)
    }
    ensureRealDirectoryPath(directory, fsImpl)
  })
}

const assertSafePythonEnvironment = (runtimeRoot, venvRoot, fsImpl = fs) => {
  const boundary = path.resolve(runtimeRoot)
  const venv = path.resolve(venvRoot)
  if (!isPathInside(boundary, venv)) {
    throw new Error(`Python environments must stay under the Next runtime: ${venv}`)
  }
  assertNoSymlinkPathComponents(boundary, venv, fsImpl)
  if (!fsImpl.existsSync(venv)) return true
  if (!fsImpl.lstatSync(venv).isDirectory()) {
    throw new Error(`Next Python environment must be a real directory: ${venv}`)
  }

  const configPath = path.join(venv, 'pyvenv.cfg')
  assertIsolatedFilePath(venv, configPath, fsImpl)

  const isExpectedPythonExecutable = (linkPath) => {
    const relative = path.relative(venv, linkPath)
    const [directory, filename, ...rest] = relative.split(path.sep)
    return rest.length === 0
      && (directory === 'bin' || directory.toLowerCase() === 'scripts')
      && /^python(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i.test(filename)
  }

  const isReadOnly = (filename) => {
    try {
      fsImpl.accessSync(filename, fs.constants.W_OK)
      return false
    } catch (error) {
      if (error && ['EACCES', 'EPERM', 'EROFS'].includes(error.code)) return true
      throw error
    }
  }

  const visit = (directory) => {
    for (const entry of fsImpl.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        const realTarget = fsImpl.realpathSync(entryPath)
        if (isPathInsideOrEqual(venv, realTarget)) continue
        if (isExpectedPythonExecutable(entryPath) && isReadOnly(realTarget)) continue
        throw new Error(`Python environment contains a link outside its Next runtime: ${entryPath}`)
      }
      if (entry.isDirectory()) visit(entryPath)
    }
  }

  visit(venv)
  return true
}

const getModulePaths = (layout, moduleId) => {
  const storageName = MODULE_STORAGE_NAMES[moduleId]
  if (!storageName) throw new Error(`Unknown Easylab module: ${moduleId}`)
  const base = path.join(layout.dataRoot, storageName)
  return {
    dataPath: path.join(base, 'data'),
    attachmentsPath: path.join(base, 'attachments'),
    exportsPath: path.join(base, 'exports'),
    syncPath: path.join(base, 'sync'),
    settingsPath: path.join(base, 'settings.json'),
  }
}

const isStablePathOverride = (key) => (
  PATH_OVERRIDE_ENV_KEYS.has(key)
  || MODULE_SOURCE_ENV_KEYS.includes(key)
  || (key.startsWith('EASYLAB_') && (key.endsWith('_PATH') || key.endsWith('_ROOT')))
)

const sanitizeEnvironment = (sourceEnv = process.env, runtimeRoot = null) => {
  const env = { ...sourceEnv }
  Object.keys(env).forEach((key) => {
    if (isStablePathOverride(key) || EXTERNAL_INTAKE_ENV_KEYS.includes(key)) delete env[key]
  })

  if (runtimeRoot) {
    env.EASYLAB_RUNTIME_ROOT = runtimeRoot
    env.EASYLAB_DATA_ROOT = path.join(runtimeRoot, 'data')
    env.PYTHONPYCACHEPREFIX = path.join(runtimeRoot, 'python-cache', 'bytecode')
    env.MPLCONFIGDIR = path.join(runtimeRoot, 'python-cache', 'matplotlib')
    env.XDG_CACHE_HOME = path.join(runtimeRoot, 'python-cache', 'xdg')
    env.PIP_CACHE_DIR = path.join(runtimeRoot, 'pip-cache')
  }
  // Next preview never inherits external messaging credentials or polling settings.
  env.EASYLAB_WHATSAPP_ENABLED = '0'
  env.EASYLAB_TELEGRAM_ENABLED = '0'
  return env
}

const buildModuleEnvironment = (sourceEnv, layout, moduleId) => {
  const paths = getModulePaths(layout, moduleId)
  return {
    ...sanitizeEnvironment(sourceEnv, layout.runtimeRoot),
    EASYLAB_MODULE_ID: moduleId,
    EASYLAB_DATA_PATH: paths.dataPath,
    EASYLAB_ATTACHMENTS_PATH: paths.attachmentsPath,
    EASYLAB_EXPORTS_PATH: paths.exportsPath,
    EASYLAB_SYNC_PATH: paths.syncPath,
    EASYLAB_SETTINGS_PATH: paths.settingsPath,
  }
}

const resolveIsolatedSource = (candidate, modulesRoot, fsImpl = fs) => {
  if (!candidate || !path.isAbsolute(candidate)) {
    throw new Error('Every module source must be an explicit absolute path to an EasyLab Next module worktree.')
  }
  const modules = path.resolve(modulesRoot)
  const source = path.resolve(candidate)
  if (!isPathInside(modules, source)) {
    throw new Error(`Module source is outside the EasyLab Next module worktrees: ${source}`)
  }
  assertNoSymlinkPathComponents(modules, source, fsImpl)
  const stat = fsImpl.lstatSync(source)
  if (!stat.isDirectory()) throw new Error(`Module source is not a directory: ${source}`)
  return source
}

const assertModuleArtifacts = (moduleId, moduleRoot, baseRoot, requiredFiles, fsImpl = fs) => {
  const expectedRoot = path.resolve(baseRoot, 'apps', moduleId)
  const resolvedRoot = path.resolve(moduleRoot)
  if (resolvedRoot !== expectedRoot) {
    throw new Error(`${moduleId} must launch from its bundled Next artifact: ${expectedRoot}`)
  }

  assertNoSymlinkPathComponents(baseRoot, resolvedRoot, fsImpl)
  const moduleStat = fsImpl.lstatSync(resolvedRoot)
  if (!moduleStat.isDirectory()) throw new Error(`Isolated module artifact is missing: ${resolvedRoot}`)

  for (const relativeFile of requiredFiles) {
    const filePath = path.resolve(resolvedRoot, relativeFile)
    if (!isPathInside(resolvedRoot, filePath)) throw new Error(`Invalid module artifact path: ${relativeFile}`)
    assertNoSymlinkPathComponents(resolvedRoot, filePath, fsImpl)
    let stat
    try {
      stat = fsImpl.lstatSync(filePath)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new Error(`Isolated ${moduleId} artifact is incomplete; missing ${relativeFile}. Sync its Next module worktree first.`)
      }
      throw error
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Isolated ${moduleId} artifact must be a regular file: ${relativeFile}`)
    }
  }
}

const isOwnedStaticServer = (server, port) => {
  if (!server || !server.listening) return false
  const address = server.address()
  return Boolean(address && typeof address === 'object' && address.port === port)
}

const isOwnedBackendProcess = (proc, ownedPort, targetPort) => (
  Boolean(proc && proc.exitCode === null && !proc.killed && ownedPort === targetPort)
)

const isTcpPortOpen = (port, timeoutMs = 500) => new Promise((resolve) => {
  const socket = net.createConnection({ host: '127.0.0.1', port })
  let settled = false
  const finish = (isOpen) => {
    if (settled) return
    settled = true
    socket.destroy()
    resolve(isOpen)
  }
  socket.setTimeout(timeoutMs, () => finish(false))
  socket.once('connect', () => finish(true))
  socket.once('error', () => finish(false))
})

const getListeningPids = (port, { platform = process.platform, spawnSyncImpl = spawnSync } = {}) => {
  let result
  if (platform === 'win32') {
    const command = `Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess }`
    result = spawnSyncImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
    })
  } else {
    result = spawnSyncImpl('lsof', ['-nP', '-t', `-iTCP:${Number(port)}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 3000,
    })
  }
  if (result.error) throw new Error(`Could not verify ownership of port ${port}: ${result.error.message}`)
  if (result.status !== 0 && String(result.stdout || '').trim()) {
    throw new Error(`Could not verify ownership of port ${port}: ${String(result.stderr || '').trim()}`)
  }
  return Array.from(new Set(String(result.stdout || '').split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0)))
}

const isProcessDescendant = (processId, parentProcessId, { platform = process.platform, spawnSyncImpl = spawnSync } = {}) => {
  let currentPid = Number(processId)
  const parentPid = Number(parentProcessId)
  if (!Number.isInteger(currentPid) || !Number.isInteger(parentPid) || currentPid <= 0 || parentPid <= 0) return false
  if (currentPid === parentPid) return true

  if (platform === 'win32') {
    const command = [
      `$targetPid = ${parentPid}`,
      `$ownerPid = ${currentPid}`,
      '$seen = @{}',
      'while ($ownerPid -gt 0 -and -not $seen.ContainsKey([string]$ownerPid)) {',
      '  if ($ownerPid -eq $targetPid) { "true"; exit 0 }',
      '  $seen[[string]$ownerPid] = $true',
      '  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue',
      '  if ($null -eq $process) { break }',
      '  $ownerPid = [int]$process.ParentProcessId',
      '}',
      '"false"',
    ].join('; ')
    const result = spawnSyncImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
    })
    if (result.error || result.status !== 0) return false
    return String(result.stdout || '').trim().toLowerCase() === 'true'
  }

  for (let depth = 0; currentPid > 1 && depth < 16; depth += 1) {
    const result = spawnSyncImpl('ps', ['-o', 'ppid=', '-p', String(currentPid)], {
      encoding: 'utf8',
      timeout: 1500,
    })
    if (result.error || result.status !== 0) return false
    const nextPid = Number(String(result.stdout || '').trim())
    if (!Number.isInteger(nextPid) || nextPid <= 0 || nextPid === currentPid) return false
    if (nextPid === parentPid) return true
    currentPid = nextPid
  }
  return false
}

const isListenerOwnedByProcess = (port, processId, options = {}) => {
  const pids = getListeningPids(port, options)
  return pids.length > 0 && pids.every((pid) => isProcessDescendant(pid, processId, options))
}

const buildServerReadyMatcher = (serverType, port) => {
  const escapedPort = String(port).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedHost = '127\\.0\\.0\\.1'
  const phrase = serverType === 'streamlit' ? 'Local URL:' : 'Uvicorn running on'
  return new RegExp(`${phrase}\\s*https?:\\/\\/${escapedHost}:${escapedPort}(?:\\/|\\s|$)`, 'i')
}

const waitForOwnedServer = ({
  proc,
  port,
  serverType,
  timeoutMs,
  probePort = isTcpPortOpen,
  verifyOwner = isListenerOwnedByProcess,
}) => new Promise((resolve, reject) => {
  if (!proc || !proc.stdout || !proc.stderr) {
    reject(new Error('Owned server readiness requires captured child-process output.'))
    return
  }

  const readyMatcher = buildServerReadyMatcher(serverType, port)
  const startedAt = Date.now()
  let output = ''
  let settled = false
  let checkTimer = null
  let timeout = null

  const cleanup = () => {
    clearTimeout(timeout)
    clearInterval(checkTimer)
    proc.stdout.removeListener('data', onOutput)
    proc.stderr.removeListener('data', onOutput)
    proc.removeListener('exit', onExit)
    proc.removeListener('error', onError)
  }
  const finish = (error) => {
    if (settled) return
    settled = true
    cleanup()
    if (error) reject(error)
    else resolve(true)
  }
  const checkReadiness = async () => {
    if (settled || !readyMatcher.test(output)) return
    if (proc.exitCode !== null || proc.killed) {
      finish(new Error(`The ${serverType} child exited before it owned port ${port}.`))
      return
    }
    try {
      if (await probePort(port)) {
        if (!(await verifyOwner(port, proc.pid))) {
          finish(new Error(`Port ${port} is open, but its listener is not owned by the launched ${serverType} process.`))
          return
        }
        finish()
      }
    } catch (error) {
      finish(error)
    }
  }
  const onOutput = (chunk) => {
    output = `${output}${String(chunk).replace(/\u001b\[[0-9;]*m/g, '')}`.slice(-8192)
    void checkReadiness()
  }
  const onExit = (code, signal) => finish(new Error(`${serverType} exited before serving port ${port} (code ${code}, signal ${signal}).`))
  const onError = (error) => finish(error)

  proc.stdout.on('data', onOutput)
  proc.stderr.on('data', onOutput)
  proc.once('exit', onExit)
  proc.once('error', onError)
  checkTimer = setInterval(() => {
    if (Date.now() - startedAt > timeoutMs) {
      finish(new Error(`${serverType} did not confirm ownership of port ${port} before the timeout. ${output}`.trim()))
      return
    }
    void checkReadiness()
  }, 100)
  timeout = setTimeout(() => {
    finish(new Error(`${serverType} did not confirm ownership of port ${port} before the timeout. ${output}`.trim()))
  }, timeoutMs)
})

module.exports = {
  EXTERNAL_INTAKE_ENV_KEYS,
  MODULE_DEV_PORTS,
  MODULE_SOURCE_ENV_KEYS,
  MODULE_STORAGE_NAMES,
  PATH_OVERRIDE_ENV_KEYS,
  SUITE_DEV_PORT,
  assertModuleArtifacts,
  assertIsolatedFilePath,
  assertNoSymlinkPathComponents,
  ensureRealDirectoryPath,
  buildModuleEnvironment,
  buildServerReadyMatcher,
  ensureRuntimeLayout,
  getModulePaths,
  assertSafePythonEnvironment,
  isOwnedBackendProcess,
  isOwnedStaticServer,
  isListenerOwnedByProcess,
  isPathInside,
  isPathInsideOrEqual,
  getListeningPids,
  isStablePathOverride,
  isProcessDescendant,
  isTcpPortOpen,
  resolveIsolatedSource,
  resolveRuntimeLayout,
  sanitizeEnvironment,
  waitForOwnedServer,
}
