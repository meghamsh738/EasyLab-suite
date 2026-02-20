const { contextBridge, ipcRenderer } = require('electron')

const moduleArg = process.argv.find((arg) => arg.startsWith('--easylab-module='))
const moduleId = moduleArg ? moduleArg.split('=')[1] : null

contextBridge.exposeInMainWorld('electronAPI', {
  launchModule: (target) => ipcRenderer.invoke('launch-module', target),
  getSuiteInfo: () => ipcRenderer.invoke('get-suite-info'),
  selectDirectory: (options) => ipcRenderer.invoke('select-directory', options),
  ensureDirectories: (paths) => ipcRenderer.invoke('ensure-directories', paths),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getDefaultPaths: () => ipcRenderer.invoke('get-default-paths', moduleId),
  getZoomFactor: () => ipcRenderer.invoke('get-zoom-factor'),
  setZoomFactor: (value) => ipcRenderer.invoke('set-zoom-factor', value),
})
