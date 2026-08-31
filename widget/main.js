const { app, BrowserWindow, screen, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const SIZE = 180
const DEFAULTS = { skin: '#16181a', ink: '#e9ebec', pupils: false, mood: 'auto' }

const cfgPath = () => path.join(app.getPath('userData'), 'widget-config.json')
let cfg = { ...DEFAULTS }
try {
  cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) }
} catch {}

let win = null
let settings = null

function createWindow() {
  win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    transparent: true,
    frame: false,
    resizable: true,
    minWidth: 80,
    minHeight: 80,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setAspectRatio(1)
  win.loadFile('index.html')

  // The renderer can't see the pointer once it leaves the window, so global
  // gaze has to come from here.
  const poll = setInterval(() => {
    if (win.isDestroyed()) return clearInterval(poll)
    const p = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    if (resizing) {
      // Size the square so its corner tracks the cursor, keeping the centre put.
      const size = Math.max(
        80,
        Math.min(800, Math.round(2 * Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy))))
      )
      win.setBounds({
        x: Math.round(cx - size / 2),
        y: Math.round(cy - size / 2),
        width: size,
        height: size,
      })
    }
    win.webContents.send('cursor', { x: p.x - cx, y: p.y - cy })
  }, 33)

  win.on('move', () => {
    if (!win.isDestroyed() && !resizing && !adjusting) win.webContents.send('dragging')
  })
}

function toggleSettings() {
  if (settings && !settings.isDestroyed()) {
    settings.close()
    return
  }
  const W = 380
  const H = 590
  const b = win.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  let x = b.x + b.width + 14
  if (x + W > area.x + area.width) x = b.x - W - 14
  x = Math.max(area.x, Math.min(x, area.x + area.width - W))
  const y = Math.max(area.y, Math.min(b.y, area.y + area.height - H))

  settings = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  settings.loadFile('settings.html')
  settings.on('closed', () => (settings = null))
}

let resizing = false
let adjusting = false
let adjustTimer

const broadcast = () => {
  for (const w of [win, settings]) {
    if (w && !w.isDestroyed()) w.webContents.send('cfg', cfg)
  }
}

ipcMain.handle('get-cfg', () => cfg)
ipcMain.handle('get-size', () => (win && !win.isDestroyed() ? win.getBounds().width : SIZE))
ipcMain.on('set-cfg', (_e, patch) => {
  cfg = { ...cfg, ...patch }
  try {
    fs.writeFileSync(cfgPath(), JSON.stringify(cfg))
  } catch {}
  broadcast()
})
ipcMain.on('react', (_e, name) => {
  if (win && !win.isDestroyed()) win.webContents.send('react', name)
})
ipcMain.on('set-size', (_e, size) => {
  if (!win || win.isDestroyed()) return
  const s = Math.max(80, Math.min(800, Math.round(size)))
  const b = win.getBounds()
  adjusting = true
  clearTimeout(adjustTimer)
  adjustTimer = setTimeout(() => (adjusting = false), 300)
  win.setBounds({
    x: Math.round(b.x + b.width / 2 - s / 2),
    y: Math.round(b.y + b.height / 2 - s / 2),
    width: s,
    height: s,
  })
})
ipcMain.on('resize-start', () => (resizing = true))
ipcMain.on('resize-end', () => (resizing = false))
ipcMain.on('toggle-settings', toggleSettings)
ipcMain.on('quit', () => app.quit())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) win.focus()
  })
  app.whenReady().then(createWindow)
  app.on('window-all-closed', () => app.quit())
}
