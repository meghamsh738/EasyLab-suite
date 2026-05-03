const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { spawn, spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const net = require('net')
const os = require('os')
const path = require('path')

const isDev = !app.isPackaged
const hasAppSwitch = (name) => {
  const normalized = String(name || '').replace(/^--/, '')
  return process.argv.includes(`--${normalized}`) || app.commandLine.hasSwitch(normalized)
}

const isWhatsappIntakeMode = hasAppSwitch('labnote-whatsapp-intake')
const isTelegramIntakeMode = hasAppSwitch('labnote-telegram-intake')
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
let whatsappIntakeServer = null
let telegramIntakePoller = null

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
const WHATSAPP_CONFIG_FILE = 'whatsapp-intake-config.json'
const WHATSAPP_DELETED_MESSAGE_ERROR = 131051
const TELEGRAM_CONFIG_FILE = 'telegram-intake-config.json'
const TELEGRAM_RUNTIME_STATE_FILE = 'telegram-intake-state.json'

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
  const tempFile = `${stateFile}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
  fs.renameSync(tempFile, stateFile)
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

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const parseList = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const normalizeSender = (sender) => String(sender || '').replace(/[^\d]/g, '')

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

const readWhatsappConfig = () => {
  const { dataDir } = getLabnoteStorage()
  const configPath = process.env.EASYLAB_WHATSAPP_CONFIG || path.join(dataDir, WHATSAPP_CONFIG_FILE)
  let fileConfig = {}
  try {
    if (fs.existsSync(configPath)) {
      const rawConfig = fs.readFileSync(configPath, 'utf-8').replace(/^\uFEFF/, '')
      fileConfig = JSON.parse(rawConfig)
    }
  } catch {
    fileConfig = {}
  }

  const allowedSenders = parseList(process.env.WHATSAPP_ALLOWED_SENDERS || fileConfig.allowedSenders)
    .map(normalizeSender)
    .filter(Boolean)

  return {
    configPath,
    enabled: process.env.EASYLAB_WHATSAPP_ENABLED
      ? process.env.EASYLAB_WHATSAPP_ENABLED !== '0'
      : fileConfig.enabled !== false,
    port: parsePositiveInt(process.env.EASYLAB_WHATSAPP_INTAKE_PORT || fileConfig.port, 8787),
    verifyToken: String(process.env.WHATSAPP_VERIFY_TOKEN || fileConfig.verifyToken || ''),
    accessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || fileConfig.accessToken || ''),
    appSecret: String(process.env.WHATSAPP_APP_SECRET || fileConfig.appSecret || ''),
    graphApiVersion: String(process.env.WHATSAPP_GRAPH_API_VERSION || fileConfig.graphApiVersion || 'v20.0'),
    allowedSenders,
    timezone: String(process.env.EASYLAB_WHATSAPP_TIMEZONE || fileConfig.timezone || 'Europe/London'),
  }
}

const getWhatsappConfigStatus = (config = readWhatsappConfig()) => ({
  enabled: config.enabled,
  port: config.port,
  configPath: config.configPath,
  hasVerifyToken: Boolean(config.verifyToken),
  hasAccessToken: Boolean(config.accessToken),
  hasAppSecret: Boolean(config.appSecret),
  allowedSenderCount: config.allowedSenders.length,
  timezone: config.timezone,
})

const normalizeTelegramChatId = (chatId) => String(chatId || '').trim()

const readTelegramConfig = () => {
  const { dataDir } = getLabnoteStorage()
  const configPath = process.env.EASYLAB_TELEGRAM_CONFIG || path.join(dataDir, TELEGRAM_CONFIG_FILE)
  let fileConfig = {}
  let configExists = false
  try {
    if (fs.existsSync(configPath)) {
      configExists = true
      const rawConfig = fs.readFileSync(configPath, 'utf-8').replace(/^\uFEFF/, '')
      fileConfig = JSON.parse(rawConfig)
    }
  } catch {
    fileConfig = {}
  }

  const allowedChatIds = parseList(process.env.TELEGRAM_ALLOWED_CHAT_IDS || fileConfig.allowedChatIds)
    .map(normalizeTelegramChatId)
    .filter(Boolean)

  return {
    configPath,
    enabled: process.env.EASYLAB_TELEGRAM_ENABLED
      ? process.env.EASYLAB_TELEGRAM_ENABLED !== '0'
      : configExists && fileConfig.enabled !== false,
    botToken: String(fileConfig.botToken || process.env.TELEGRAM_BOT_TOKEN || ''),
    allowedChatIds,
    pollIntervalMs: parsePositiveInt(process.env.EASYLAB_TELEGRAM_POLL_INTERVAL_MS || fileConfig.pollIntervalMs, 3000),
    timezone: String(process.env.EASYLAB_TELEGRAM_TIMEZONE || fileConfig.timezone || 'Europe/London'),
  }
}

const getTelegramConfigStatus = (config = readTelegramConfig()) => ({
  enabled: config.enabled,
  configPath: config.configPath,
  hasBotToken: Boolean(config.botToken),
  allowedChatCount: config.allowedChatIds.length,
  pollIntervalMs: config.pollIntervalMs,
  timezone: config.timezone,
})

const getTelegramRuntimeStatePath = () => {
  const { dataDir } = getLabnoteStorage()
  return path.join(dataDir, TELEGRAM_RUNTIME_STATE_FILE)
}

const readTelegramRuntimeState = () => {
  const statePath = getTelegramRuntimeStatePath()
  try {
    if (!fs.existsSync(statePath)) return { lastUpdateId: null }
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8').replace(/^\uFEFF/, ''))
    const lastUpdateId = Number(parsed?.lastUpdateId)
    return { lastUpdateId: Number.isFinite(lastUpdateId) ? lastUpdateId : null }
  } catch {
    return { lastUpdateId: null }
  }
}

const writeTelegramRuntimeState = (state) => {
  const statePath = getTelegramRuntimeStatePath()
  const dir = path.dirname(statePath)
  fs.mkdirSync(dir, { recursive: true })
  const lastUpdateId = Number(state?.lastUpdateId)
  fs.writeFileSync(statePath, JSON.stringify({
    lastUpdateId: Number.isFinite(lastUpdateId) ? lastUpdateId : null,
    updatedAt: new Date().toISOString(),
  }, null, 2))
}

const readRawBody = (req, maxBytes = 25 * 1024 * 1024) => new Promise((resolve, reject) => {
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
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', reject)
})

const sendPlain = (res, statusCode, text) => {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

const verifyWhatsappSignature = (rawBody, appSecret, signatureHeader) => {
  if (!appSecret) return true
  const provided = String(signatureHeader || '')
  if (!provided.startsWith('sha256=')) return false
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer)
}

const stableShortHash = (value, length = 12) =>
  crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, length)

const parseWhatsappSentDate = (timestamp) => {
  const seconds = Number(timestamp)
  if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000)
  return new Date()
}

const datePartsForZone = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
  }
}

const dateBucketForZone = (date, timeZone) => {
  const parts = datePartsForZone(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

const displayDateForZone = (date, timeZone) =>
  new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(date)

const displayTimeForZone = (date, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(date)

const normalizeLabnoteState = (state) => ({
  version: Number(state?.version) || 1,
  projects: Array.isArray(state?.projects) ? state.projects : [],
  experiments: Array.isArray(state?.experiments) ? state.experiments : [],
  entries: isObject(state?.entries) ? state.entries : {},
  attachments: Array.isArray(state?.attachments) ? state.attachments : [],
})

const readWritableLabnoteState = () => normalizeLabnoteState(readLabnoteState())

const extractWhatsappMessages = (payload) => {
  const messages = []
  const entries = Array.isArray(payload?.entry) ? payload.entry : []
  entries.forEach((entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    changes.forEach((change) => {
      const value = change?.value || {}
      const batch = Array.isArray(value.messages) ? value.messages : []
      batch.forEach((message) => messages.push({ message, value }))
    })
  })
  return messages
}

const isAllowedWhatsappSender = (sender, config) => {
  const normalized = normalizeSender(sender)
  if (!normalized || config.allowedSenders.length === 0) return false
  return config.allowedSenders.includes(normalized)
}

const isWhatsappDeleteMessage = (message) => {
  if (!message || message.type !== 'unsupported') return false
  const errors = Array.isArray(message.errors) ? message.errors : []
  if (errors.some((error) => Number(error?.code) === WHATSAPP_DELETED_MESSAGE_ERROR)) return true
  const errorText = JSON.stringify(errors).toLowerCase()
  return errorText.includes('deleted') || errorText.includes('delete')
}

const getAttachmentUploadPath = (attachment) => {
  const candidates = [attachment?.storagePath, attachment?.thumbnail].filter(Boolean)
  const { uploadsDir } = getLabnoteStorage()
  for (const candidate of candidates) {
    let pathname = String(candidate)
    try {
      if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname
    } catch {
      // Keep original string and try it as a local upload path.
    }
    if (!pathname.includes(LABNOTE_UPLOADS_PREFIX)) continue
    const safePath = toSafeUploadPath(uploadsDir, pathname)
    if (safePath) return safePath
  }
  return null
}

const deleteLocalAttachmentFile = (attachment) => {
  const fullPath = getAttachmentUploadPath(attachment)
  if (!fullPath) return false
  try {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      fs.unlinkSync(fullPath)
      return true
    }
  } catch {
    return false
  }
  return false
}

const ensureWhatsappEntry = (state, dateBucket, sentDate, config) => {
  const entryId = `entry-whatsapp-${dateBucket}`
  const existing = state.entries[entryId]
  if (existing) {
    existing.whatsappCaptures = Array.isArray(existing.whatsappCaptures) ? existing.whatsappCaptures : []
    existing.source = 'whatsapp'
    return existing
  }

  const createdDatetime = sentDate.toISOString()
  const entry = {
    id: entryId,
    createdDatetime,
    lastEditedDatetime: createdDatetime,
    authorId: 'whatsapp',
    title: `WhatsApp captures - ${displayDateForZone(sentDate, config.timezone)}`,
    dateBucket,
    isDaily: true,
    content: [],
    tags: ['WhatsApp'],
    projectTags: [],
    experimentTags: [],
    searchTerms: ['WhatsApp'],
    linkedFiles: [],
    pinnedRegions: [],
    source: 'whatsapp',
    whatsappCaptures: [],
  }
  state.entries[entryId] = entry
  return entry
}

const buildWhatsappBlocks = (capture, config) => {
  const seed = stableShortHash(capture.messageId)
  const sentDate = new Date(capture.sentAt)
  const headerText = `${displayTimeForZone(sentDate, config.timezone)} WhatsApp`
  const blocks = [
    {
      id: `b-wa-${seed}-head`,
      type: 'heading',
      level: 3,
      text: headerText,
      updatedAt: capture.receivedAt,
      updatedBy: 'whatsapp',
    },
  ]

  if (capture.text) {
    blocks.push({
      id: `b-wa-${seed}-text`,
      type: 'paragraph',
      text: capture.text,
      updatedAt: capture.receivedAt,
      updatedBy: 'whatsapp',
    })
  }

  capture.attachmentIds.forEach((attachmentId, index) => {
    blocks.push({
      id: `b-wa-${seed}-att-${index + 1}`,
      type: capture.type === 'image' ? 'image' : 'file',
      attachmentId,
      caption: capture.type === 'image' ? capture.text || 'WhatsApp image' : undefined,
      label: capture.type === 'image' ? undefined : 'WhatsApp attachment',
      updatedAt: capture.receivedAt,
      updatedBy: 'whatsapp',
    })
  })

  blocks.push({ id: `b-wa-${seed}-div`, type: 'divider', updatedAt: capture.receivedAt, updatedBy: 'whatsapp' })
  return blocks
}

const rebuildWhatsappEntryContent = (entry, config) => {
  const captures = Array.isArray(entry.whatsappCaptures) ? entry.whatsappCaptures : []
  const sorted = [...captures].sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)))
  entry.whatsappCaptures = sorted.map((capture) => {
    const blocks = buildWhatsappBlocks(capture, config)
    return { ...capture, blockIds: blocks.map((block) => block.id) }
  })
  entry.content = entry.whatsappCaptures.flatMap((capture) => buildWhatsappBlocks(capture, config))
  entry.linkedFiles = Array.from(new Set(entry.whatsappCaptures.flatMap((capture) => capture.attachmentIds || [])))
  entry.searchTerms = Array.from(
    new Set([
      ...(Array.isArray(entry.searchTerms) ? entry.searchTerms : []),
      'WhatsApp',
      ...entry.whatsappCaptures.flatMap((capture) => [
        capture.sender,
        capture.messageId,
        ...(capture.mediaIds || []),
      ]),
    ].filter(Boolean))
  )
  entry.lastEditedDatetime = new Date().toISOString()
}

const saveWhatsappMedia = (media, message, dateBucket) => {
  const { uploadsDir } = getLabnoteStorage()
  const mediaId = message?.[message.type]?.id || message?.image?.id || 'media'
  const baseName = safeUploadBaseName(media.filename || `${mediaId}${extensionForMime(media.contentType) || '.bin'}`)
  const ext = path.extname(baseName) || extensionForMime(media.contentType) || '.bin'
  const stem = baseName.replace(new RegExp(`${ext.replace('.', '\\.')}$`), '') || 'whatsapp'
  const suffix = stableShortHash(`${message.id}-${mediaId}`, 10)
  const relativeDir = path.join('whatsapp', dateBucket)
  const fullDir = path.join(uploadsDir, relativeDir)
  fs.mkdirSync(fullDir, { recursive: true })
  const finalName = `${stem}-${suffix}${ext}`
  const fullPath = path.join(fullDir, finalName)
  fs.writeFileSync(fullPath, media.buffer)
  const relativeUrl = path.join(relativeDir, finalName).split(path.sep).join('/')
  const uploadUrl = `${LABNOTE_UPLOADS_PREFIX}${relativeUrl}`
  return {
    uploadUrl,
    fullPath,
    finalName,
    sha256: crypto.createHash('sha256').update(media.buffer).digest('hex'),
    sizeKb: `${Math.max(1, Math.round(media.buffer.length / 1024))} KB`,
  }
}

const downloadWhatsappMedia = async (mediaId, config) => {
  if (!config.accessToken) throw new Error('WhatsApp access token is not configured.')
  const graphUrl = `https://graph.facebook.com/${config.graphApiVersion}/${encodeURIComponent(mediaId)}`
  const metadataResponse = await fetch(graphUrl, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  })
  if (!metadataResponse.ok) throw new Error(`Media metadata request failed: HTTP ${metadataResponse.status}`)
  const metadata = await metadataResponse.json()
  if (!metadata?.url) throw new Error('Media metadata response did not include a URL.')

  const fileResponse = await fetch(metadata.url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  })
  if (!fileResponse.ok) throw new Error(`Media download failed: HTTP ${fileResponse.status}`)
  const buffer = Buffer.from(await fileResponse.arrayBuffer())
  const contentType = fileResponse.headers.get('content-type') || metadata.mime_type || 'application/octet-stream'
  return {
    buffer,
    contentType,
    filename: metadata.file_name || `${mediaId}${extensionForMime(contentType) || ''}`,
  }
}

