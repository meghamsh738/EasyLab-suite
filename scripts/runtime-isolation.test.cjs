const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const {
  MODULE_DEV_PORTS,
  SUITE_DEV_PORT,
  assertModuleArtifacts,
  assertIsolatedFilePath,
  assertNoSymlinkPathComponents,
  assertSafePythonEnvironment,
  buildModuleEnvironment,
  buildServerReadyMatcher,
  ensureRuntimeLayout,
  getModulePaths,
  isOwnedBackendProcess,
  isOwnedStaticServer,
  isListenerOwnedByProcess,
  isPathInside,
  isStablePathOverride,
  isTcpPortOpen,
  resolveIsolatedSource,
  resolveRuntimeLayout,
  sanitizeEnvironment,
  waitForOwnedServer,
} = require('./runtime-isolation.cjs')

const makeWorkspace = () => {
  const tempRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'easylab-next-isolation-'))
  const nextRoot = path.join(tempRoot, 'easylab-next')
  const suiteRoot = path.join(nextRoot, 'suite')
  const modulesRoot = path.join(nextRoot, 'modules')
  fs.mkdirSync(suiteRoot, { recursive: true })
  fs.mkdirSync(modulesRoot, { recursive: true })
  return { tempRoot, nextRoot, suiteRoot, modulesRoot }
}

const removeWorkspace = (workspace) => fs.rmSync(workspace.tempRoot, { recursive: true, force: true })

test('Next runtime defaults to its sibling runtime directory and rejects stable or shared paths', () => {
  const workspace = makeWorkspace()
  try {
    const layout = resolveRuntimeLayout({ suiteRoot: workspace.suiteRoot })
    assert.equal(layout.runtimeRoot, path.join(workspace.nextRoot, 'runtime'))
    assert.ok(isPathInside(workspace.nextRoot, layout.runtimeRoot))
    assert.throws(
      () => resolveRuntimeLayout({ suiteRoot: workspace.suiteRoot, runtimeRootOverride: path.join(workspace.tempRoot, 'stable-data') }),
      /must stay inside the Next-only runtime area/,
    )
    assert.throws(
      () => resolveRuntimeLayout({ suiteRoot: workspace.suiteRoot, runtimeRootOverride: path.join(workspace.suiteRoot, '.runtime') }),
      /separate from Suite source and module worktrees/,
    )
    assert.throws(
      () => resolveRuntimeLayout({ suiteRoot: workspace.suiteRoot, runtimeRootOverride: path.join(workspace.modulesRoot, 'runtime') }),
      /separate from Suite source and module worktrees/,
    )
    assert.throws(
      () => resolveRuntimeLayout({ suiteRoot: workspace.suiteRoot, runtimeRootOverride: 'relative-runtime' }),
      /must be an absolute path/,
    )
  } finally {
    removeWorkspace(workspace)
  }
})

test('runtime directories are created under the boundary and symlinked overrides are rejected', () => {
  const workspace = makeWorkspace()
  try {
    const layout = resolveRuntimeLayout({ suiteRoot: workspace.suiteRoot })
    ensureRuntimeLayout(layout)
    for (const directory of [layout.runtimeRoot, layout.userDataPath, layout.sessionDataPath, layout.pythonEnvRoot, layout.pythonCacheRoot, layout.pipCachePath]) {
      assert.ok(fs.statSync(directory).isDirectory())
      assert.ok(isPathInside(workspace.nextRoot, directory))
    }

    const stable = path.join(workspace.tempRoot, 'stable')
    fs.mkdirSync(stable)
    const linked = path.join(workspace.nextRoot, 'linked-runtime')
    fs.symlinkSync(stable, linked)
    assert.throws(
      () => assertNoSymlinkPathComponents(workspace.nextRoot, path.join(linked, 'data')),
      /Symlinks are not allowed/,
    )

    const alias = path.join(workspace.tempRoot, 'next-root-alias')
    fs.symlinkSync(workspace.nextRoot, alias)
    const aliasedLayout = resolveRuntimeLayout({ suiteRoot: path.join(alias, 'suite') })
    assert.throws(() => ensureRuntimeLayout(aliasedLayout), /Symlinks are not allowed/)
  } finally {
    removeWorkspace(workspace)
  }
})

