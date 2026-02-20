const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const http = require('http')
const net = require('net')
const os = require('os')
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
    webPort: 8030,
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

const clampZoomFactor = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 1
  return Math.min(2, Math.max(0.6, numeric))
}

const buildZoomOverlayScript = (scope) => {
  const config = {
    scope,
    min: 0.6,
    max: 2,
    step: 0.05,
    defaultZoom: 1,
  }

  return `
(() => {
  const config = ${JSON.stringify(config)};
  const api = window.electronAPI;
  if (!api || typeof api.getZoomFactor !== 'function' || typeof api.setZoomFactor !== 'function') return;
  const clamp = (value) => Math.min(config.max, Math.max(config.min, Number(value) || config.defaultZoom));
  const key = 'easylab.zoom.' + config.scope;
  const widgetId = 'easylab-zoom-widget';
  const existing = document.getElementById(widgetId);
  if (existing) existing.remove();

  let zoom = clamp(window.localStorage?.getItem(key) ?? config.defaultZoom);

  const widget = document.createElement('div');
  widget.id = widgetId;
  widget.setAttribute('aria-label', 'Zoom controls');
  widget.style.position = 'fixed';
  widget.style.right = '14px';
  widget.style.bottom = '14px';
  widget.style.zIndex = '2147483500';
  widget.style.display = 'grid';
  widget.style.gridTemplateColumns = 'auto 1fr auto';
  widget.style.gap = '8px';
  widget.style.alignItems = 'center';
  widget.style.padding = '8px 10px';
  widget.style.border = '1px solid rgba(15, 23, 42, 0.22)';
  widget.style.background = 'rgba(255, 255, 255, 0.94)';
  widget.style.backdropFilter = 'blur(6px)';
  widget.style.borderRadius = '12px';
  widget.style.boxShadow = '0 10px 26px rgba(15, 23, 42, 0.18)';
  widget.style.fontFamily = 'Segoe UI, Inter, system-ui, sans-serif';
  widget.style.fontSize = '12px';
  widget.style.color = '#0f172a';

  const makeButton = (label, title) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.title = title;
    btn.style.width = '26px';
    btn.style.height = '26px';
    btn.style.border = '1px solid rgba(15, 23, 42, 0.2)';
    btn.style.borderRadius = '7px';
    btn.style.background = '#ffffff';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = '700';
    btn.style.color = '#0f172a';
    return btn;
  };

  const minus = makeButton('-', 'Zoom out');
  const plus = makeButton('+', 'Zoom in');

  const middle = document.createElement('div');
  middle.style.display = 'grid';
  middle.style.gap = '4px';
  middle.style.minWidth = '150px';

  const label = document.createElement('div');
  label.style.display = 'flex';
  label.style.justifyContent = 'space-between';
  label.style.alignItems = 'center';

  const title = document.createElement('span');
  title.textContent = 'Zoom';
  title.style.fontWeight = '600';
  const value = document.createElement('span');
  value.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  label.appendChild(title);
  label.appendChild(value);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(config.min);
  slider.max = String(config.max);
  slider.step = String(config.step);
  slider.value = String(zoom);
  slider.style.width = '100%';
  slider.style.cursor = 'pointer';

  const helper = document.createElement('div');
  helper.textContent = 'Ctrl + wheel to zoom';
  helper.style.fontSize = '11px';
  helper.style.opacity = '0.72';

  middle.appendChild(label);
  middle.appendChild(slider);
  middle.appendChild(helper);
  widget.appendChild(minus);
  widget.appendChild(middle);
  widget.appendChild(plus);

  const syncLabel = () => {
    slider.value = String(zoom);
    value.textContent = Math.round(zoom * 100) + '%';
  };

  const apply = async (nextZoom, persist = true) => {
    const requested = clamp(nextZoom);
    let applied = requested;
    try {
      const result = await api.setZoomFactor(requested);
      applied = clamp(result);
    } catch {
      applied = requested;
    }
    zoom = applied;
    syncLabel();
    if (persist && window.localStorage) window.localStorage.setItem(key, String(zoom));
  };

  const onWheel = (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? config.step : -config.step;
    void apply(zoom + delta);
  };

  const onKey = (event) => {
    if (!event.ctrlKey) return;
    if (event.key === '0') {
      event.preventDefault();
      void apply(config.defaultZoom);
    }
  };

  minus.addEventListener('click', () => void apply(zoom - config.step));
  plus.addEventListener('click', () => void apply(zoom + config.step));
  slider.addEventListener('input', () => void apply(Number(slider.value)));
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('keydown', onKey, true);

  if (document.body) document.body.appendChild(widget);
  syncLabel();

  const init = async () => {
    try {
      const current = clamp(await api.getZoomFactor());
      const saved = window.localStorage?.getItem(key);
      if (saved === null || saved === undefined || saved === '') {
        zoom = current;
        syncLabel();
      } else {
        await apply(zoom, false);
      }
    } catch {
      await apply(zoom, false);
    }
  };

  void init();
})();
`
}