const upsertWhatsappMessage = async (message, config) => {
  const sender = normalizeSender(message.from)
  const messageId = String(message.id || '')
  if (!messageId) return { action: 'skipped', reason: 'missing-message-id' }
  if (!isAllowedWhatsappSender(sender, config)) return { action: 'ignored', reason: 'sender-not-allowed' }

  const state = readWritableLabnoteState()
  const alreadyImported = Object.values(state.entries).some((entry) =>
    Array.isArray(entry?.whatsappCaptures) && entry.whatsappCaptures.some((capture) => capture.messageId === messageId)
  )
  if (alreadyImported) return { action: 'skipped', reason: 'duplicate-message' }

  const sentDate = parseWhatsappSentDate(message.timestamp)
  const dateBucket = dateBucketForZone(sentDate, config.timezone)
  const entry = ensureWhatsappEntry(state, dateBucket, sentDate, config)
  const receivedAt = new Date().toISOString()
  const attachmentIds = []
  const mediaIds = []
  let text = ''
  let type = message.type === 'image' ? 'image' : message.type === 'text' ? 'text' : 'unsupported'

  if (message.type === 'text') {
    text = String(message.text?.body || '').trim()
  } else if (message.type === 'image') {
    const image = message.image || {}
    const mediaId = String(image.id || '')
    text = String(image.caption || '').trim()
    if (mediaId) {
      mediaIds.push(mediaId)
      const downloaded = await downloadWhatsappMedia(mediaId, config)
      const saved = saveWhatsappMedia(downloaded, message, dateBucket)
      const attachmentId = `att-wa-${stableShortHash(`${messageId}-${mediaId}`)}`
      const attachment = {
        id: attachmentId,
        entryId: entry.id,
        type: 'image',
        filename: saved.finalName,
        filesize: saved.sizeKb,
        storagePath: saved.uploadUrl,
        thumbnail: saved.uploadUrl,
        pinnedOffline: true,
        source: 'whatsapp',
        sourceMessageId: messageId,
        sourceMediaId: mediaId,
        contentType: downloaded.contentType,
        sha256: saved.sha256,
      }
      state.attachments = state.attachments.filter((item) => item.id !== attachmentId)
      state.attachments.unshift(attachment)
      attachmentIds.push(attachmentId)
    }
  } else {
    type = 'unsupported'
    text = `Unsupported WhatsApp message type: ${message.type || 'unknown'}`
  }

  const capture = {
    messageId,
    sender,
    sentAt: sentDate.toISOString(),
    receivedAt,
    type,
    text,
    blockIds: [],
    attachmentIds,
    mediaIds,
  }
  entry.whatsappCaptures = [...(Array.isArray(entry.whatsappCaptures) ? entry.whatsappCaptures : []), capture]
  rebuildWhatsappEntryContent(entry, config)
  writeLabnoteState(state)
  return { action: 'imported', entryId: entry.id, attachmentIds }
}

