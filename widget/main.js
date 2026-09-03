const { app, BrowserWindow, Menu, screen, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const brain = require('./brain')
const bridge = require('./bridge')
const { elStart } = require('./el')

const SIZE = 180
const CHAT_W = 320
// widget/icon.png: the mark on a transparent background — docs/logo.png is
// flattened RGB and shows as a hard square in the taskbar
const ICON = path.join(__dirname, 'icon.png')

// styling belongs to the incubator, so a cloned bot keeps its outfit
const STYLE_KEYS = [
  'skin', 'ink', 'pupils', 'mood', 'voice', 'voicePitch', 'aura',
  'voiceMode', 'elVoice', 'fxBloom', 'fxHalation', 'fxScan',
  'fxChrome', 'fxHolo', 'fxHue', 'fxRim', 'fxGlass', 'fxGloss', 'fxScratch',
]
const STYLE_DEFAULTS = {
  skin: '#16181a',
  ink: '#e9ebec',
  pupils: false,
  mood: 'auto',
  voice: true,
  voicePitch: 1,
  aura: 'none',
  voiceMode: 'babble', // 'babble' | 'el'
  elVoice: '', // ElevenLabs voice id, per incubator
  fxBloom: 0, // post-processing intensities, 0..1
  fxHalation: 0,
  fxScan: 0,
  fxChrome: 0,
  fxHolo: 0,
  fxHue: 0,
  fxRim: 0,
  fxGlass: 0,
  fxGloss: 0,
  fxScratch: 0,
}
const GLOBAL_DEFAULTS = {
  server: 'wss://bwnd.app/api/v1/incubators/public/bbots/ws',
  token: '', // the bbk_… device key
  incubator: '', // the primary bbot's incubator
  autoConnect: false,
  clones: [], // incubator ids of extra bbots to respawn at launch
  bots: {}, // per-incubator style overrides
  presets: [], // user-saved looks, shared by every bbot
  elKey: '', // ElevenLabs API key (global)
  showFeed: true, // chat shows the conversation, or just the entry box
}

const cfgPath = () => path.join(app.getPath('userData'), 'widget-config.json')
let cfg = { ...GLOBAL_DEFAULTS }
try {
  cfg = { ...GLOBAL_DEFAULTS, ...JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) }
} catch {}
// migrate a pre-clone config: top-level style keys move into bots._default
{
  const legacy = {}
  for (const k of STYLE_KEYS) {
    if (k in cfg) {
      legacy[k] = cfg[k]
      delete cfg[k]
    }
  }
  if (Object.keys(legacy).length) {
    cfg.bots = { ...cfg.bots, _default: { ...legacy, ...(cfg.bots?._default || {}) } }
  }
}
const save = () => {
  try {
    fs.writeFileSync(cfgPath(), JSON.stringify(cfg))
  } catch {}
}

// a first-time clone rolls its own identity: fresh fit, fresh voice
const RANDOM_FITS = [
  { skin: '#16181a', ink: '#e9ebec' }, // midnight
  { skin: '#f4f5f6', ink: '#101214' }, // ghost
  { skin: '#0a0f0b', ink: '#b6ff3d' }, // terminal
  { skin: '#ff9ecb', ink: '#5f1d3a' }, // bubblegum
  { skin: '#4ecdc4', ink: '#0b3437' }, // ocean
  { skin: '#ffd166', ink: '#4a3405' }, // honey
  { skin: '#a78bfa', ink: '#241a4d' }, // grape
  { skin: '#ff6b6b', ink: '#4d0f0f' }, // cherry
  { skin: '#1f6feb', ink: '#dbe9ff' }, // cobalt
  { skin: '#2d3436', ink: '#ffb8b8' }, // charcoal rose
]
function randomStyle() {
  const worn = new Set(Object.values(cfg.bots).map((b) => b.skin))
  const pool = RANDOM_FITS.filter((f) => !worn.has(f.skin))
  const fits = pool.length ? pool : RANDOM_FITS
  const fit = fits[Math.floor(Math.random() * fits.length)]
  const auras = ['glow', 'ring', 'particles']
  return {
    ...fit,
    pupils: Math.random() < 0.35,
    mood: 'auto',
    voice: true,
    voicePitch: Math.round((0.7 + Math.random() * 0.9) * 20) / 20,
    aura: Math.random() < 0.35 ? auras[Math.floor(Math.random() * auras.length)] : 'none',
  }
}

