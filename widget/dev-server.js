// Local emulator of the bwnd bbots socket — same frames as
// wss://bwnd.app/api/v1/incubators/public/bbots/ws, answered by the canned
// brain. Run `npm run dev-server`, connect the widget to ws://localhost:8787
// with any key. Sends hello → then per chat: conversation → text_delta* →
// response → done, streaming word by word like the real thing.

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
    const r = await brain.reply(m.message)
    for (const word of r.text.split(/(?<= )/)) {
      send({ type: 'text_delta', content: word })
      await new Promise((res) => setTimeout(res, 40 + Math.random() * 90))
    }
    send({ type: 'response', content: r.text })
    send({ type: 'done' })
  })

  ws.on('close', () => console.log('widget disconnected'))
})

console.log(`bbot dev emulator on ws://localhost:${PORT} (any key accepted)`)