const hardDeleteWhatsappMessage = (message, config) => {
  const sender = normalizeSender(message.from)
  const messageId = String(message.id || '')
  if (!messageId) return { action: 'skipped', reason: 'missing-message-id' }
  if (!isAllowedWhatsappSender(sender, config)) return { action: 'ignored', reason: 'sender-not-allowed' }

  const state = readWritableLabnoteState()
  let deleted = false
  const attachmentIdsToDelete = new Set()

  Object.entries(state.entries).forEach(([entryId, entry]) => {
    if (!Array.isArray(entry?.whatsappCaptures)) return
    const captures = entry.whatsappCaptures
    const remaining = captures.filter((capture) => {
      const match = capture.messageId === messageId && normalizeSender(capture.sender) === sender
      if (match) {
        deleted = true
        ;(capture.attachmentIds || []).forEach((id) => attachmentIdsToDelete.add(id))
      }
      return !match
    })

    if (remaining.length === captures.length) return
    if (remaining.length === 0 && entry.source === 'whatsapp' && entryId.startsWith('entry-whatsapp-')) {
      delete state.entries[entryId]
      return
    }
    entry.whatsappCaptures = remaining
    rebuildWhatsappEntryContent(entry, config)
  })

  if (!deleted) return { action: 'skipped', reason: 'no-matching-capture' }

  state.attachments = state.attachments.filter((attachment) => {
    if (!attachmentIdsToDelete.has(attachment.id)) return true
    deleteLocalAttachmentFile(attachment)
    return false
  })
  writeLabnoteState(state)
  return { action: 'deleted', attachmentCount: attachmentIdsToDelete.size }
}