test('module environment strips inherited stable paths and routes all writable locations under Next runtime', () => {
  const workspace = makeWorkspace()
  try {
    const layout = resolveRuntimeLayout({ suiteRoot: workspace.suiteRoot })
    const inherited = {
      PATH: '/usr/bin',
      APP_DIST_DIR: '/stable/build',
      LABNOTE_DIST_DIR: '/stable/notebook-build',
      APP_PYTHON_PATH: '/stable/.venv/bin/python',
      EASYLAB_RUNTIME_ROOT: '/stable/runtime',
      EASYLAB_DATA_ROOT: '/stable/data',
      EASYLAB_QPCR_ANALYSIS_PATH: '/stable/qpcr',
      EASYLAB_EXPORTS_PATH: '/stable/exports',
      EASYLAB_SETTINGS_PATH: '/stable/settings.json',
      PYTHONPATH: '/stable/python',
      PYTHONPYCACHEPREFIX: '/stable/pycache',
      MPLCONFIGDIR: '/stable/matplotlib',
      XDG_CACHE_HOME: '/stable/cache',
      PIP_TARGET: '/stable/site-packages',
      WHATSAPP_ACCESS_TOKEN: 'must-not-propagate',
    }
    const env = buildModuleEnvironment(inherited, layout, 'qpcr-analysis')
    const paths = getModulePaths(layout, 'qpcr-analysis')
    assert.equal(env.PATH, '/usr/bin')
    assert.equal(env.EASYLAB_RUNTIME_ROOT, layout.runtimeRoot)
    assert.equal(env.EASYLAB_DATA_ROOT, layout.dataRoot)
    assert.equal(env.EASYLAB_DATA_PATH, paths.dataPath)
    assert.equal(env.EASYLAB_SETTINGS_PATH, paths.settingsPath)
    assert.equal(env.EASYLAB_EXPORTS_PATH, paths.exportsPath)
    assert.equal(env.EASYLAB_ATTACHMENTS_PATH, paths.attachmentsPath)
    assert.equal(env.EASYLAB_SYNC_PATH, paths.syncPath)
    assert.equal(env.PIP_CACHE_DIR, path.join(layout.runtimeRoot, 'pip-cache'))
    assert.equal(env.PYTHONPYCACHEPREFIX, path.join(layout.runtimeRoot, 'python-cache', 'bytecode'))
    assert.equal(env.MPLCONFIGDIR, path.join(layout.runtimeRoot, 'python-cache', 'matplotlib'))
    assert.equal(env.XDG_CACHE_HOME, path.join(layout.runtimeRoot, 'python-cache', 'xdg'))
    assert.equal(env.EASYLAB_WHATSAPP_ENABLED, '0')
    assert.equal(env.EASYLAB_TELEGRAM_ENABLED, '0')
    for (const key of [
      'APP_DIST_DIR', 'LABNOTE_DIST_DIR', 'APP_PYTHON_PATH', 'EASYLAB_QPCR_ANALYSIS_PATH',
      'PYTHONPATH', 'PIP_TARGET',
      'WHATSAPP_ACCESS_TOKEN',
    ]) assert.equal(env[key], undefined)
    for (const key of ['EASYLAB_DATA_PATH', 'EASYLAB_SETTINGS_PATH', 'EASYLAB_EXPORTS_PATH', 'EASYLAB_ATTACHMENTS_PATH', 'EASYLAB_SYNC_PATH']) {
      assert.ok(isPathInside(layout.runtimeRoot, env[key]))
    }
    assert.equal(isStablePathOverride('APP_DIST_DIR'), true)
    assert.equal(sanitizeEnvironment(inherited).WHATSAPP_ACCESS_TOKEN, undefined)
  } finally {
    removeWorkspace(workspace)
  }
})

test('package metadata carries a distinct Next app identity and matching lockfile version', () => {
  const suiteRoot = path.resolve(__dirname, '..')
  const packageJson = JSON.parse(fs.readFileSync(path.join(suiteRoot, 'package.json'), 'utf8'))
  const packageLock = JSON.parse(fs.readFileSync(path.join(suiteRoot, 'package-lock.json'), 'utf8'))
  assert.equal(packageJson.name, 'easylab-suite-next')
  assert.equal(packageJson.version, '0.3.0-dev.1')
  assert.equal(packageJson.build.appId, 'com.meghamshteja.easylab.suite.nextdev')
  assert.match(packageJson.productName, /Next/)
  assert.ok(packageJson.build.files.includes('scripts/runtime-isolation.cjs'))
  assert.equal(packageLock.name, packageJson.name)
  assert.equal(packageLock.version, packageJson.version)
  assert.equal(packageLock.packages[''].name, packageJson.name)
  assert.equal(packageLock.packages[''].version, packageJson.version)
})

