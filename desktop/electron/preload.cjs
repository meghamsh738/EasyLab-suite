const { contextBridge, ipcRenderer } = require('electron')

const moduleArg = process.argv.find((arg) => arg.startsWith('--easylab-module='))
const moduleIdFromArg = moduleArg ? moduleArg.split('=')[1] : null
const moduleIdFromUrl = (() => {
  try {
    return new URL(window.location.href).searchParams.get('easylabModule')
  } catch {
    return null
  }
})()
const moduleId = moduleIdFromArg || moduleIdFromUrl

contextBridge.exposeInMainWorld('electronAPI', {
  launchModule: (target) => ipcRenderer.invoke('launch-module', target),
  openModuleInSuite: (target) => ipcRenderer.invoke('open-module-in-suite', target),
  returnToSuite: () => ipcRenderer.invoke('return-to-suite'),
  prewarmModule: (target) => ipcRenderer.invoke('prewarm-module', target),
  prepareModuleLaunch: (target) => ipcRenderer.invoke('prepare-module-launch', target),
  getSuiteInfo: () => ipcRenderer.invoke('get-suite-info'),
  selectDirectory: (options) => ipcRenderer.invoke('select-directory', options),
  ensureDirectories: (paths) => ipcRenderer.invoke('ensure-directories', paths),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getDefaultPaths: (target) => ipcRenderer.invoke('get-default-paths', target || moduleId),
  getPairingLink: () => ipcRenderer.invoke('get-pairing-link', moduleId),
  getZoomFactor: () => ipcRenderer.invoke('get-zoom-factor'),
  setZoomFactor: (value) => ipcRenderer.invoke('set-zoom-factor', value),
})