const handleWhatsappWebhookRequest = async (req, res) => {
  const config = readWhatsappConfig()
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
  const pathname = requestUrl.pathname
  const method = String(req.method || 'GET').toUpperCase()

  if (pathname === '/health' || pathname === '/whatsapp/health') {
    sendJson(res, 200, { ok: true, service: 'easylab-whatsapp-intake', config: getWhatsappConfigStatus(config) })
    return
  }

  if (pathname !== '/whatsapp/webhook') {
    sendJson(res, 404, { ok: false, error: 'Not found' })
    return
  }

  if (!config.enabled) {
    sendJson(res, 503, { ok: false, error: 'WhatsApp intake is disabled.' })
    return
  }

  if (method === 'GET') {
    const mode = requestUrl.searchParams.get('hub.mode')
    const token = requestUrl.searchParams.get('hub.verify_token')
    const challenge = requestUrl.searchParams.get('hub.challenge') || ''
    if (mode === 'subscribe' && token && token === config.verifyToken) {
      sendPlain(res, 200, challenge)
      return
    }
    sendJson(res, 403, { ok: false, error: 'Verification failed.' })
    return
  }

  if (method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const rawBody = await readRawBody(req)
    if (!verifyWhatsappSignature(rawBody, config.appSecret, req.headers['x-hub-signature-256'])) {
      sendJson(res, 403, { ok: false, error: 'Invalid webhook signature.' })
      return
    }
    const payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}
    const results = []
    for (const { message } of extractWhatsappMessages(payload)) {
      if (isWhatsappDeleteMessage(message)) {
        results.push(hardDeleteWhatsappMessage(message, config))
      } else {
        results.push(await upsertWhatsappMessage(message, config))
      }
    }
    sendJson(res, 200, { ok: true, results })
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

const startWhatsappIntakeServer = async () => {
  const config = readWhatsappConfig()
  if (!config.enabled) return null
  if (await isPortOpen(config.port)) return null

  const server = http.createServer((req, res) => {
    void handleWhatsappWebhookRequest(req, res)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, '127.0.0.1', resolve)
  })
  return server
}