const styleFor = (incubator) => ({
  ...STYLE_DEFAULTS,
  ...(cfg.bots._default || {}),
  ...(incubator ? cfg.bots[incubator] || {} : {}),
})

// --- instances: the primary bbot plus any clones ---
const instances = new Map()
let seq = 0
const primary = () => [...instances.values()].find((i) => i.primary)
const persistClones = () => {
  cfg.clones = [...instances.values()].filter((i) => !i.primary).map((i) => i.incubator)
  save()
}
const mergedCfg = (inst) => ({
  ...styleFor(inst.incubator),
  server: cfg.server,
  token: cfg.token,
  autoConnect: cfg.autoConnect,
  incubator: inst.incubator,
  presets: cfg.presets,
  styleKeys: STYLE_KEYS, // so a saved look captures every style key, always
  styleDefaults: STYLE_DEFAULTS,
  elKey: cfg.elKey,
  showFeed: cfg.showFeed,
})

function botOf(e) {
  for (const inst of instances.values()) {
    for (const w of [inst.win, inst.chat, inst.settings]) {
      if (w && !w.isDestroyed() && w.webContents === e.sender) return inst
    }
  }
  return primary()
}

const toWin = (inst, ch, p) =>
  inst?.win && !inst.win.isDestroyed() && inst.win.webContents.send(ch, p)
const toChat = (inst, ch, p) =>
  inst?.chat && !inst.chat.isDestroyed() && inst.chat.webContents.send(ch, p)

function broadcastCfg() {
  for (const inst of instances.values()) {
    const c = mergedCfg(inst)
    for (const w of [inst.win, inst.chat, inst.settings]) {
      if (w && !w.isDestroyed()) w.webContents.send('cfg', c)
    }
  }
}

function spawnBot(incubator, { primary: isPrimary = false, x, y } = {}) {
  const inst = {
    key: isPrimary ? 'main' : `c${++seq}`,
    primary: isPrimary,
    incubator: incubator || '',
    win: null,
    chat: null,
    settings: null,
    chatH: 60,
    resizing: false,
    moving: null,
    adjusting: false,
    adjustTimer: null,
    lastNotif: null,
    conversationId: null,
  }
  inst.win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    ...(x != null ? { x: Math.round(x), y: Math.round(y) } : {}),
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
  inst.win.setAlwaysOnTop(true, 'screen-saver')
  inst.win.setAspectRatio(1)
  inst.win.loadFile('index.html')
  inst.win.on('move', () => {
    if (!inst.win.isDestroyed() && !inst.resizing && !inst.adjusting)
      inst.win.webContents.send('dragging', screenPos(inst.win))
    positionChat(inst)
  })
  // the chrome reflection is anchored to the screen, so it needs to know
  // where the window starts out
  inst.win.webContents.on('did-finish-load', () => {
    if (!inst.win.isDestroyed()) inst.win.webContents.send('dragging', { ...screenPos(inst.win), settle: true })
  })
  inst.win.on('closed', () => closeBot(inst))
  instances.set(inst.key, inst)
  return inst
}

// window centre as a fraction of its display's work area, -0.5..0.5
function screenPos(w) {
  const b = w.getBounds()
  const a = screen.getDisplayMatching(b).workArea
  return {
    nx: (b.x + b.width / 2 - a.x) / a.width - 0.5,
    ny: (b.y + b.height / 2 - a.y) / a.height - 0.5,
  }
}

