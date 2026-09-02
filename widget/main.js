const { app, BrowserWindow, screen, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const brain = require('./brain')
const bridge = require('./bridge')

const SIZE = 180
const ICON = path.join(__dirname, '..', 'docs', 'logo.png')
const DEFAULTS = {
  skin: '#16181a',
  ink: '#e9ebec',
  pupils: false,
  mood: 'auto',
  voice: true,
  voicePitch: 1,
  server: 'wss://bwnd.app/api/v1/incubators/public/bbots/ws',
  token: '', // the bbk_… device key
  incubator: '', // which of the user's incubators this bbot stands in for
  autoConnect: false,
}

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
    icon: ICON,
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
    } else if (moving) {
      // manual drag: the face is clickable, so the OS drag region is gone.
      // Full bounds with the size captured at drag start — setPosition alone
      // lets DPI rounding drift the size a pixel per tick.
      win.setBounds({
        x: Math.round(p.x - moving.dx),
        y: Math.round(p.y - moving.dy),
        width: moving.w,
        height: moving.h,
      })
    }
    win.webContents.send('cursor', { x: p.x - cx, y: p.y - cy })
  }, 33)

  win.on('move', () => {
    if (!win.isDestroyed() && !resizing && !adjusting) win.webContents.send('dragging')
    positionChat()
  })
}

// --- chat: a transparent bubble window anchored above the face ---
const CHAT_W = 320
let chat = null
let chatH = 60

function chatBounds() {
  const b = win.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  const gap = 6
  let x = Math.round(b.x + b.width / 2 - CHAT_W / 2)
  x = Math.max(area.x, Math.min(x, area.x + area.width - CHAT_W))
  // Prefer above, shrinking to the room there (the log scrolls inside);
  // only sit below when above is genuinely cramped AND below is roomier.
  const above = b.y - area.y - gap
  const below = area.y + area.height - (b.y + b.height) - gap
  let h
  let y
  if (above >= 160 || above >= below) {
    h = Math.max(60, Math.min(chatH, above))
    y = b.y - h - gap
  } else {
    h = Math.max(60, Math.min(chatH, below))
    y = b.y + b.height + gap
  }
  return { x, y: Math.round(y), width: CHAT_W, height: Math.round(h) }
}

function positionChat() {
  if (!chat || chat.isDestroyed() || !win || win.isDestroyed()) return
  chat.setBounds(chatBounds())
}

function hideChat() {
  chat.hide()
  if (win && !win.isDestroyed()) win.webContents.send('chat-state', { state: 'end' })
}

function showChat() {
  positionChat()
  chat.show()
  chat.webContents.send('chat-focus')
  if (win && !win.isDestroyed()) win.webContents.send('chat-state', { state: 'open' })
  openThread() // a pending notification opens straight into its thread
}

function toggleChat() {
  // hide/show, never destroy — the transcript lives in the window and only
  // the clear button empties it
  if (chat && !chat.isDestroyed()) {
    if (chat.isVisible()) hideChat()
    else showChat()
    return
  }
  chatH = 60 // a fresh chat starts compact; the page reports real size
  const at = chatBounds() // born in place — no centered flash, no jump
  chat = new BrowserWindow({
    ...at,
    icon: ICON,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  chat.setAlwaysOnTop(true, 'screen-saver')
  chat.loadFile('chat.html')
  // links in replies open in the real browser, never in-widget
  chat.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) require('electron').shell.openExternal(url)
    return { action: 'deny' }
  })
  chat.webContents.on('will-navigate', (e) => e.preventDefault())
  chat.once('ready-to-show', () => {
    positionChat()
    chat.show()
    chat.webContents.send('chat-focus')
    openThread() // a pending notification opens straight into its thread
  })
  chat.on('closed', () => {
    chat = null
    if (win && !win.isDestroyed()) win.webContents.send('chat-state', { state: 'end' })
  })
  if (win && !win.isDestroyed()) win.webContents.send('chat-state', { state: 'open' })
}

function toggleSettings() {
  if (settings && !settings.isDestroyed()) {
    settings.close()
    return
  }
  const W = 430
  const H = 620
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
    icon: ICON,
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
  settings.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) require('electron').shell.openExternal(url)
    return { action: 'deny' }
  })
  settings.webContents.on('will-navigate', (e) => e.preventDefault())
  settings.on('closed', () => (settings = null))
}

let resizing = false
let moving = null // {dx, dy}: cursor offset into the window while face-dragging
let adjusting = false
let adjustTimer

const broadcast = () => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('cfg', cfg)
  }
}

bridge.on('status', (s) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('bridge-status', s)
  }
})
bridge.on('hello', ({ user, incubators }) => {
  // keep the chosen incubator valid; default to the first one
  if (incubators.length && !incubators.some((i) => i.id === cfg.incubator)) {
    cfg = { ...cfg, incubator: incubators[0].id }
    try {
      fs.writeFileSync(cfgPath(), JSON.stringify(cfg))
    } catch {}
    broadcast()
  }
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('hello', { user, incubators })
  }
})

// --- notifications: events are pointers; the conversation is the store ---
let lastNotif = null // most recent {kind, incubator_id, conversation_id, from}

async function openThread() {
  if (!lastNotif || bridge.status !== 'on') return
  const notif = lastNotif
  try {
    const h = await bridge.history(notif.conversation_id)
    lastNotif = null
    if (notif.incubator_id && notif.incubator_id !== cfg.incubator) {
      cfg = { ...cfg, incubator: notif.incubator_id }
      try {
        fs.writeFileSync(cfgPath(), JSON.stringify(cfg))
      } catch {}
      broadcast()
    }
    toChat('chat-history', { title: h.title, messages: h.messages || [] })
    toWin('notify-clear')
  } catch (err) {
    toChat('chat-error', { text: `couldn't load the thread: ${err?.message || 'unknown'}` })
  }
}