const stopWhatsappIntakeServer = () => {
  if (!whatsappIntakeServer) return
  whatsappIntakeServer.close()
  whatsappIntakeServer = null
}

const isAllowedTelegramChat = (chatId, config) => {
  const normalized = normalizeTelegramChatId(chatId)
  if (!normalized || config.allowedChatIds.length === 0) return false
  return config.allowedChatIds.includes(normalized)
}

const telegramApiRequest = async (config, method, params = {}) => {
  if (!config.botToken) throw new Error('Telegram bot token is not configured.')
  const url = new URL(`https://api.telegram.org/bot${config.botToken}/${method}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Telegram ${method} failed: HTTP ${response.status}`)
  const payload = await response.json()
  if (!payload?.ok) throw new Error(`Telegram ${method} failed: ${payload?.description || 'unknown error'}`)
  return payload.result
}

const parseTelegramSentDate = (seconds) => {
  const value = Number(seconds)
  if (Number.isFinite(value) && value > 0) return new Date(value * 1000)
  return new Date()
}

const ensureTelegramEntry = (state, dateBucket, sentDate, config) => {
  const entryId = `entry-telegram-${dateBucket}`
  const existing = state.entries[entryId]
  if (existing) {
    existing.telegramCaptures = Array.isArray(existing.telegramCaptures) ? existing.telegramCaptures : []
    existing.source = existing.source || 'telegram'
    return existing
  }

  const createdDatetime = sentDate.toISOString()
  const entry = {
    id: entryId,
    createdDatetime,
    lastEditedDatetime: createdDatetime,
    authorId: 'telegram',
    title: `Telegram captures - ${displayDateForZone(sentDate, config.timezone)}`,
    dateBucket,
    isDaily: true,
    content: [],
    tags: ['Telegram'],
    projectTags: [],
    experimentTags: [],
    searchTerms: ['Telegram'],
    linkedFiles: [],
    pinnedRegions: [],
    source: 'telegram',
    telegramCaptures: [],
  }
  state.entries[entryId] = entry
  return entry
}