function closeBot(inst) {
  if (!instances.has(inst.key)) return
  instances.delete(inst.key)
  for (const w of [inst.chat, inst.settings]) {
    if (w && !w.isDestroyed()) w.destroy()
  }
  if (inst.win && !inst.win.isDestroyed()) inst.win.destroy()
  if (!inst.primary) persistClones()
}

// Manual drag and resize run on their own fast loop, and the size eases
// toward the cursor instead of snapping to it — the corner still tracks the
// pointer, but through a short spring, so it glides rather than stutters.
// The loop only runs while something is in motion or still settling.
let motionTimer = null
function motionTick() {
  const p = screen.getCursorScreenPoint()
  let busy = false
  for (const inst of instances.values()) {
    const w = inst.win
    if (!w || w.isDestroyed()) continue
    if (inst.resizing || inst.sizeCur != null) {
      const b = w.getBounds()
      // the centre is pinned for the whole gesture, so DPI rounding of the
      // bounds can't walk it around
      if (!inst.pin) inst.pin = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      const { x: cx, y: cy } = inst.pin
      if (inst.resizing)
        inst.sizeTarget = Math.max(80, Math.min(800, 2 * Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy))))
      if (inst.sizeCur == null) inst.sizeCur = b.width
      const t = inst.sizeTarget ?? inst.sizeCur
      // ease: a third of the way each tick, snapping when close
      inst.sizeCur += (t - inst.sizeCur) * (inst.resizing ? 0.32 : 0.28)
      if (Math.abs(t - inst.sizeCur) < 0.4) inst.sizeCur = t
      const size = Math.round(inst.sizeCur)
      if (size !== b.width || size !== b.height) {
        inst.adjusting = true // the 'move' events this fires aren't a drag
        w.setBounds({ x: Math.round(cx - size / 2), y: Math.round(cy - size / 2), width: size, height: size })
      }
      if (!inst.resizing && inst.sizeCur === t) {
        // settled: release the gesture state
        inst.sizeCur = null
        inst.sizeTarget = null
        inst.pin = null
        inst.adjusting = false
        positionChat(inst)
      } else busy = true
    } else if (inst.moving) {
      // full bounds with the size captured at drag start — setPosition alone
      // lets DPI rounding drift the size a pixel per tick
      const nx = Math.round(p.x - inst.moving.dx)
      const ny = Math.round(p.y - inst.moving.dy)
      const b = w.getBounds()
      if (nx !== b.x || ny !== b.y)
        w.setBounds({ x: nx, y: ny, width: inst.moving.w, height: inst.moving.h })
      busy = true
    }
  }
  if (!busy) {
    clearInterval(motionTimer)
    motionTimer = null
  }
}
function wakeMotion() {
  if (!motionTimer) motionTimer = setInterval(motionTick, 8)
}

// The renderers can't see the pointer once it leaves their windows, so global
// gaze is driven from one shared poll.
setInterval(() => {
  const p = screen.getCursorScreenPoint()
  for (const inst of instances.values()) {
    const w = inst.win
    if (!w || w.isDestroyed()) continue
    const b = w.getBounds()
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    const kx = p.x - cx
    const ky = p.y - cy
    inst.curTick = (inst.curTick || 0) + 1
    const moved =
      !inst.lastCur || Math.abs(kx - inst.lastCur.x) >= 1 || Math.abs(ky - inst.lastCur.y) >= 1
    if (moved || inst.curTick % 15 === 0) {
      inst.lastCur = { x: kx, y: ky }
      w.webContents.send('cursor', { x: kx, y: ky })
    }
  }
}, 33)

// --- chat: a transparent bubble window anchored above each face ---
function chatBounds(inst) {
  const b = inst.win.getBounds()
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
  let sitsBelow = false
  if (above >= 160 || above >= below) {
    h = Math.max(60, Math.min(inst.chatH, above))
    y = b.y - h - gap
  } else {
    sitsBelow = true
    h = Math.max(60, Math.min(inst.chatH, below))
    y = b.y + b.height + gap
  }
  return { x, y: Math.round(y), width: CHAT_W, height: Math.round(h), below: sitsBelow }
}