test('source modules and bundled artifacts cannot resolve through stable paths or symlinks', () => {
  const workspace = makeWorkspace()
  try {
    const moduleSource = path.join(workspace.modulesRoot, 'cdna')
    fs.mkdirSync(moduleSource)
    assert.equal(resolveIsolatedSource(moduleSource, workspace.modulesRoot), moduleSource)
    assert.throws(() => resolveIsolatedSource(path.join(workspace.tempRoot, 'stable'), workspace.modulesRoot), /outside the EasyLab Next module worktrees/)

    const artifactRoot = path.join(workspace.suiteRoot, 'apps', 'cdna')
    fs.mkdirSync(path.join(artifactRoot, 'backend'), { recursive: true })
    fs.writeFileSync(path.join(artifactRoot, 'backend', 'main.py'), '# local')
    fs.writeFileSync(path.join(artifactRoot, 'backend', 'requirements.txt'), 'fastapi')
    assert.doesNotThrow(() => assertModuleArtifacts('cdna', artifactRoot, workspace.suiteRoot, ['backend/main.py', 'backend/requirements.txt']))

    const outside = path.join(workspace.tempRoot, 'outside.py')
    fs.writeFileSync(outside, '# stable')
    fs.unlinkSync(path.join(artifactRoot, 'backend', 'main.py'))
    fs.symlinkSync(outside, path.join(artifactRoot, 'backend', 'main.py'))
    assert.throws(
      () => assertModuleArtifacts('cdna', artifactRoot, workspace.suiteRoot, ['backend/main.py', 'backend/requirements.txt']),
      /Symlinks are not allowed/,
    )
  } finally {
    removeWorkspace(workspace)
  }
})

test('settings and attachment file paths stay inside Next storage and reject symlinks', () => {
  const workspace = makeWorkspace()
  try {
    const runtimeRoot = path.join(workspace.nextRoot, 'runtime')
    fs.mkdirSync(runtimeRoot)
    const settingsPath = path.join(runtimeRoot, 'data', 'qPCR Analysis', 'settings.json')
    assert.doesNotThrow(() => assertIsolatedFilePath(runtimeRoot, settingsPath))
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fs.writeFileSync(settingsPath, '{}')
    assert.doesNotThrow(() => assertIsolatedFilePath(runtimeRoot, settingsPath))
    assert.throws(() => assertIsolatedFilePath(runtimeRoot, path.join(workspace.tempRoot, 'stable.json')), /escapes its Next-only boundary/)

    const stableFile = path.join(workspace.tempRoot, 'stable.json')
    fs.writeFileSync(stableFile, '{}')
    fs.unlinkSync(settingsPath)
    fs.symlinkSync(stableFile, settingsPath)
    assert.throws(() => assertIsolatedFilePath(runtimeRoot, settingsPath), /Symlinks are not allowed/)
  } finally {
    removeWorkspace(workspace)
  }
})