const buildTelegramBlocks = (capture, config) => {
  const seed = stableShortHash(capture.messageId)
  const sentDate = new Date(capture.sentAt)
  const headerText = `${displayTimeForZone(sentDate, config.timezone)} Telegram`
  const blocks = [
    {
      id: `b-tg-${seed}-head`,
      type: 'heading',
      level: 3,
      text: headerText,
      updatedAt: capture.receivedAt,
      updatedBy: 'telegram',
    },
  ]

  if (capture.text) {
    blocks.push({
      id: `b-tg-${seed}-text`,
      type: 'paragraph',
      text: capture.text,
      updatedAt: capture.receivedAt,
      updatedBy: 'telegram',
    })
  }

  capture.attachmentIds.forEach((attachmentId, index) => {
    blocks.push({
      id: `b-tg-${seed}-att-${index + 1}`,
      type: capture.type === 'image' ? 'image' : 'file',
      attachmentId,
      caption: capture.type === 'image' ? capture.text || 'Telegram image' : undefined,
      label: capture.type === 'image' ? undefined : 'Telegram attachment',
      updatedAt: capture.receivedAt,
      updatedBy: 'telegram',
    })
  })

  blocks.push({ id: `b-tg-${seed}-div`, type: 'divider', updatedAt: capture.receivedAt, updatedBy: 'telegram' })
  return blocks
}

const rebuildTelegramEntryContent = (entry, config) => {
  const captures = Array.isArray(entry.telegramCaptures) ? entry.telegramCaptures : []
  const sorted = [...captures].sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)))
  entry.telegramCaptures = sorted.map((capture) => {
    const blocks = buildTelegramBlocks(capture, config)
    return { ...capture, blockIds: blocks.map((block) => block.id) }
  })
  entry.content = entry.telegramCaptures.flatMap((capture) => buildTelegramBlocks(capture, config))
  entry.linkedFiles = Array.from(new Set(entry.telegramCaptures.flatMap((capture) => capture.attachmentIds || [])))
  entry.searchTerms = Array.from(
    new Set([
      ...(Array.isArray(entry.searchTerms) ? entry.searchTerms : []),
      'Telegram',
      ...entry.telegramCaptures.flatMap((capture) => [
        capture.chatId,
        capture.messageId,
        capture.fromUsername,
        ...(capture.mediaIds || []),
      ]),
    ].filter(Boolean))
  )
  entry.lastEditedDatetime = new Date().toISOString()
}