function positionChat(inst) {
  if (!inst.chat || inst.chat.isDestroyed() || !inst.win || inst.win.isDestroyed()) return
  const { below, ...bounds } = chatBounds(inst)
  inst.chat.setBounds(bounds)
  if (inst.chatBelow !== below) {
    // flipped anchor flips the page layout: input stays beside the bot
    inst.chatBelow = below
    toChat(inst, 'chat-orient', { below })
  }
}

function hideChat(inst) {
  inst.chat.hide()
  toWin(inst, 'chat-state', { state: 'end' })
}

function showChat(inst) {
  positionChat(inst)
  inst.chat.show()
  inst.chat.webContents.send('chat-focus')
  toWin(inst, 'chat-state', { state: 'open' })
  openThread(inst) // a pending notification opens straight into its thread
}

function toggleChat(inst) {
  // hide/show, never destroy — the transcript lives in the window and only
  // the clear button empties it
  if (inst.chat && !inst.chat.isDestroyed()) {
    if (inst.chat.isVisible()) hideChat(inst)
    else showChat(inst)
    return
  }
  inst.chatH = 60 // a fresh chat starts compact; the page reports real size
  const at = chatBounds(inst) // born in place — no centered flash, no jump
  inst.chat = new BrowserWindow({
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
  inst.chat.setAlwaysOnTop(true, 'screen-saver')
  inst.chat.loadFile('chat.html')
  // links in replies open in the real browser, never in-widget
  inst.chat.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) require('electron').shell.openExternal(url)
    return { action: 'deny' }
  })
  inst.chat.webContents.on('will-navigate', (e) => e.preventDefault())
  inst.chat.once('ready-to-show', () => {
    positionChat(inst)
    inst.chat.show()
    inst.chat.webContents.send('chat-focus')
    openThread(inst)
  })
  inst.chat.on('closed', () => {
    inst.chat = null
    toWin(inst, 'chat-state', { state: 'end' })
  })
  toWin(inst, 'chat-state', { state: 'open' })
}

function toggleSettings(inst) {
  if (inst.settings && !inst.settings.isDestroyed()) {
    inst.settings.close()
    return
  }
  const W = 430
  const H = 620
  const b = inst.win.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  let x = b.x + b.width + 14
  if (x + W > area.x + area.width) x = b.x - W - 14
  x = Math.max(area.x, Math.min(x, area.x + area.width - W))
  const y = Math.max(area.y, Math.min(b.y, area.y + area.height - H))

  inst.settings = new BrowserWindow({
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
  inst.settings.loadFile('settings.html')
  inst.settings.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) require('electron').shell.openExternal(url)
    return { action: 'deny' }
  })
  inst.settings.webContents.on('will-navigate', (e) => e.preventDefault())
  inst.settings.on('closed', () => (inst.settings = null))
}

// --- the right-click menu: clone a bbot per incubator, dismiss clones ---
function faceMenu(inst) {
  const nameOf = (id) => bridge.incubators.find((i) => i.id === id)?.name || id || 'unbound'
  const cloneItems = bridge.incubators.length
    ? bridge.incubators.map((i) => ({
        label: i.name + (i.container_running ? '' : ' (asleep)'),
        click: () => {
          // an incubator with no saved style rolls a random identity once
          if (!cfg.bots[i.id]) {
            cfg.bots[i.id] = randomStyle()
            save()
          }
          const b = inst.win.getBounds()
          spawnBot(i.id, { x: b.x + b.width + 16, y: b.y })
          persistClones()
        },
      }))
    : [{ label: 'connect to bwnd first', enabled: false }]
  const template = [
    { label: nameOf(inst.incubator), enabled: false },
    { type: 'separator' },
    { label: 'Chat', click: () => toggleChat(inst) },
    { label: 'Customize', click: () => toggleSettings(inst) },
    { label: 'Clone as', submenu: cloneItems },
  ]
  if (!inst.primary) {
    template.push({ type: 'separator' })
    template.push({ label: 'Dismiss this bbot', click: () => closeBot(inst) })
  }
  Menu.buildFromTemplate(template).popup({ window: inst.win })
}