bridge.on('notify', (n) => {
  lastNotif = n
  toWin('notify', { from: n.from || 'a bot', kind: n.kind })
  // if the user is already looking at the chat, pull the thread in live
  if (chat && !chat.isDestroyed() && chat.isVisible()) openThread()
})

ipcMain.handle('get-cfg', () => cfg)
ipcMain.handle('get-size', () => (win && !win.isDestroyed() ? win.getBounds().width : SIZE))
ipcMain.on('set-cfg', (_e, patch) => {
  // switching bots switches threads
  if (patch.incubator && patch.incubator !== cfg.incubator) bridge.resetThread()
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
ipcMain.on('move-start', () => {
  if (!win || win.isDestroyed()) return
  const p = screen.getCursorScreenPoint()
  const b = win.getBounds()
  moving = { dx: p.x - b.x, dy: p.y - b.y, w: b.width, h: b.height }
})
ipcMain.on('move-end', () => (moving = null))
ipcMain.on('toggle-settings', toggleSettings)
ipcMain.on('toggle-chat', toggleChat)
ipcMain.on('bridge-connect', () => bridge.connect(cfg.server, cfg.token))
ipcMain.on('bridge-disconnect', () => bridge.disconnect())
ipcMain.handle('get-bridge-status', () => bridge.status)
ipcMain.on('close-chat', () => {
  if (chat && !chat.isDestroyed() && chat.isVisible()) hideChat()
})
ipcMain.on('chat-size', (_e, h) => {
  const next = Math.max(60, Math.min(600, Math.round(h)))
  if (Math.abs(next - chatH) < 8) return
  chatH = next
  positionChat()
})
const toChat = (ch, p) => chat && !chat.isDestroyed() && chat.webContents.send(ch, p)
const toWin = (ch, p) => win && !win.isDestroyed() && win.webContents.send(ch, p)

ipcMain.on('chat-send', async (_e, text) => {
  const msg = String(text).slice(0, 2000)

  // no fake answers: chat only works over the bridge
  if (bridge.status !== 'on' || !cfg.incubator) {
    toChat('chat-error', {
      text:
        bridge.status === 'denied'
          ? 'key rejected — mint a new one in Tension and update it in settings'
          : 'not connected — open settings and connect to bwnd',
    })
    toWin('chat-state', { state: 'error' })
    return
  }

  toWin('chat-state', { state: 'thinking' })
  try {
    let streaming = false
    const final = await bridge.chat(cfg.incubator, msg, (ev) => {
      if (ev.type === 'delta') {
        if (!streaming) {
          streaming = true
          toWin('chat-state', { state: 'streaming' })
        }
        toChat('chat-delta', { text: ev.content })
        toWin('speak', { text: ev.content }) // the voice rides the stream
      }
      if (ev.type === 'tool') toWin('chat-state', { state: 'tool' })
    })
    if (!streaming) toWin('speak', { text: final }) // reply arrived un-streamed
    toWin('speak', { done: true }) // flush any buffered partial word
    toChat('chat-reply', { text: final }) // `response` is the source of truth
    toWin('chat-state', { state: 'reply', ...brain.inferMood(final) })
  } catch (err) {
    const why =
      err?.message === 'timeout'
        ? 'timed out waiting for a reply'
        : err?.message === 'disconnected' || err?.message === 'offline'
          ? 'connection lost mid-reply'
          : err?.message || 'something broke'
    toChat('chat-error', { text: why })
    toWin('chat-state', { state: 'error' })
  }
})
ipcMain.on('refresh-bots', () => bridge.refreshBots())
ipcMain.on('reset-thread', () => bridge.resetThread())
ipcMain.on('voice-hush', () => toWin('speak', { hush: true }))

// --- start with the system: a login item pointing electron at this folder ---
const loginItem = { path: process.execPath, args: [__dirname] }
ipcMain.handle('get-autostart', () => app.getLoginItemSettings(loginItem).openAtLogin)
ipcMain.on('set-autostart', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on, ...loginItem })
})

// --- OG link previews: fetched here, cached per session ---
const ogCache = new Map()
ipcMain.handle('og-fetch', async (_e, url) => {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return null
    if (ogCache.has(url)) return ogCache.get(url)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await require('electron').net.fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html'))
      throw new Error('not a page')
    const html = (await res.text()).slice(0, 300000)
    const meta = (name) =>
      html.match(
        new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i')
      )?.[1] ??
      html.match(
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, 'i')
      )?.[1] ??
      null
    const title = meta('og:title') || html.match(/<title[^>]*>([^<]{1,200})/i)?.[1] || null
    const out = title
      ? {
          title: title.trim(),
          description: (meta('og:description') || meta('description') || '').slice(0, 200),
          image: meta('og:image'),
          host: u.host,
        }
      : null
    ogCache.set(url, out)
    return out
  } catch {
    ogCache.set(url, null)
    return null
  }
})
ipcMain.handle('get-hello', () => ({
  status: bridge.status,
  user: bridge.user,
  incubators: bridge.incubators,
}))
ipcMain.on('quit', () => app.quit())

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) win.focus()
  })
  app.whenReady().then(() => {
    createWindow()
    if (cfg.autoConnect && cfg.server) bridge.connect(cfg.server, cfg.token)
  })
  app.on('window-all-closed', () => app.quit())
}