const saveTelegramMedia = (media, message, dateBucket) => {
  const { uploadsDir } = getLabnoteStorage()
  const messageId = String(message?.message_id || 'message')
  const baseName = safeUploadBaseName(media.filename || `${media.fileId}${extensionForMime(media.contentType) || '.bin'}`)
  const ext = path.extname(baseName) || extensionForMime(media.contentType) || '.bin'
  const stem = baseName.replace(new RegExp(`${ext.replace('.', '\\.')}$`), '') || 'telegram'
  const suffix = stableShortHash(`${message.chat?.id}-${messageId}-${media.fileId}`, 10)
  const relativeDir = path.join('telegram', dateBucket)
  const fullDir = path.join(uploadsDir, relativeDir)
  fs.mkdirSync(fullDir, { recursive: true })
  const finalName = `${stem}-${suffix}${ext}`
  const fullPath = path.join(fullDir, finalName)
  fs.writeFileSync(fullPath, media.buffer)
  const relativeUrl = path.join(relativeDir, finalName).split(path.sep).join('/')
  const uploadUrl = `${LABNOTE_UPLOADS_PREFIX}${relativeUrl}`
  return {
    uploadUrl,
    fullPath,
    finalName,
    sha256: crypto.createHash('sha256').update(media.buffer).digest('hex'),
    sizeKb: `${Math.max(1, Math.round(media.buffer.length / 1024))} KB`,
  }
}

const downloadTelegramMedia = async (fileId, config, fallbackFilename, fallbackContentType) => {
  const file = await telegramApiRequest(config, 'getFile', { file_id: fileId })
  if (!file?.file_path) throw new Error('Telegram getFile response did not include file_path.')
  const response = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`)
  if (!response.ok) throw new Error(`Telegram media download failed: HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') || fallbackContentType || 'application/octet-stream'
  return {
    buffer,
    contentType,
    fileId,
    filename: fallbackFilename || path.basename(file.file_path) || `${fileId}${extensionForMime(contentType) || ''}`,
  }
}

const getTelegramMessageMedia = (message) => {
  const photos = Array.isArray(message?.photo) ? message.photo : []
  if (photos.length > 0) {
    const photo = [...photos].sort((a, b) => Number(b?.file_size || 0) - Number(a?.file_size || 0))[0]
    return {
      type: 'image',
      fileId: String(photo?.file_id || ''),
      filename: `${message.message_id || 'telegram-photo'}.jpg`,
      contentType: 'image/jpeg',
    }
  }
  const document = message?.document
  if (document?.file_id && String(document.mime_type || '').toLowerCase().startsWith('image/')) {
    return {
      type: 'image',
      fileId: String(document.file_id),
      filename: document.file_name || `${message.message_id || 'telegram-document'}${extensionForMime(document.mime_type) || ''}`,
      contentType: document.mime_type || 'application/octet-stream',
    }
  }
  return null
}

const upsertTelegramMessage = async (message, config) => {
  const chatId = normalizeTelegramChatId(message?.chat?.id)
  const telegramMessageId = String(message?.message_id || '')
  const messageId = chatId && telegramMessageId ? `${chatId}:${telegramMessageId}` : ''
  if (!messageId) return { action: 'skipped', reason: 'missing-message-id' }
  if (!isAllowedTelegramChat(chatId, config)) return { action: 'ignored', reason: 'chat-not-allowed' }

  const state = readWritableLabnoteState()
  const alreadyImported = Object.values(state.entries).some((entry) =>
    Array.isArray(entry?.telegramCaptures) && entry.telegramCaptures.some((capture) => capture.messageId === messageId)
  )
  if (alreadyImported) return { action: 'skipped', reason: 'duplicate-message' }

  const text = String(message.text || message.caption || '').trim()
  const media = getTelegramMessageMedia(message)
  if (!text && !media) return { action: 'skipped', reason: 'unsupported-message' }

  const sentDate = parseTelegramSentDate(message.date)
  const dateBucket = dateBucketForZone(sentDate, config.timezone)
  const entry = ensureTelegramEntry(state, dateBucket, sentDate, config)
  const receivedAt = new Date().toISOString()
  const attachmentIds = []
  const mediaIds = []
  let type = media?.type || 'text'

  if (media?.fileId) {
    mediaIds.push(media.fileId)
    const downloaded = await downloadTelegramMedia(media.fileId, config, media.filename, media.contentType)
    const saved = saveTelegramMedia(downloaded, message, dateBucket)
    const attachmentId = `att-tg-${stableShortHash(`${messageId}-${media.fileId}`)}`
    const attachment = {
      id: attachmentId,
      entryId: entry.id,
      type,
      filename: saved.finalName,
      filesize: saved.sizeKb,
      storagePath: saved.uploadUrl,
      thumbnail: type === 'image' ? saved.uploadUrl : undefined,
      pinnedOffline: true,
      source: 'telegram',
      sourceMessageId: messageId,
      sourceMediaId: media.fileId,
      contentType: downloaded.contentType,
      sha256: saved.sha256,
    }
    state.attachments = state.attachments.filter((item) => item.id !== attachmentId)
    state.attachments.unshift(attachment)
    attachmentIds.push(attachmentId)
  }

  const capture = {
    messageId,
    chatId,
    telegramMessageId,
    fromUsername: message.from?.username ? `@${message.from.username}` : '',
    fromName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' '),
    sentAt: sentDate.toISOString(),
    receivedAt,
    type,
    text,
    blockIds: [],
    attachmentIds,
    mediaIds,
  }
  entry.telegramCaptures = [...(Array.isArray(entry.telegramCaptures) ? entry.telegramCaptures : []), capture]
  rebuildTelegramEntryContent(entry, config)
  writeLabnoteState(state)
  return { action: 'imported', entryId: entry.id, attachmentIds }
}