// --- bridge plumbing ---
bridge.on('status', (s) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('bridge-status', s)
  }
})

bridge.on('hello', ({ user, incubators }) => {
  // keep the primary's incubator valid; default to the first one
  const main = primary()
  if (incubators.length && main && !incubators.some((i) => i.id === main.incubator)) {
    main.incubator = incubators[0].id
    cfg.incubator = main.incubator
    save()
    broadcastCfg()
  }
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('hello', { user, incubators })
  }
})

// --- notifications: routed to the bbot bound to that incubator ---
async function openThread(inst) {
  if (!inst.lastNotif || bridge.status !== 'on') return
  const notif = inst.lastNotif
  try {
    const h = await bridge.history(notif.conversation_id)
    inst.lastNotif = null
    if (notif.incubator_id && notif.incubator_id !== inst.incubator) {
      inst.incubator = notif.incubator_id
      if (inst.primary) cfg.incubator = inst.incubator
      persistClones()
      broadcastCfg()
    }
    inst.conversationId = h.conversation_id
    toChat(inst, 'chat-history', { title: h.title, messages: h.messages || [] })
    toWin(inst, 'notify-clear')
  } catch (err) {
    toChat(inst, 'chat-error', { text: `couldn't load the thread: ${err?.message || 'unknown'}` })
  }
}

bridge.on('notify', async (n) => {
  const inst =
    [...instances.values()].find((i) => i.incubator === n.incubator_id) || primary()
  if (!inst) return
  inst.lastNotif = n
  toWin(inst, 'notify', { from: n.from || 'a bot', kind: n.kind })
  if (inst.chat && !inst.chat.isDestroyed() && inst.chat.isVisible()) openThread(inst)
  // yapping: a bot with a real voice speaks its DM out loud, unprompted
  const style = styleFor(inst.incubator)
  if (
    style.voiceMode === 'el' &&
    style.voice !== false &&
    cfg.elKey &&
    style.elVoice &&
    !inst.el // never talk over an in-flight reply
  ) {
    try {
      const h = await bridge.history(n.conversation_id)
      const lastMsg = [...(h.messages || [])].reverse().find((m) => m.role === 'assistant')
      const text = (lastMsg?.content || '').slice(0, 800)
      if (!text) return
      inst.conversationId = h.conversation_id // replies continue this thread
      const el = elStart(cfg.elKey, style.elVoice, (a) => {
        toWin(inst, 'el-audio', a)
        if (a.done && inst.el === el) inst.el = null
      })
      if (el) {
        inst.el = el
        el.feed(text)
        el.end()
      }
    } catch {}
  }
})