const attachZoomOverlay = (win, scope) => {
  const applyOverlay = () => {
    if (!win || win.isDestroyed()) return
    const script = buildZoomOverlayScript(scope)
    win.webContents.executeJavaScript(script).catch(() => {
      // Some pages may block script execution during navigation; retry on next load.
    })
  }

  win.webContents.on('did-finish-load', applyOverlay)
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

const STATIC_CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const LABNOTE_API_PREFIX = '/labnote-api'
const LABNOTE_UPLOADS_PREFIX = '/labnote-uploads/'
const LABNOTE_STATE_FILE = 'labnote-shared-state.json'

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

const readJsonBody = (req, maxBytes = 25 * 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0

  req.on('data', (chunk) => {
    size += chunk.length
    if (size > maxBytes) {
      reject(new Error('Payload too large'))
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    if (chunks.length === 0) {
      resolve({})
      return
    }
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    } catch (err) {
      reject(err)
    }
  })
  req.on('error', reject)
})

const extensionForMime = (mime) => {
  const normalized = String(mime || '').toLowerCase()
  if (normalized.includes('jpeg')) return '.jpg'
  if (normalized.includes('png')) return '.png'
  if (normalized.includes('gif')) return '.gif'
  if (normalized.includes('webp')) return '.webp'
  if (normalized.includes('svg')) return '.svg'
  if (normalized.includes('pdf')) return '.pdf'
  return ''
}

const parseDataUrl = (value) => {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(value || ''))
  if (!match) return null
  try {
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') }
  } catch {
    return null
  }
}

const safeUploadBaseName = (filename) => {
  const base = path.basename(String(filename || 'upload'))
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'upload'
}

const getLabnoteStorage = () => {
  const defaults = getDefaultPaths('labnotebook')
  const dataDir = defaults.dataPath
  const uploadsDir = defaults.attachmentsPath
  const stateFile = path.join(dataDir, LABNOTE_STATE_FILE)
  return { dataDir, uploadsDir, stateFile }
}