test('Python environments reject linked writable paths and preserve only safe interpreter links', (t) => {
  if (process.platform === 'win32') t.skip('Symlink creation requires Windows developer mode or elevated privileges.')
  const workspace = makeWorkspace()
  try {
    const runtimeRoot = path.join(workspace.nextRoot, 'runtime')
    const venvRoot = path.join(runtimeRoot, 'python-envs', 'qpcr-analysis')
    const sitePackages = path.join(venvRoot, 'lib', 'python', 'site-packages')
    fs.mkdirSync(sitePackages, { recursive: true })
    fs.mkdirSync(path.join(venvRoot, 'bin'), { recursive: true })
    fs.writeFileSync(path.join(venvRoot, 'pyvenv.cfg'), 'home = /usr/bin\n')
    fs.symlinkSync(path.join(venvRoot, 'lib'), path.join(venvRoot, 'lib64'))

    const pythonLink = path.join(venvRoot, 'bin', 'python3')
    fs.symlinkSync(process.execPath, pythonLink)
    const realInterpreter = fs.realpathSync(pythonLink)
    const readOnlyFs = new Proxy(fs, {
      get(target, property) {
        if (property === 'accessSync') {
          return (filename, mode) => {
            if (path.resolve(filename) === realInterpreter && mode === fs.constants.W_OK) {
              const error = new Error('read-only interpreter')
              error.code = 'EACCES'
              throw error
            }
            return target.accessSync(filename, mode)
          }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    assert.doesNotThrow(() => assertSafePythonEnvironment(runtimeRoot, venvRoot, readOnlyFs))

    const stablePackages = path.join(workspace.tempRoot, 'stable-packages')
    fs.mkdirSync(stablePackages)
    fs.rmSync(sitePackages, { recursive: true })
    fs.symlinkSync(stablePackages, sitePackages)
    assert.throws(() => assertSafePythonEnvironment(runtimeRoot, venvRoot), /link outside its Next runtime/)

    fs.unlinkSync(sitePackages)
    fs.mkdirSync(sitePackages)
    fs.unlinkSync(path.join(venvRoot, 'pyvenv.cfg'))
    fs.symlinkSync(path.join(workspace.tempRoot, 'stable-config.cfg'), path.join(venvRoot, 'pyvenv.cfg'))
    fs.writeFileSync(path.join(workspace.tempRoot, 'stable-config.cfg'), 'home = stable\n')
    assert.throws(() => assertSafePythonEnvironment(runtimeRoot, venvRoot), /Symlinks are not allowed/)

    fs.rmSync(venvRoot, { recursive: true, force: true })
    fs.symlinkSync(stablePackages, venvRoot)
    assert.throws(() => assertSafePythonEnvironment(runtimeRoot, venvRoot), /Symlinks are not allowed/)
  } finally {
    removeWorkspace(workspace)
  }
})

test('Next launcher and module ports are fixed and distinct from the stable defaults', () => {
  const ports = [SUITE_DEV_PORT, ...Object.values(MODULE_DEV_PORTS).filter(Number.isInteger)]
  assert.equal(new Set(ports).size, ports.length)
  assert.deepEqual(MODULE_DEV_PORTS, {
    labnotebook: 18530,
    cdna: 18511,
    'qpcr-planner': 18512,
    'qpcr-analysis': 18501,
    'elisa-analysis': null,
    'animal-pairing': 18521,
    breeding: 18522,
    ymaze: 18523,
  })
  assert.notEqual(SUITE_DEV_PORT, 5178)
  assert.notEqual(MODULE_DEV_PORTS.labnotebook, 8030)
  assert.notEqual(MODULE_DEV_PORTS['qpcr-analysis'], 8501)
})

test('a listening static server is reusable only when the in-process server owns the port', async () => {
  const server = require('node:net').createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    assert.equal(isOwnedStaticServer(server, port), true)
    assert.equal(isOwnedStaticServer(server, port + 1), false)
    assert.equal(isOwnedBackendProcess({ exitCode: null, killed: false }, port, port), true)
    assert.equal(isOwnedBackendProcess({ exitCode: 1, killed: false }, port, port), false)
    assert.equal(await isTcpPortOpen(port), true)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
  assert.equal(await isTcpPortOpen(port), false)
})

test('backend readiness requires its own startup message and listener owner', async () => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 42,
    exitCode: null,
    killed: false,
  })
  const ready = waitForOwnedServer({
    proc: child,
    port: 18511,
    serverType: 'fastapi',
    timeoutMs: 1000,
    probePort: async () => true,
    verifyOwner: async (_port, pid) => pid === 42,
  })
  child.stdout.emit('data', 'INFO: Uvicorn running on http://127.0.0.1:18511 (Press CTRL+C to quit)')
  assert.equal(await ready, true)

  const stranger = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: 43,
    exitCode: null,
    killed: false,
  })
  const rejected = waitForOwnedServer({
    proc: stranger,
    port: 18512,
    serverType: 'streamlit',
    timeoutMs: 1000,
    probePort: async () => true,
    verifyOwner: async () => false,
  })
  stranger.stdout.emit('data', 'Local URL: http://127.0.0.1:18512')
  await assert.rejects(rejected, /listener is not owned/)
})

test('listener PID verification accepts the launched process tree and rejects unrelated listeners', () => {
  const ownedProbe = (command) => {
    if (command === 'lsof') return { status: 0, stdout: '42001\n', stderr: '', error: null }
    return { status: 0, stdout: `${process.pid}\n`, stderr: '', error: null }
  }
  const unrelatedProbe = (command) => {
    if (command === 'lsof') return { status: 0, stdout: '42002\n', stderr: '', error: null }
    return { status: 0, stdout: '1\n', stderr: '', error: null }
  }

  assert.equal(isListenerOwnedByProcess(18501, process.pid, { platform: 'darwin', spawnSyncImpl: ownedProbe }), true)
  assert.equal(isListenerOwnedByProcess(18501, process.pid, { platform: 'darwin', spawnSyncImpl: unrelatedProbe }), false)
})

test('readiness patterns require the exact loopback port for each server type', () => {
  assert.match('INFO: Uvicorn running on http://127.0.0.1:18521', buildServerReadyMatcher('fastapi', 18521))
  assert.match('Local URL: http://127.0.0.1:18501', buildServerReadyMatcher('streamlit', 18501))
  assert.doesNotMatch('Local URL: http://127.0.0.1:8501', buildServerReadyMatcher('streamlit', 18501))
  assert.doesNotMatch('Local URL: http://localhost:18501', buildServerReadyMatcher('streamlit', 18501))
})
