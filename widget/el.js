// ElevenLabs streaming TTS: one stream-input websocket per reply. Text
// chunks go in as the bwnd deltas arrive; PCM audio chunks come back while
// the reply is still generating. The caller gets base64 PCM (24kHz mono)
// through onAudio({b64}) and a final onAudio({done: true}).

let WebSocket = null
try {
  WebSocket = require('ws')
} catch {}

const MODEL = 'eleven_flash_v2_5' // lowest latency tier
const speakable = (t) => t.replace(/[`*#_>|~]/g, '')

function elStart(key, voiceId, onAudio) {
  if (!WebSocket || !key || !voiceId) return null
  let ws
  try {
    ws = new WebSocket(
      `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input` +
        `?model_id=${MODEL}&output_format=pcm_24000`
    )
  } catch {
    return null
  }
  let open = false
  let ended = false
  let finished = false
  const queue = []
  const finish = () => {
    if (finished) return
    finished = true
    onAudio({ done: true })
  }
  const send = (o) => {
    try {
      ws.send(JSON.stringify(o))
    } catch {}
  }
  ws.on('open', () => {
    open = true
    send({
      text: ' ',
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      xi_api_key: key,
    })
    for (const t of queue) send({ text: t })
    queue.length = 0
    if (ended) send({ text: '' })
  })
  ws.on('message', (buf) => {
    try {
      const m = JSON.parse(buf.toString())
      // alignment rides along: char start times for the chunk, so the face
      // can caption words as the audio reaches them
      if (m.audio) onAudio({ b64: m.audio, align: m.normalizedAlignment || m.alignment || null })
      if (m.isFinal) finish()
    } catch {}
  })
  ws.on('error', finish)
  ws.on('close', finish)
  return {
    feed(t) {
      const clean = speakable(String(t))
      if (!clean) return
      if (open) send({ text: clean })
      else queue.push(clean)
    },
    end() {
      ended = true
      if (open) send({ text: '' })
    },
    abort() {
      try {
        ws.close()
      } catch {}
    },
  }
}

module.exports = { elStart }
