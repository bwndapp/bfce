// The outbound connection to bwnd/Tension. One socket, one device key.
//   wss://bwnd.app/api/v1/incubators/public/bbots/ws?key=<bbk_…>
// The server sends `hello` with the user's incubators; the bbot stands in for
// one of them (cfg.incubator). Chat turns stream: conversation → text_delta*
// → response (source of truth) → done. Close 1008 = key invalid/revoked:
// stop reconnecting and wait for a new key. Unknown frame types are ignored.
//
// Desktop tools ride the same socket, in reverse. After hello the widget
// announces what it can do here: `tools` {tools: [{name, description,
// input_schema}]} (MCP tool shape; an empty list withdraws them). When the
// bot's agent calls one, the server sends `tool_request` {id, name, input,
// incubator_id?, conversation_id?}; the widget runs it locally and answers
// `tool_result` {id, content: [{type:'text', text}], is_error?}. Requests
// can land mid-turn or unprompted, and several may be in flight at once.

const { EventEmitter } = require('events')
let WebSocket = null
try {
  WebSocket = require('ws')
} catch {}

const TURN_TIMEOUT = 120000 // containers can be slow to first token
const PING_EVERY = 30000

// Every group ships a Conductor that only delegates to the others. It's not
// a bot you'd want on the desktop, so it never appears in the pick lists.
const standIns = (list) => (list || []).filter((i) => i.subdomain !== 'conductor' && i.id !== 'incu-conductor')

class Bridge extends EventEmitter {
  constructor() {
    super()
    this.ws = null
    this.status = 'off' // off | connecting | on | denied
    this.url = null
    this.key = null
    this.want = false
    this.attempts = 0
    this.timer = null
    this.pinger = null
    this.user = null
    this.incubators = []
    this.tools = [] // the desktop tool manifest, announced after every hello
    this.toolsAnnouncedAt = 0 // last time the manifest went out on a live socket
    this.turn = null // the in-flight chat turn
    this.queue = []
    this.pendingHistory = [] // outstanding history requests
  }

  setStatus(s) {
    if (this.status === s) return
    this.status = s
    this.emit('status', s)
  }

  connect(url, key) {
    this.want = true
    this.url = url
    this.key = key
    this.attempts = 0
    this.open()
  }

