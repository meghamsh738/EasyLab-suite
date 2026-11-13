const path = require('node:path')
const { spawn } = require('node:child_process')
const { createRequire } = require('node:module')
const {
  ensureRuntimeLayout,
  resolveRuntimeLayout,
  SUITE_DEV_PORT,
  sanitizeEnvironment,
} = require('./runtime-isolation.cjs')

const suiteRoot = path.resolve(__dirname, '..')
const webRoot = path.join(suiteRoot, 'web')
const requireFromWeb = createRequire(path.join(webRoot, 'package.json'))

const runElectron = (electronBinary, env) => new Promise((resolve, reject) => {
  const child = spawn(electronBinary, [suiteRoot], {
    cwd: suiteRoot,
    env,
    stdio: 'inherit',
    windowsHide: false,
  })
  child.once('error', reject)
  child.once('exit', (code, signal) => {
    if (signal) resolve(1)
    else resolve(code ?? 1)
  })
})

const main = async () => {
  const runtimeRootOverride = process.env.EASYLAB_RUNTIME_ROOT || null
  const runtimeLayout = resolveRuntimeLayout({ suiteRoot, runtimeRootOverride })
  ensureRuntimeLayout(runtimeLayout)
  const env = sanitizeEnvironment(process.env, runtimeLayout.runtimeRoot)
  const { createServer } = requireFromWeb('vite')
  const electronBinary = createRequire(path.join(suiteRoot, 'package.json'))('electron')
  const viteServer = await createServer({
    configFile: path.join(webRoot, 'vite.config.ts'),
    root: webRoot,
    mode: 'development',
    clearScreen: false,
    server: {
      host: '127.0.0.1',
      port: SUITE_DEV_PORT,
      strictPort: true,
    },
  })

  let exitCode = 1
  try {
    // Vite's API rejects EADDRINUSE with strictPort, so Electron only starts
    // after this process has successfully claimed and started its own server.
    await viteServer.listen()
    exitCode = await runElectron(electronBinary, {
      ...env,
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${SUITE_DEV_PORT}`,
    })
  } finally {
    await viteServer.close()
  }
  process.exitCode = exitCode
}

main().catch((error) => {
  console.error(`EasyLab Next dev launcher could not start: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
