const fs = require('node:fs')
const path = require('node:path')

// Suite-owned presentation is applied to bundled modules without changing their data or calculations.
function mountModuleShell({ moduleId, label, modules, theme }) {
  const api = window.electronAPI
  if (!api?.returnToSuite) return
  const previousShell = document.getElementById('easylab-module-shell')
  previousShell?.dispatchEvent(new Event('easylab-dispose'))
  previousShell?.remove()
  document.getElementById('easylab-module-theme')?.remove()
  document.documentElement.dataset.easylabModule = moduleId
  const style = document.createElement('style')
  style.id = 'easylab-module-theme'
  style.textContent = theme
  document.head.append(style)

  const shell = document.createElement('div')
  shell.id = 'easylab-module-shell'
  // Shadow DOM prevents module button, select and modal styles from leaking into navigation.
  const root = shell.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>
    :host { position: fixed; inset: 0 0 auto; z-index: 2147483400; display: block; font: 14px/1.4 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #fff; }
    * { box-sizing: border-box; }
    header { height: 64px; background: #153b3b; border-bottom: 1px solid #254a49; padding: 0 28px; display: flex; align-items: center; justify-content: space-between; gap: 18px; }
    .identity, .actions { display: flex; align-items: center; gap: 20px; min-width: 0; }
    .brand { font-size: 18px; font-weight: 600; white-space: nowrap; }
    .title { border-left: 1px solid #668580; padding-left: 20px; color: #e1eeeb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actions { flex-shrink: 0; gap: 12px; }
    button, select { font: inherit; border-radius: 6px; min-height: 36px; padding: 7px 13px; border: 1px solid #a1b8b3; background: #fff; color: #172e35; cursor: pointer; }
    select { width: 212px; }
    button:hover { background: #e8f2ef; }
    .home { color: #fff; background: #226b60; border-color: #448f82; }
    .home:hover { background: #2b7e71; }
    :is(button,select):focus-visible { outline: 3px solid #84dbc9; outline-offset: 3px; }
    button:disabled, select:disabled { opacity: .65; cursor: wait; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .error { margin: 0; padding: 12px 28px; background: #fff1ed; color: #8b3026; border-bottom: 1px solid #e4b3ab; }
    .error[hidden] { display: none; }
    dialog { width: min(430px, calc(100vw - 36px)); border: 1px solid #d9e2e5; border-radius: 12px; padding: 26px; color: #172e35; background: #fff; box-shadow: 0 20px 80px #153b3b33; }
    dialog::backdrop { background: #142e3766; backdrop-filter: blur(3px); }
    dialog h2 { margin: 0 0 12px; font-size: 22px; font-weight: 600; }
    dialog p { color: #586971; line-height: 1.6; margin: 0 0 24px; }
    .dialog-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    .leave { background: #16766b; color: #fff; border-color: #16766b; }
    @media (max-width: 760px) { header { padding: 0 16px; gap: 12px; } .brand { display: none; } .title { padding: 0; border: 0; font-size: 14px; font-weight: 600; } select { width: 160px; } }
    @media (max-width: 480px) { .identity { display: none; } .actions { width: 100%; justify-content: space-between; } select { width: min(220px, 65vw); } }
    </style><header aria-label="Suite navigation"><div class="identity"><span class="brand">Easylab Suite</span><span class="title"></span></div><div class="actions"><label class="sr-only" for="tool-switcher">Switch tool</label><select id="tool-switcher"></select><button class="home" type="button">All tools</button></div></header><p class="error" role="alert" hidden></p><dialog aria-labelledby="leave-heading"><h2 id="leave-heading">Leave this tool?</h2><p>Changes in this tool may be lost. Export any results you want to keep before leaving.</p><div class="dialog-actions"><button class="stay" type="button">Keep working</button><button class="leave" type="button">Leave tool</button></div></dialog>`
  root.querySelector('.title').textContent = label
  const select = root.querySelector('select')
  for (const module of modules) {
    const option = document.createElement('option')
    option.value = module.id
    option.textContent = module.label
    select.append(option)
  }
  select.value = moduleId
  const home = root.querySelector('.home')
  const dialog = root.querySelector('dialog')
  const error = root.querySelector('.error')
  let edited = false
  let busy = false
  let destination = null
  let trigger = null
  const controller = new AbortController()
  shell.addEventListener('easylab-dispose', () => controller.abort(), { once: true })
  if (moduleId === 'qpcr-planner' || moduleId === 'elisa-analysis') {
    // Older module themes override the data-driven inline well colours with !important.
    // Preserve the module's own colour, including later React updates, above those rules.
    const restoreWellColor = node => {
      if (!(node instanceof HTMLElement)) return
      if (node.matches('.well-square') && node.style.backgroundColor && node.style.getPropertyPriority('background-color') !== 'important') {
        node.style.setProperty('background-color', node.style.backgroundColor, 'important')
      }
      if (node.matches('.well-square')) {
        const rgb = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number)
        if (rgb?.length === 3) {
          const linear = rgb.map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4 })
          const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
          const text = luminance > .179 ? '#000' : '#fff'
          if (node.style.getPropertyValue('--easylab-well-text') !== text) node.style.setProperty('--easylab-well-text', text)
        }
      }
      node.querySelectorAll('.well-square').forEach(restoreWellColor)
    }
    restoreWellColor(document.body)
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') restoreWellColor(record.target)
        else record.addedNodes.forEach(restoreWellColor)
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] })
    shell.addEventListener('easylab-dispose', () => observer.disconnect(), { once: true })
  }
  const markEdited = event => {
    if (event.composedPath().includes(shell)) return
    // Example-data and calculate buttons can create work without emitting an input event.
    if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"],button')) edited = true
  }
  for (const event of ['input', 'change', 'click']) document.addEventListener(event, markEdited, { signal: controller.signal })
  const navigate = async target => {
    if (busy) return
    busy = true
    select.disabled = true
    home.disabled = true
    error.hidden = true
    try {
      if (target === 'home') await api.returnToSuite()
      else await api.openModuleInSuite(target)
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : 'This tool could not open. Please try again.'
      error.hidden = false
    } finally {
      busy = false
      select.disabled = false
      home.disabled = false
      select.value = moduleId
    }
  }
  const requestNavigation = target => {
    if (busy || target === moduleId) return
    trigger = root.activeElement
    select.value = moduleId
    if (edited) { destination = target; dialog.showModal(); root.querySelector('.stay').focus() }
    else void navigate(target)
  }
  home.addEventListener('click', () => requestNavigation('home'))
  select.addEventListener('change', () => requestNavigation(select.value))
  root.querySelector('.stay').addEventListener('click', () => dialog.close())
  root.querySelector('.leave').addEventListener('click', () => { dialog.close(); void navigate(destination) })
  dialog.addEventListener('close', () => trigger?.focus())
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return
    const buttons = [...dialog.querySelectorAll('button')]
    const next = (buttons.indexOf(root.activeElement) + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
    event.preventDefault()
    buttons[next].focus()
  })
  document.body.append(shell)
}

function buildModuleShellOverlayScript(moduleId, label, modules) {
  const theme = fs.readFileSync(path.join(__dirname, 'module-theme.css'), 'utf8')
  return `;(${mountModuleShell.toString()})(${JSON.stringify({ moduleId, label, modules, theme })});`
}
module.exports = { buildModuleShellOverlayScript }