  open() {
    if (!WebSocket || !this.url) return this.setStatus('off')
    this.teardownSocket()
    this.setStatus('connecting')
    let ws
    try {
      const u = new URL(this.url)
      if (this.key) u.searchParams.set('key', this.key)
      ws = new WebSocket(u.toString(), { handshakeTimeout: 10000 })
    } catch {
      return this.retry()
    }
    this.ws = ws
    ws.on('open', () => {
      this.attempts = 0
      this.setStatus('on')
      this.pinger = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: 'ping' }))
        } catch {}
      }, PING_EVERY)
    })
    ws.on('message', (buf) => {
      let m
      try {
        m = JSON.parse(buf.toString())
      } catch {
        return
      }
      this.handle(m)
    })
    ws.on('error', () => {}) // 'close' always follows
    ws.on('close', (code) => {
      if (this.ws !== ws) return
      this.teardownSocket()
      this.failTurn(new Error('disconnected'))
      if (code === 1008) {
        // invalid or revoked key: reconnecting is pointless
        this.want = false
        this.setStatus('denied')
      } else if (this.want) {
        this.retry()
      } else {
        this.setStatus('off')
      }
    })
  }

  handle(m) {
    switch (m.type) {
      case 'hello':
        this.user = m.user || null
        this.incubators = standIns(m.incubators)
        this.announceTools()
        this.emit('hello', { user: this.user, incubators: this.incubators })
        break
      case 'tool_request':
        if (m.id != null && m.name) this.emit('tool', m)
        break
      case 'incubators':
        this.incubators = standIns(m.incubators)
        this.emit('hello', { user: this.user, incubators: this.incubators })
        break
      case 'pong':
        break
      case 'conversation':
        if (this.turn) this.turn.convId = m.conversationId || this.turn.convId
        break
      case 'text_delta':
        this.turn?.onEvent?.({ type: 'delta', content: m.content ?? '' })
        break
      case 'reasoning':
        // the agent thinking out loud before it acts — usually right before a
        // tool call. Inside a turn it rides the turn; outside (a DM being
        // worked on) it's routed by incubator like a notification
        if (this.turn) this.turn.onEvent?.({ type: 'reasoning', content: m.content ?? '' })
        else this.emit('reasoning', { content: m.content ?? '', incubator_id: m.incubator_id })
        break
      case 'response':
        if (this.turn) this.turn.final = m.content ?? ''
        break
      case 'tool_call':
      case 'tool_result':
        this.turn?.onEvent?.({ type: 'tool', kind: m.type })
        break
      case 'event':
        // unprompted: a bot reached out. A pointer, not a payload — fetch the
        // thread via history when the user looks. Unknown kinds stay generic.
        this.emit('notify', {
          kind: m.kind || 'notification',
          incubator_id: m.incubator_id,
          conversation_id: m.conversation_id,
          from: m.from,
        })
        break
      case 'history': {
        const i = this.pendingHistory.findIndex((r) => r.cid === m.conversation_id)
        if (i !== -1) {
          const req = this.pendingHistory.splice(i, 1)[0]
          clearTimeout(req.timeout)
          req.resolve(m) // the caller owns the thread pointer
        }
        break
      }
      case 'done': {
        const t = this.turn
        this.turn = null
        if (t) {
          clearTimeout(t.timeout)
          t.resolve({ text: t.final ?? t.streamed, conversationId: t.convId ?? null })
        }
        this.pump()
        break
      }
      case 'error': {
        const err = new Error(m.error || 'server error')
        err.status = m.status
        if (this.turn) {
          this.failTurn(err)
          this.pump()
        } else if (this.pendingHistory.length) {
          const req = this.pendingHistory.shift()
          clearTimeout(req.timeout)
          req.reject(err)
        }
        break
      }
      default:
        // unknown frame types are never fatal
        this.emit('event', m)
    }
  }

  failTurn(err) {
    const t = this.turn
    this.turn = null
    if (t) {
      clearTimeout(t.timeout)
      t.reject(err)
    }
    for (const q of this.queue.splice(0)) q.reject(err)
    for (const r of this.pendingHistory.splice(0)) {
      clearTimeout(r.timeout)
      r.reject(err)
    }
  }

  // fetch a conversation's messages; resolves the server's history frame
  history(conversationId, limit = 100) {
    return new Promise((resolve, reject) => {
      if (this.status !== 'on' || !this.ws) return reject(new Error('offline'))
      const req = { cid: conversationId, resolve, reject }
      req.timeout = setTimeout(() => {
        const i = this.pendingHistory.indexOf(req)
        if (i !== -1) this.pendingHistory.splice(i, 1)
        reject(new Error('timeout'))
      }, 15000)
      this.pendingHistory.push(req)
      try {
        this.ws.send(JSON.stringify({ type: 'history', conversation_id: conversationId, limit }))
      } catch (e) {
        clearTimeout(req.timeout)
        this.pendingHistory.splice(this.pendingHistory.indexOf(req), 1)
        reject(e)
      }
    })
  }

  // one turn at a time per socket — extra sends queue behind the current one
  chat(incubatorId, text, onEvent, conversationId) {
    return new Promise((resolve, reject) => {
      const job = {
        incubatorId,
        text,
        onEvent,
        resolve,
        reject,
        final: null,
        streamed: '',
        convId: conversationId || null,
      }
      if (this.turn) this.queue.push(job)
      else this.start(job)
    })
  }

  start(job) {
    if (this.status !== 'on' || !this.ws) return job.reject(new Error('offline'))
    this.turn = job
    const inner = job.onEvent
    job.onEvent = (ev) => {
      if (ev.type === 'delta') job.streamed += ev.content
      inner?.(ev)
    }
    job.timeout = setTimeout(() => {
      if (this.turn === job) {
        this.turn = null
        job.reject(new Error('timeout'))
        this.pump()
      }
    }, TURN_TIMEOUT)
    try {
      this.ws.send(
        JSON.stringify({
          type: 'chat',
          incubator_id: job.incubatorId,
          message: job.text,
          ...(job.convId ? { conversation_id: job.convId } : {}),
        })
      )
    } catch (e) {
      clearTimeout(job.timeout)
      this.turn = null
      job.reject(e)
    }
  }

  pump() {
    const next = this.queue.shift()
    if (next) this.start(next)
  }

  // --- desktop tools ---
  setTools(list) {
    this.tools = Array.isArray(list) ? list : []
    this.announceTools()
  }
  announceTools() {
    if (this.status !== 'on' || !this.ws) return
    try {
      this.ws.send(JSON.stringify({ type: 'tools', tools: this.tools }))
      this.toolsAnnouncedAt = this.tools.length ? Date.now() : 0
      this.emit('tools-announced', this.toolsAnnouncedAt)
    } catch {}
  }
  toolResult(id, result) {
    if (this.status !== 'on' || !this.ws) return false
    try {
      this.ws.send(JSON.stringify({ type: 'tool_result', id, ...result }))
      return true
    } catch {
      return false
    }
  }

  refreshBots() {
    if (this.status === 'on' && this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: 'list' }))
      } catch {}
    }
  }

  retry() {
    this.setStatus('connecting')
    const delay = Math.min(15000, 500 * 2 ** this.attempts++)
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.want && this.open(), delay)
  }

  disconnect() {
    this.want = false
    clearTimeout(this.timer)
    this.teardownSocket()
    this.failTurn(new Error('disconnected'))
    this.setStatus('off')
  }

  teardownSocket() {
    this.toolsAnnouncedAt = 0 // a new socket has to hear the manifest again
    clearInterval(this.pinger)
    this.pinger = null
    if (this.ws) {
      const ws = this.ws
      this.ws = null
      try {
        ws.removeAllListeners('close')
        ws.close()
      } catch {}
    }
  }
}

module.exports = new Bridge()
