const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('widget', {
  getCfg: () => ipcRenderer.invoke('get-cfg'),
  setCfg: (patch) => ipcRenderer.send('set-cfg', patch),
  onCfg: (cb) => ipcRenderer.on('cfg', (_e, c) => cb(c)),
  getSize: () => ipcRenderer.invoke('get-size'),
  setSize: (s) => ipcRenderer.send('set-size', s),
  react: (name) => ipcRenderer.send('react', name),
  onReact: (cb) => ipcRenderer.on('react', (_e, n) => cb(n)),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onDragging: (cb) => ipcRenderer.on('dragging', () => cb()),
  resizeStart: () => ipcRenderer.send('resize-start'),
  resizeEnd: () => ipcRenderer.send('resize-end'),
  toggleSettings: () => ipcRenderer.send('toggle-settings'),
  quit: () => ipcRenderer.send('quit'),
})
