// Point a face at some audio and let it lip-sync.
//
//   import { createFace } from '@bwnd/bbot'
//   import { listen } from '@bwnd/bbot/talk'
//
//   const face = createFace(el, { mouth: true })
//   const stop = listen(document.querySelector('audio'), face)
//
// The face already knows how to talk — `face.talk(level)` takes a 0..1 loudness
// and turns it into an open mouth, a bob, a roll and a little squash. What it
// can't do on its own is *listen*. This is that half: a Web Audio analyser, a
// noise gate and a curve, read once a frame.
//
// Separate entry point on purpose. It's the only part of the library that
// touches Web Audio, and a face on a landing page should not pay for an
// AudioContext it will never open.

const FFT = 512

// Below this the room is quiet. Without a gate, an idle mic or the noise floor
// of a stream leaves the mouth permanently ajar.
const GATE = 0.015

// Conversation sits mid-range and only genuinely loud syllables should hit full
// open, so the curve is gentler than linear.
const GAIN = 5
const CURVE = 1.1

/** True for anything we can hand to createMediaElementSource. */
const isMedia = (x) => typeof HTMLMediaElement !== 'undefined' && x instanceof HTMLMediaElement
const isStream = (x) => typeof MediaStream !== 'undefined' && x instanceof MediaStream
const isNode = (x) => typeof AudioNode !== 'undefined' && x instanceof AudioNode

/**
 * Drive a face's mouth from audio.
 *
 * @param source  an <audio>/<video> element, a MediaStream (mic, WebRTC), or
 *                any AudioNode you've already wired up
 * @param face    what createFace returned, or anything with .talk(level)
 * @param options {
 *   audioContext  reuse your own instead of opening one
 *   output        route the audio to the speakers as well. Defaults to true for
 *                 media elements and nodes, false for a MediaStream — a live
 *                 mic sent to the speakers is a feedback loop.
 *   gate, gain, curve   shape the response
 *   onLevel(level)      called each frame with the same 0..1 the face gets
 * }
 * @returns a stop() function. Call it when the face goes away.
 */
export function listen(source, face, options = {}) {
  if (!source) throw new Error('listen() needs an audio source')
  if (!face || typeof face.talk !== 'function') {
    throw new Error('listen() needs a face — createFace(...) or anything with .talk(level)')
  }

  const {
    audioContext,
    output = !isStream(source),
    gate = GATE,
    gain = GAIN,
    curve = CURVE,
    onLevel,
  } = options

  const Ctx = typeof AudioContext !== 'undefined' ? AudioContext : globalThis.webkitAudioContext
  if (!Ctx) throw new Error('no Web Audio in this browser')

  // An AudioNode is already bound to a context, and nodes from two different
  // contexts cannot be connected — so adopt the source's rather than opening a
  // second one that could never reach it. Someone else's context is theirs to
  // close; only one we opened is ours.
  const given = audioContext || (isNode(source) ? source.context : null)
  if (audioContext && isNode(source) && source.context !== audioContext) {
    throw new Error('listen(): the source node belongs to a different AudioContext')
  }
  const ctx = given || new Ctx()
  const owned = !given

  const analyser = ctx.createAnalyser()
  analyser.fftSize = FFT
  const wave = new Uint8Array(analyser.fftSize)

  let node
  if (isMedia(source)) node = ctx.createMediaElementSource(source)
  else if (isStream(source)) node = ctx.createMediaStreamSource(source)
  else if (isNode(source)) node = source
  else throw new Error('listen(): source must be a media element, a MediaStream or an AudioNode')

  node.connect(analyser)
  // createMediaElementSource *takes over* the element's output — skip this and
  // the page goes silent while the mouth moves, which is a baffling bug to hit.
  if (output) analyser.connect(ctx.destination)

  // Browsers hand back a suspended context until a user gesture. Try anyway:
  // if this was called from a click it just works, and if it wasn't, the first
  // one the page gets will start it.
  const wake = () => ctx.resume?.().catch(() => {})
  wake()

  let running = true
  let frame = 0

  function tick() {
    if (!running) return
    frame = requestAnimationFrame(tick)

    analyser.getByteTimeDomainData(wave)
    let sum = 0
    for (let i = 0; i < wave.length; i++) {
      const d = (wave[i] - 128) / 128
      sum += d * d
    }
    const rms = Math.sqrt(sum / wave.length)
    const level = rms < gate ? 0 : Math.min(1, Math.pow(rms * gain, curve))

    // No smoothing here: the face springs `talk` internally, so damping it
    // twice reads as a delay between the sound and the mouth.
    face.talk(level)
    onLevel?.(level)
  }
  tick()

  return function stop() {
    if (!running) return
    running = false
    cancelAnimationFrame(frame)
    try {
      node.disconnect(analyser)
      analyser.disconnect()
    } catch { /* already torn down */ }
    face.talk(0)
    if (owned) ctx.close?.().catch(() => {})
  }
}


/**
 * The same level, read off decoded samples instead of a live graph.
 *
 * `listen` needs the audio to actually be playing, which is the wrong shape for
 * rendering: a recorded clip should lip-sync to the *frame's* timestamp, not to
 * whenever the sound card got round to it. Reading the buffer directly makes
 * the sync exact and frame-accurate even if the encoder stutters — and it works
 * where there is no audio device at all, which is the usual case on a server.
 *
 * @param buffer  an AudioBuffer, e.g. from ctx.decodeAudioData(mp3)
 * @param time    seconds into the buffer
 * @param options { window: seconds of audio to average, default one frame at 30fps;
 *                  gate, gain, curve — same meaning as listen() }
 * @returns the 0..1 level to hand to face.talk()
 */
export function levelAt(buffer, time, options = {}) {
  const { gate = GATE, gain = GAIN, curve = CURVE, window = 1 / 30 } = options
  if (!buffer || !(time >= 0)) return 0

  const rate = buffer.sampleRate
  const half = Math.max(1, Math.round((window * rate) / 2))
  const centre = Math.round(time * rate)
  const from = Math.max(0, centre - half)
  const to = Math.min(buffer.length, centre + half)
  if (to <= from) return 0

  let sum = 0
  let count = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = from; i < to; i++) {
      sum += data[i] * data[i]
      count++
    }
  }

  const rms = Math.sqrt(sum / count)
  return rms < gate ? 0 : Math.min(1, Math.pow(rms * gain, curve))
}

export default listen

