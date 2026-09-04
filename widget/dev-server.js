// Local emulator of the bwnd bbots socket — same frames as
// wss://bwnd.app/api/v1/incubators/public/bbots/ws, answered by the canned
// brain. Run `npm run dev-server`, connect the widget to ws://localhost:8787
// with any key. Sends hello → then per chat: conversation → text_delta* →
// response → done, streaming word by word like the real thing.
//
// Desktop tools: the widget announces `tools` after hello; a chat that starts
// with "find " (or "open ", "read ", "ls ") makes the emulator call one back
// with `tool_request` and speak the `tool_result`, the way the real agent
// would mid-turn.

const { WebSocketServer } = require('ws')
const brain = require('./brain')

const PORT = 8787
const wss = new WebSocketServer({ port: PORT })

const INCUBATORS = [
  {
    id: 'incu-local',
    name: 'BBOT.LOCAL',
    subdomain: 'local',
    description: 'dev emulator',
    avatar_seed: 'BBOT.LOCAL',
    container_running: true,
    color: null,
  },
]

wss.on('connection', (ws, req) => {
  const key = new URL(req.url, 'http://x').searchParams.get('key')
  console.log('widget connected', key ? `key=${key.slice(0, 8)}…` : '(no key)')
  const send = (o) => ws.send(JSON.stringify(o))
  let tools = [] // what this widget said it can do
  const pendingTools = new Map() // id → resolve
  let toolSeq = 0
  const callTool = (name, input) =>
    new Promise((resolve) => {
      const id = `t${++toolSeq}`
      pendingTools.set(id, resolve)
      send({ type: 'tool_request', id, name, input, incubator_id: 'incu-local' })
      setTimeout(() => {
        if (pendingTools.delete(id)) resolve({ content: [{ type: 'text', text: 'tool timed out' }], is_error: true })
      }, 30000)
    })
  const speak = async (text) => {
    // word by word like the real thing; a long tool result comes in bigger
    // bites so a file listing doesn't take a minute to land
    const words = text.split(/(?<= )/)
    const bite = Math.max(1, Math.ceil(words.length / 60))
    for (let i = 0; i < words.length; i += bite) {
      send({ type: 'text_delta', content: words.slice(i, i + bite).join('') })
      await new Promise((res) => setTimeout(res, 40 + Math.random() * 90))
    }
    send({ type: 'response', content: text })
    send({ type: 'done' })
  }

  send({
    type: 'hello',
    tension_id: 'tns_dev',
    user: { id: 'dev', email: 'dev@localhost' },
    incubators: INCUBATORS,
  })

  // exercise the notification path: an unprompted DM 20s after connect
  const demoDm = setTimeout(() => {
    send({
      type: 'event',
      kind: 'dm',
      conversation_id: 'conv-dev-dm',
      incubator_id: 'incu-local',
      from: 'BBOT.LOCAL',
    })
    console.log('sent demo dm event')
  }, 20000)
  ws.on('close', () => clearTimeout(demoDm))

  ws.on('message', async (buf) => {
    let m
    try {
      m = JSON.parse(buf.toString())
    } catch {
      return
    }
    if (m.type === 'ping') return send({ type: 'pong' })
    if (m.type === 'tools') {
      tools = m.tools || []
      console.log('widget offers tools:', tools.map((t) => t.name).join(', ') || '(none)')
      return
    }
    if (m.type === 'tool_result') {
      const r = pendingTools.get(m.id)
      if (r) {
        pendingTools.delete(m.id)
        r(m)
      }
      return
    }
    if (m.type === 'list') return send({ type: 'incubators', incubators: INCUBATORS })
    if (m.type === 'history')
      return send({
        type: 'history',
        conversation_id: m.conversation_id,
        title: 'dev thread',
        messages: [
          { role: 'assistant', content: 'psst. i sent you this while you were away', id: 'm1' },
          { role: 'assistant', content: 'reply here and it lands in the same thread', id: 'm2' },
        ],
      })
    if (m.type !== 'chat') return

    send({ type: 'conversation', conversationId: m.conversation_id || 'conv-dev-default' })
    // a stand-in for the agent deciding to use a desktop tool
    const has = (n) => tools.some((t) => t.name === n)
    const cmd = /^(find|open|read|ls)\s+(.*)$/i.exec(m.message.trim())
    if (cmd) {
      const [, verb, arg] = cmd
      const name = { find: 'search_files', open: 'open_path', read: 'read_file', ls: 'list_dir' }[verb.toLowerCase()]
      if (!has(name)) return speak(`i can't ${verb} things here — desktop tools are off in the widget`)
      const input =
        name === 'search_files'
          ? { query: arg.replace(/\s+from last week$/i, ''), modified_within_days: /last week/i.test(arg) ? 7 : undefined, limit: 5 }
          : { path: arg }
      send({ type: 'tool_call', name })
      const r = await callTool(name, input)
      send({ type: 'tool_result', name })
      const text = (r.content || []).map((c) => c.text).join('\n')
      return speak(r.is_error ? `hm, that didn't work: ${text}` : `here's what i found:\n${text}`)
    }
    const r = await brain.reply(m.message)
    await speak(r.text)
  })

  ws.on('close', () => console.log('widget disconnected'))
})

console.log(`bbot dev emulator on ws://localhost:${PORT} (any key accepted)`)
