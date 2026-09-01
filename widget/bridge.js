// The outbound connection to bwnd/Tension. One socket, one device key.
//   wss://bwnd.app/api/v1/incubators/public/bbots/ws?key=<bbk_…>
// The server sends `hello` with the user's incubators; the bbot stands in for
// one of them (cfg.incubator). Chat turns stream: conversation → text_delta*
// → response (source of truth) → done. Close 1008 = key invalid/revoked:
// stop reconnecting and wait for a new key. Unknown frame types are ignored.

const { EventEmitter } = require('events')
let WebSocket = null
try {
  WebSocket = require('ws')
} catch {}

const TURN_TIMEOUT = 120000 // containers can be slow to first token
const PING_EVERY = 30000

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
    this.conversationId = null
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
        this.incubators = m.incubators || []
        this.emit('hello', { user: this.user, incubators: this.incubators })
        break
      case 'incubators':
        this.incubators = m.incubators || []
        this.emit('hello', { user: this.user, incubators: this.incubators })
        break
      case 'pong':
        break
      case 'conversation':
        this.conversationId = m.conversationId || this.conversationId
        break
      case 'text_delta':
        this.turn?.onEvent?.({ type: 'delta', content: m.content ?? '' })
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
          this.conversationId = m.conversation_id // replies continue this thread
          req.resolve(m)
        }
        break
      }
      case 'done': {
        const t = this.turn
        this.turn = null
        if (t) {
          clearTimeout(t.timeout)
          t.resolve(t.final ?? t.streamed)
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
  chat(incubatorId, text, onEvent) {
    return new Promise((resolve, reject) => {
      const job = { incubatorId, text, onEvent, resolve, reject, final: null, streamed: '' }
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
          ...(this.conversationId ? { conversation_id: this.conversationId } : {}),
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

  refreshBots() {
    if (this.status === 'on' && this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: 'list' }))
      } catch {}
    }
  }

  resetThread() {
    this.conversationId = null
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