// --- IPC (everything resolves the calling window's bbot) ---
ipcMain.handle('get-cfg', (e) => mergedCfg(botOf(e)))
ipcMain.handle('get-size', (e) => {
  const inst = botOf(e)
  return inst?.win && !inst.win.isDestroyed() ? inst.win.getBounds().width : SIZE
})
ipcMain.on('set-cfg', (e, patch) => {
  const inst = botOf(e)
  if (!inst) return
  if ('incubator' in patch && patch.incubator !== inst.incubator) {
    inst.incubator = patch.incubator // rebinding switches threads
    inst.conversationId = null
    if (inst.primary) cfg.incubator = inst.incubator
    persistClones()
  }
  const styleTarget = inst.incubator || '_default'
  for (const k of STYLE_KEYS) {
    if (k in patch) cfg.bots[styleTarget] = { ...cfg.bots[styleTarget], [k]: patch[k] }
  }
  for (const k of ['server', 'token', 'autoConnect', 'presets', 'elKey', 'showFeed']) {
    if (k in patch) cfg[k] = patch[k]
  }
  save()
  broadcastCfg()
})
ipcMain.on('react', (e, name) => toWin(botOf(e), 'react', name))
ipcMain.on('set-size', (e, size) => {
  const inst = botOf(e)
  if (!inst?.win || inst.win.isDestroyed()) return
  const s = Math.max(80, Math.min(800, Math.round(size)))
  const b = inst.win.getBounds()
  inst.adjusting = true
  clearTimeout(inst.adjustTimer)
  inst.adjustTimer = setTimeout(() => (inst.adjusting = false), 300)
  inst.win.setBounds({
    x: Math.round(b.x + b.width / 2 - s / 2),
    y: Math.round(b.y + b.height / 2 - s / 2),
    width: s,
    height: s,
  })
})
ipcMain.on('resize-start', (e) => {
  const inst = botOf(e)
  if (!inst) return
  inst.resizing = true
  wakeMotion()
})
ipcMain.on('resize-end', (e) => {
  const inst = botOf(e)
  if (inst) inst.resizing = false // the loop keeps running until the size settles
})
ipcMain.on('move-start', (e) => {
  const inst = botOf(e)
  if (!inst?.win || inst.win.isDestroyed()) return
  const p = screen.getCursorScreenPoint()
  const b = inst.win.getBounds()
  inst.moving = { dx: p.x - b.x, dy: p.y - b.y, w: b.width, h: b.height }
  wakeMotion()
})
ipcMain.on('move-end', (e) => (botOf(e).moving = null))
ipcMain.on('toggle-settings', (e) => toggleSettings(botOf(e)))
ipcMain.on('toggle-chat', (e) => toggleChat(botOf(e)))
ipcMain.on('face-menu', (e) => faceMenu(botOf(e)))
ipcMain.on('bridge-connect', () => bridge.connect(cfg.server, cfg.token))
ipcMain.on('bridge-disconnect', () => bridge.disconnect())
ipcMain.handle('get-bridge-status', () => bridge.status)
ipcMain.on('close-chat', (e) => {
  const inst = botOf(e)
  if (inst?.chat && !inst.chat.isDestroyed() && inst.chat.isVisible()) hideChat(inst)
})
ipcMain.on('chat-size', (e, h) => {
  const inst = botOf(e)
  if (!inst) return
  const next = Math.max(60, Math.min(600, Math.round(h)))
  if (Math.abs(next - inst.chatH) < 8) return
  inst.chatH = next
  positionChat(inst)
})