const ensureLabnoteStorage = () => {
  const { dataDir, uploadsDir } = getLabnoteStorage()
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const readLabnoteState = () => {
  const { stateFile } = getLabnoteStorage()
  try {
    if (!fs.existsSync(stateFile)) return null
    const raw = fs.readFileSync(stateFile, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const writeLabnoteState = (payload) => {
  ensureLabnoteStorage()
  const { stateFile } = getLabnoteStorage()
  fs.writeFileSync(stateFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

const toSafeUploadPath = (uploadsDir, requestUrl) => {
  const [pathname] = String(requestUrl || '/').split('?')
  let decoded = ''
  try {
    decoded = decodeURIComponent(pathname || '/')
  } catch {
    decoded = pathname || '/'
  }
  const relative = decoded.replace(new RegExp(`^${LABNOTE_UPLOADS_PREFIX}`), '').replace(/^\/+/, '')
  if (!relative) return null
  const resolved = path.resolve(uploadsDir, relative)
  const root = path.resolve(uploadsDir)
  if (resolved.startsWith(`${root}${path.sep}`) || resolved === root) return resolved
  return null
}

const handleLabnoteApiRequest = async (req, res) => {
  const [pathname] = String(req.url || '/').split('?')
  const method = String(req.method || 'GET').toUpperCase()

  if (pathname === `${LABNOTE_API_PREFIX}/info`) {
    sendJson(res, 200, {
      ok: true,
      shared: true,
      uploadsUrl: LABNOTE_UPLOADS_PREFIX,
      stateVersion: 1,
    })
    return
  }

  if (pathname === `${LABNOTE_API_PREFIX}/state`) {
    if (method === 'GET') {
      sendJson(res, 200, { ok: true, state: readLabnoteState() })
      return
    }

    if (method === 'PATCH' || method === 'PUT') {
      try {
        const body = await readJsonBody(req)
        const payload = body && typeof body === 'object' && body.state && typeof body.state === 'object' ? body.state : body
        if (!payload || typeof payload !== 'object') {
          sendJson(res, 400, { ok: false, error: 'Invalid state payload' })
          return
        }
        const nextState = {
          version: Number(payload.version) || 1,
          projects: Array.isArray(payload.projects) ? payload.projects : [],
          experiments: Array.isArray(payload.experiments) ? payload.experiments : [],
          entries: payload.entries && typeof payload.entries === 'object' ? payload.entries : {},
          attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
        }
        writeLabnoteState(nextState)
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) })
      }
      return
    }

    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  if (pathname === `${LABNOTE_API_PREFIX}/upload`) {
    if (method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' })
      return
    }
    try {
      const body = await readJsonBody(req)
      const parsed = parseDataUrl(body?.dataUrl)
      if (!parsed) {
        sendJson(res, 400, { ok: false, error: 'Invalid dataUrl' })
        return
      }

      ensureLabnoteStorage()
      const { uploadsDir } = getLabnoteStorage()
      const baseName = safeUploadBaseName(body?.filename)
      const ext = path.extname(baseName) || extensionForMime(parsed.mime)
      const stem = baseName.replace(new RegExp(`${ext.replace('.', '\\.')}$`), '') || 'upload'
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const finalName = `${stem}-${suffix}${ext}`
      const fullPath = path.join(uploadsDir, finalName)
      fs.writeFileSync(fullPath, parsed.buffer)

      sendJson(res, 200, { ok: true, url: `${LABNOTE_UPLOADS_PREFIX}${finalName}` })
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
}

const toSafeStaticPath = (webRoot, requestPath) => {
  const [pathname] = String(requestPath || '/').split('?')
  let decodedPath = '/'
  try {
    decodedPath = decodeURIComponent(pathname || '/')
  } catch {
    decodedPath = pathname || '/'
  }
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '')
  const resolved = path.resolve(webRoot, relativePath)
  const resolvedRoot = path.resolve(webRoot)
  if (resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`)) return resolved
  return null
}

const sendStaticFile = (res, filePath) => {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Unable to read file')
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    const contentType = STATIC_CONTENT_TYPES[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
    res.end(content)
  })
}

const spawnStaticServer = async (moduleId, port) => {
  if (staticServers.has(moduleId)) return true
  if (await isPortOpen(port)) return true

  const moduleRoot = getModuleRoot(moduleId)
  const webRoot = path.join(moduleRoot, 'web')
  const indexPath = path.join(webRoot, 'index.html')
  if (!fs.existsSync(indexPath)) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Module not available',
      message: `${MODULES[moduleId]?.label ?? moduleId} is missing web assets.`,
      detail: `Expected file not found: ${indexPath}`,
    })
    return false
  }

  const server = http.createServer((req, res) => {
    const requestUrl = String(req.url || '/')
    if (moduleId === 'labnotebook') {
      if (requestUrl === LABNOTE_API_PREFIX || requestUrl.startsWith(`${LABNOTE_API_PREFIX}/`)) {
        void handleLabnoteApiRequest(req, res)
        return
      }

      if (requestUrl.startsWith(LABNOTE_UPLOADS_PREFIX)) {
        const { uploadsDir } = getLabnoteStorage()
        const uploadPath = toSafeUploadPath(uploadsDir, requestUrl)
        if (!uploadPath) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Invalid upload path')
          return
        }
        fs.stat(uploadPath, (uploadErr, stat) => {
          if (!uploadErr && stat.isFile()) {
            sendStaticFile(res, uploadPath)
            return
          }
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Not found')
        })
        return
      }
    }

    const safePath = toSafeStaticPath(webRoot, req.url || '/')
    if (!safePath) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Invalid path')
      return
    }
    fs.stat(safePath, (statErr, stat) => {
      if (!statErr && stat.isFile()) {
        sendStaticFile(res, safePath)
        return
      }
      // SPA fallback so direct links still open the shell app.
      sendStaticFile(res, indexPath)
    })
  })

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '0.0.0.0', resolve)
    })
    staticServers.set(moduleId, server)
    return true
  } catch (err) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Server not started',
      message: `The ${MODULES[moduleId]?.label ?? moduleId} server could not start.`,
      detail: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

const stopStaticServer = (moduleId) => {
  const server = staticServers.get(moduleId)
  if (!server) return
  server.close()
  staticServers.delete(moduleId)
}

const parseTailscaleStatus = () => {
  const commands = process.platform === 'win32' ? ['tailscale.exe', 'tailscale'] : ['tailscale']
  for (const cmd of commands) {
    const probe = spawnSync(cmd, ['status', '--json'], {
      stdio: 'pipe',
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000,
    })
    if (probe.status !== 0 || !probe.stdout) continue
    try {
      return JSON.parse(probe.stdout)
    } catch {
      // Try next candidate.
    }
  }
  return null
}

const pickLanIpv4 = () => {
  const interfaces = os.networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue
    for (const entry of entries) {
      if (!entry || entry.internal) continue
      if (entry.family !== 'IPv4') continue
      if (entry.address.startsWith('169.254.')) continue
      return entry.address
    }
  }
  return null
}

const getPairingLink = (moduleId) => {
  const config = MODULES[moduleId]
  const port = config?.webPort
  if (!config || !port) {
    return {
      url: '',
      candidates: [],
      tailscaleConnected: false,
      source: 'none',
    }
  }

  const candidates = []
  let tailscaleConnected = false
  const status = parseTailscaleStatus()
  if (status && typeof status === 'object') {
    const self = status.Self && typeof status.Self === 'object' ? status.Self : null
    const backendState = typeof status.BackendState === 'string' ? status.BackendState : ''
    const dnsName = typeof self?.DNSName === 'string' ? self.DNSName.trim().replace(/\.$/, '') : ''
    const ips = Array.isArray(self?.TailscaleIPs) ? self.TailscaleIPs.filter((ip) => typeof ip === 'string') : []
    if (dnsName) candidates.push(`http://${dnsName}:${port}`)
    const tsIpv4 = ips.find((ip) => /^100\.(\d{1,3}\.){2}\d{1,3}$/.test(ip))
    if (tsIpv4) candidates.push(`http://${tsIpv4}:${port}`)
    tailscaleConnected = Boolean(self?.Online) || backendState === 'Running'
  }

  if (candidates.length === 0) {
    const lanIp = pickLanIpv4()
    if (lanIp) candidates.push(`http://${lanIp}:${port}`)
  }

  const uniqueCandidates = Array.from(new Set(candidates))
  const mappedCandidates = moduleId === 'labnotebook'
    ? uniqueCandidates.map((candidate) => `${candidate}${candidate.includes('?') ? '&' : '?'}sharedApi=1`)
    : uniqueCandidates
  return {
    url: mappedCandidates[0] || '',
    candidates: mappedCandidates,
    tailscaleConnected,
    source: uniqueCandidates.length === 0 ? 'none' : tailscaleConnected ? 'tailscale' : 'lan',
  }
}

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
  attachZoomOverlay(win, 'suite-launcher')

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

  if (config.type === 'static' && config.webPort) {
    const started = await spawnStaticServer(moduleId, config.webPort)
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
  attachZoomOverlay(win, `module-${moduleId}`)

  if (config.type === 'streamlit') {
    win.loadURL(`http://127.0.0.1:${config.port}`)
  } else if (config.type === 'static' && config.webPort) {
    win.loadURL(`http://127.0.0.1:${config.webPort}`)
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
    if (config.type === 'static' && config.webPort) {
      stopStaticServer(moduleId)
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

ipcMain.handle('get-pairing-link', (_event, moduleId) => getPairingLink(moduleId))

ipcMain.handle('get-zoom-factor', (event) => event.sender.getZoomFactor())

ipcMain.handle('set-zoom-factor', (event, value) => {
  const factor = clampZoomFactor(value)
  event.sender.setZoomFactor(factor)
  return event.sender.getZoomFactor()
})