const pollTelegramUpdates = async (config) => {
  const runtimeState = readTelegramRuntimeState()
  const params = {
    timeout: 0,
    limit: 50,
  }
  if (Number.isFinite(Number(runtimeState.lastUpdateId))) {
    params.offset = Number(runtimeState.lastUpdateId) + 1
  }

  const updates = await telegramApiRequest(config, 'getUpdates', params)
  if (!Array.isArray(updates) || updates.length === 0) return []

  const results = []
  let lastUpdateId = Number(runtimeState.lastUpdateId)
  if (!Number.isFinite(lastUpdateId)) lastUpdateId = null

  for (const update of updates) {
    const updateId = Number(update?.update_id)
    try {
      if (update?.message) results.push(await upsertTelegramMessage(update.message, config))
    } catch (err) {
      results.push({ action: 'error', error: err instanceof Error ? err.message : String(err) })
    }
    if (Number.isFinite(updateId)) {
      lastUpdateId = lastUpdateId === null ? updateId : Math.max(lastUpdateId, updateId)
      writeTelegramRuntimeState({ lastUpdateId })
    }
  }
  return results
}

const startTelegramIntakePoller = () => {
  const config = readTelegramConfig()
  if (!config.enabled) return null
  if (!config.botToken) throw new Error('Telegram bot token is not configured.')
  if (config.allowedChatIds.length === 0) throw new Error('Telegram allowedChatIds is empty.')

  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await pollTelegramUpdates(config)
    } catch (err) {
      console.warn('Telegram intake poll failed', err)
    } finally {
      running = false
    }
  }

  const interval = setInterval(() => {
    void tick()
  }, config.pollIntervalMs)
  void tick()

  return {
    stop: () => clearInterval(interval),
    config,
  }
}

const stopTelegramIntakePoller = () => {
  if (!telegramIntakePoller) return
  telegramIntakePoller.stop()
  telegramIntakePoller = null
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

app.whenReady().then(async () => {
  if (isWhatsappIntakeMode || isTelegramIntakeMode) {
    try {
      if (isWhatsappIntakeMode) {
        whatsappIntakeServer = await startWhatsappIntakeServer()
        if (!whatsappIntakeServer) app.quit()
      }
      if (isTelegramIntakeMode) {
        telegramIntakePoller = startTelegramIntakePoller()
        if (!telegramIntakePoller) app.quit()
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      app.quit()
    }
    return
  }

  startWhatsappIntakeServer()
    .then((server) => {
      if (server) whatsappIntakeServer = server
    })
    .catch((err) => console.warn('WhatsApp intake not started', err))

  try {
    telegramIntakePoller = startTelegramIntakePoller()
  } catch (err) {
    console.warn('Telegram intake not started', err)
  }

  createSuiteWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createSuiteWindow()
  })
})

app.on('before-quit', () => {
  Array.from(backendProcesses.keys()).forEach((moduleId) => stopBackend(moduleId))
  Array.from(staticServers.keys()).forEach((moduleId) => stopStaticServer(moduleId))
  stopWhatsappIntakeServer()
  stopTelegramIntakePoller()
})

app.on('window-all-closed', () => {
  Array.from(backendProcesses.keys()).forEach((moduleId) => stopBackend(moduleId))
  Array.from(staticServers.keys()).forEach((moduleId) => stopStaticServer(moduleId))
  if (!isWhatsappIntakeMode) stopWhatsappIntakeServer()
  if (!isTelegramIntakeMode) stopTelegramIntakePoller()
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