ipcMain.on('chat-send', async (e, text) => {
  const inst = botOf(e)
  if (!inst) return
  const msg = String(text).slice(0, 2000)

  // no fake answers: chat only works over the bridge
  if (bridge.status !== 'on' || !inst.incubator) {
    toChat(inst, 'chat-error', {
      text:
        bridge.status === 'denied'
          ? 'key rejected — mint a new one in Tension and update it in settings'
          : 'not connected — open settings and connect to bwnd',
    })
    toWin(inst, 'chat-state', { state: 'error' })
    return
  }

  toWin(inst, 'chat-state', { state: 'thinking' })
  // barge-in: a new message interrupts whatever he's still saying
  if (inst.el) {
    inst.el.abort()
    inst.el = null
  }
  toWin(inst, 'el-audio', { stop: true })
  // voice routing: an ElevenLabs session for this turn, or the babble path
  const style = styleFor(inst.incubator)
  const el =
    style.voiceMode === 'el' && style.voice !== false && cfg.elKey && style.elVoice
      ? elStart(cfg.elKey, style.elVoice, (a) => toWin(inst, 'el-audio', a))
      : null
  inst.el = el
  toChat(inst, 'chat-pace', { mode: el ? 'voice' : 'text' }) // reveal follows the voice
  try {
    let streaming = false
    const r = await bridge.chat(
      inst.incubator,
      msg,
      (ev) => {
        if (ev.type === 'delta') {
          if (!streaming) {
            streaming = true
            toWin(inst, 'chat-state', { state: 'streaming' })
          }
          toChat(inst, 'chat-delta', { text: ev.content })
          if (el) el.feed(ev.content) // the voice rides the stream
          else toWin(inst, 'speak', { text: ev.content })
        }
        if (ev.type === 'tool') toWin(inst, 'chat-state', { state: 'tool' })
      },
      inst.conversationId
    )
    inst.conversationId = r.conversationId || inst.conversationId
    if (el) {
      if (!streaming) el.feed(r.text) // arrived un-streamed
      el.end()
      if (inst.el === el) inst.el = null
    } else {
      if (!streaming) toWin(inst, 'speak', { text: r.text })
      toWin(inst, 'speak', { done: true }) // flush any buffered partial word
    }
    toChat(inst, 'chat-reply', { text: r.text }) // `response` is the source of truth
    toWin(inst, 'chat-state', { state: 'reply', ...brain.inferMood(r.text) })
  } catch (err) {
    el?.abort()
    if (inst.el === el) inst.el = null
    const why =
      err?.message === 'timeout'
        ? 'timed out waiting for a reply'
        : err?.message === 'disconnected' || err?.message === 'offline'
          ? 'connection lost mid-reply'
          : err?.message || 'something broke'
    toChat(inst, 'chat-error', { text: why })
    toWin(inst, 'chat-state', { state: 'error' })
  }
})
ipcMain.on('refresh-bots', () => bridge.refreshBots())
ipcMain.on('reset-thread', (e) => {
  const inst = botOf(e)
  if (inst) inst.conversationId = null
})
ipcMain.on('voice-hush', (e) => toWin(botOf(e), 'speak', { hush: true }))
ipcMain.on('voice-stop', (e) => {
  // the user wants quiet NOW: kill the EL stream and all queued audio
  const inst = botOf(e)
  if (!inst) return
  inst.el?.abort()
  inst.el = null
  toWin(inst, 'el-audio', { stop: true })
  toWin(inst, 'speak', { hush: true })
  toChat(inst, 'voice-mark', { ended: true }) // free the text to finish
})
// the face window owns the audio clock; it reports when speech starts/ends
ipcMain.on('el-mark', (e, m) => toChat(botOf(e), 'voice-mark', m))

// --- ElevenLabs: list the account's voices for the picker ---
ipcMain.handle('el-voices', async () => {
  if (!cfg.elKey) return { error: 'no key' }
  try {
    const res = await require('electron').net.fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': cfg.elKey },
    })
    if (!res.ok) return { error: res.status === 401 ? 'key rejected' : `error ${res.status}` }
    const j = await res.json()
    return { voices: (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name })) }
  } catch (e) {
    return { error: e?.message || 'fetch failed' }
  }
})

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
// renderer crash reporter: uncaught errors land in userData/renderer-errors.log
ipcMain.on('rlog', (_e, msg) => {
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'renderer-errors.log'),
      `${new Date().toISOString()} ${msg}\n`
    )
  } catch {}
})
ipcMain.on('quit', (e) => {
  const inst = botOf(e)
  if (!inst || inst.primary) app.quit()
  else closeBot(inst) // a clone's close only dismisses that clone
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const main = primary()
    if (main?.win && !main.win.isDestroyed()) main.win.focus()
  })
  app.whenReady().then(() => {
    const main = spawnBot(cfg.incubator, { primary: true })
    // respawn saved clones fanned out beside the primary
    let offset = 0
    for (const id of cfg.clones || []) {
      const b = main.win.getBounds()
      offset += SIZE + 16
      spawnBot(id, { x: b.x + offset, y: b.y })
    }
    if (cfg.autoConnect && cfg.server) bridge.connect(cfg.server, cfg.token)
  })
  app.on('window-all-closed', () => app.quit())
}
