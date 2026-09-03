// A very small animated face. One circle, two circles inside it that follow
// your pointer. No dependencies, no framework — just SVG and a spring.
//
//   import { createFace } from './face/core'
//   const face = createFace(el, { expression: 'happy' })
//   face.react('bounce')
//   face.destroy()

import { EXPRESSIONS, REACTIONS } from './expressions.js'

const NS = 'http://www.w3.org/2000/svg'
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const rand = (a, b) => a + Math.random() * (b - a)

// Geometry lives in a 100×100 viewBox centred on (0, 0), so every transform is
// just a translate/rotate/scale about the middle of the face.
const G = {
  headR: 46,
  eyeX: 19,
  eyeY: -3,
  eyeR: 12,
  // The eyes don't slide across a disc — they sit on the surface of a sphere of
  // radius `headR` that yaws and pitches to look at you, and get projected flat.
  // `turn` is the furthest it rotates, in radians.
  turn: 0.36,
  lean: 1.8, // units the head itself drifts, on top of the rotation
  // Lids are clipped a hair wider than the eye and travel a hair further than
  // its diameter. Both are anti-aliasing slack: clip flush to the eye and its
  // soft edge bleeds a pale ring through the lid, and two lids meeting exactly
  // at the centre leave a bright seam instead of a shut eye.
  clipPad: 0.6,
  lidSlack: 1,
  pupilR: 4.6,
  pupilTravel: 4.2,
  mouthY: 20,
  mouthW: 14,
}

/* ------------------------------------------------------------------ pointer */
// One listener for the whole page, whatever the number of faces.
const pointer = { x: 0, y: 0, has: false, t: 0 }
let listening = false

function startListening() {
  if (listening || typeof window === 'undefined') return
  listening = true
  const set = (e) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    pointer.has = true
    pointer.t = performance.now()
  }
  window.addEventListener('pointermove', set, { passive: true })
  window.addEventListener('pointerdown', set, { passive: true })
  window.addEventListener('blur', () => { pointer.has = false })
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ------------------------------------------------------------- shared clock */
const living = new Set()
let raf = null
let lastTick = 0

function tick(now) {
  const dt = lastTick ? clamp((now - lastTick) / 1000, 0.001, 1 / 30) : 1 / 60
  lastTick = now
  for (const face of living) face._frame(dt, now)
  raf = living.size ? requestAnimationFrame(tick) : null
}

function join(face) {
  living.add(face)
  if (raf === null) {
    lastTick = 0
    raf = requestAnimationFrame(tick)
  }
}

function leave(face) {
  living.delete(face)
  if (!living.size && raf !== null) {
    cancelAnimationFrame(raf)
    raf = null
  }
}

/* ------------------------------------------------------------------ springs */
function spring(value, k, d) {
  return { x: value, v: 0, to: value, k, d }
}

function advance(s, dt) {
  s.v += ((s.to - s.x) * s.k - s.v * s.d) * dt
  s.x += s.v * dt
  return s.x
}

function settle(s) {
  s.x = s.to
  s.v = 0
}

/* ------------------------------------------------------------------- sphere */
// Lift a point from the flat face onto the front of the sphere, yaw/pitch it,
// and drop it back onto the screen. `squash`/`phi` describe how a circle drawn
// there foreshortens: full width across the radius, squashed along it. Measured
// against the point's own resting depth, so features stay undistorted at rest —
// true foreshortening there just reads as a wall eye.
//
// Writes into a shared scratch object; consume it before the next call.
const hit = { x: 0, y: 0, squash: 1, phi: 0 }

function project(px, py, cosYaw, sinYaw, cosPitch, sinPitch) {
  const pz = Math.sqrt(Math.max(G.headR * G.headR - px * px - py * py, 1))
  const x1 = px * cosYaw + pz * sinYaw
  const z1 = pz * cosYaw - px * sinYaw
  hit.x = x1
  hit.y = py * cosPitch - z1 * sinPitch
  const z2 = py * sinPitch + z1 * cosPitch
  hit.squash = clamp(z2 / pz, 0.25, 1)
  hit.phi = (Math.atan2(hit.y, x1) * 180) / Math.PI
  return hit
}

/* -------------------------------------------------------------------- build */
let seq = 0

function svg(name, attrs) {
  const node = document.createElementNS(NS, name)
  for (const key in attrs) node.setAttribute(key, attrs[key])
  return node
}

export function createFace(host, options = {}) {
  const opt = {
    expression: 'idle',
    mouth: false,
    pupils: false,
    track: true,
    blink: true,
    idle: true,
    ...options,
  }

  const reduced = prefersReducedMotion()
  const clipId = `bwf-eye-${++seq}`

  const root = svg('svg', {
    class: 'bwface',
    viewBox: '-50 -50 100 100',
    xmlns: NS,
    'aria-hidden': 'true',
  })

  const defs = svg('defs', {})
  const clip = svg('clipPath', { id: clipId })
  clip.appendChild(svg('circle', { r: G.eyeR + G.clipPad, cx: 0, cy: 0 }))
  defs.appendChild(clip)

  const headClip = svg('clipPath', { id: `${clipId}-head` })
  headClip.appendChild(svg('circle', { r: G.headR, cx: 0, cy: 0 }))
  defs.appendChild(headClip)
  root.appendChild(defs)

  const headGroup = svg('g', {})
  headGroup.appendChild(svg('circle', { class: 'bwf-head', r: G.headR }))
  headGroup.appendChild(svg('circle', { class: 'bwf-ring', r: G.headR }))

  // Features live inside the silhouette. At full gaze a `surprised` eye lands
  // within a unit of the rim, so without this the geometry only stays inside by
  // luck — and anything that widens the eyes or the turn would break it.
  const skin = svg('g', { 'clip-path': `url(#${clipId}-head)` })
  headGroup.appendChild(skin)

  const eyesGroup = svg('g', {})
  const eyes = [-1, 1].map((side) => {
    const group = svg('g', { class: 'bwf-eye-group' })
    const clipped = svg('g', { 'clip-path': `url(#${clipId})` })
    const ball = svg('circle', { class: 'bwf-eye', r: G.eyeR })
    clipped.appendChild(ball)

    let pupil = null
    if (opt.pupils) {
      pupil = svg('circle', { class: 'bwf-pupil', r: G.pupilR })
      clipped.appendChild(pupil)
    }

    // Lids are head-coloured rectangles sliding over the eye, clipped to it.
    // Rotating them is what turns a circle into an angry or a sad eye.
    const lidTop = svg('rect', { class: 'bwf-lid', x: -22, y: -44, width: 44, height: 44 })
    const lidBottom = svg('rect', { class: 'bwf-lid', x: -22, y: 0, width: 44, height: 44 })
    clipped.appendChild(lidTop)
    clipped.appendChild(lidBottom)

    group.appendChild(clipped)
    eyesGroup.appendChild(group)
    return { side, group, pupil, lidTop, lidBottom }
  })
  skin.appendChild(eyesGroup)

  // Drawn around its own origin, not at G.mouthY — the group carries it there,
  // so the mouth can ride the sphere the same way the eyes do.
  let mouth = null
  let mouthOpen = null
  let mouthGroup = null
  if (opt.mouth) {
    mouthGroup = svg('g', {})
    mouth = svg('path', { class: 'bwf-mouth' })
    mouthOpen = svg('ellipse', { class: 'bwf-mouth-open', cy: 2, rx: 7, ry: 0 })
    mouthGroup.appendChild(mouthOpen)
    mouthGroup.appendChild(mouth)
    skin.appendChild(mouthGroup)
  }

  root.appendChild(headGroup)
  host.appendChild(root)

  /* ------------------------------------------------------------ face state */
  const gaze = { x: spring(0, 150, 19), y: spring(0, 150, 19) }
  // Springs come from `idle`, which carries every key, so a preset that only
  // sets a few of them still animates the rest back to neutral.
  const shape = {}
  for (const key in EXPRESSIONS.idle) shape[key] = spring(EXPRESSIONS.idle[key], 190, 24)
  const start = EXPRESSIONS[opt.expression] || EXPRESSIONS.idle
  for (const key in start) {
    if (shape[key]) {
      shape[key].x = start[key]
      shape[key].to = start[key]
    }
  }

  const active = [] // running one-shot reactions
  let blinkAt = performance.now() + rand(1200, 4200)
  let wanderTo = { x: 0, y: 0 }
  let wanderAt = 0
  let override = null // { x, y, until }
  let visible = true
  let box = null
  let boxAt = 0
  let seenAt = 0
  let alive = true

  const invalidate = () => { box = null }
  window.addEventListener('scroll', invalidate, { passive: true, capture: true })
  window.addEventListener('resize', invalidate, { passive: true })

  let observer = null
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting },
      { rootMargin: '80px' },
    )
    observer.observe(host)
  }

  function bounds(now) {
    if (!box || now - boxAt > 400) {
      box = host.getBoundingClientRect()
      boxAt = now
    }
    return box
  }

  // Where the eyes want to be, as a unit-ish vector. Falls back to a slow
  // random wander when the pointer has gone quiet.
  function aim(now) {
    if (override) {
      if (now < override.until) return override
      override = null
    }

    const stale = !pointer.has || now - pointer.t > 2200
    if (opt.track && !stale) {
      const rect = bounds(now)
      if (rect.width) {
        const dx = pointer.x - (rect.left + rect.width / 2)
        const dy = pointer.y - (rect.top + rect.height / 2)
        const dist = Math.hypot(dx, dy)
        if (dist < 0.001) return { x: 0, y: 0 }
        // Saturating falloff: full deflection once the pointer is `reach` away,
        // and no further, so a cursor across the room doesn't pin the eyes.
        const reach = Math.max(rect.width, rect.height) * 2.2
        const t = clamp(dist / reach, 0, 1)
        const mag = t * (2 - t)
        return { x: (dx / dist) * mag, y: (dy / dist) * mag }
      }
    }

    if (!opt.idle || reduced) return { x: 0, y: 0 }
    if (now > wanderAt) {
      wanderAt = now + rand(700, 2600)
      wanderTo = Math.random() < 0.3
        ? { x: 0, y: 0 }
        : { x: rand(-0.9, 0.9), y: rand(-0.6, 0.6) }
    }
    return wanderTo
  }

  function frame(dt, now) {
    if (!visible) return

    // Scrolled offscreen, or the tab was in the background: we stopped stepping
    // but the clock didn't. Push the timers forward instead of letting a pile
    // of overdue blinks fire the instant the face comes back.
    if (seenAt && now - seenAt > 500) {
      blinkAt = now + rand(900, 3600)
      wanderAt = now + rand(400, 1400)
    }
    seenAt = now

    // A mood can bias where the eyes rest, on top of whatever they're tracking.
    // That's what lets `bored` look away and `thinking` look up — clamped past 1
    // because features are clipped to the silhouette and can't escape it.
    const target = aim(now)
    const strength = shape.track.x
    gaze.x.to = clamp(target.x * strength + shape.gazeX.x, -1.15, 1.15)
    gaze.y.to = clamp(target.y * strength + shape.gazeY.x, -1.15, 1.15)
    const gx = advance(gaze.x, dt)
    const gy = advance(gaze.y, dt)
    for (const key in shape) advance(shape[key], dt)

    // Involuntary blinking, with the occasional double.
    if (opt.blink && !reduced && now > blinkAt) {
      active.push({ def: REACTIONS.blink, t: 0 })
      blinkAt = now + (Math.random() < 0.24 ? 240 : rand(2200, 6000))
    }

    const o = { hx: 0, hy: 0, rot: 0, sx: 1, sy: 1, blink: 0, winkR: 0 }
    for (let i = active.length - 1; i >= 0; i--) {
      const r = active[i]
      r.t += dt
      const p = r.t / r.def.dur
      if (p >= 1) { active.splice(i, 1); continue }
      r.def.apply(p, o)
    }

    // Head: drifts a little toward whatever it's looking at. Small on purpose —
    // a sphere that rotates shouldn't also slide, or the ball reads as a sticker.
    // Speech energy adds a talking jiggle: a bob, a slight roll, a hair of squash.
    const talk = clamp(advance(talkS, dt), 0, 1)
    const hx = o.hx + gx * G.lean
    const hy = o.hy + gy * G.lean - talk * (1 + Math.sin(now * 0.013) * 0.9)
    const rot = o.rot + shape.head.x + Math.sin(now * 0.021) * talk * 1.7
    const tsx = o.sx * (1 - talk * 0.012)
    const tsy = o.sy * (1 + talk * 0.028)
    headGroup.setAttribute(
      'transform',
      `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${tsx.toFixed(3)} ${tsy.toFixed(3)})`,
    )

    // Yaw about the vertical axis, pitch about the horizontal one. Pitch is
    // negated because SVG's +y points down but a positive pitch looks up.
    const yaw = gx * G.turn
    const pitch = -gy * G.turn
    const cosYaw = Math.cos(yaw)
    const sinYaw = Math.sin(yaw)
    const cosPitch = Math.cos(pitch)
    const sinPitch = Math.sin(pitch)

    const lidT = clamp(shape.lidT.x, 0, 1)
    const lidB = clamp(shape.lidB.x, 0, 1)
    const tilt = shape.tilt.x
    const scale = shape.eyeScale.x

    for (const eye of eyes) {
      const shut = eye.side > 0 ? Math.max(o.blink, o.winkR) : o.blink
      // Only the right eye takes the skew — a face with both lids at the same
      // height can't look sceptical, it just looks tired.
      const lidTop = clamp(lidT + (eye.side > 0 ? shape.lidSkew.x : 0), 0, 1)
      // Size skew is the other half of the asymmetry — two eyes at slightly
      // different sizes is what reads as puzzled rather than merely tired.
      const skewed = scale * (eye.side > 0 ? 1 + shape.scaleSkew.x : 1)
      const sx = skewed
      const sy = skewed * shape.squashY.x * (1 - shut * 0.94)

      const p = project(
        eye.side * G.eyeX * shape.gap.x,
        G.eyeY + shape.eyeY.x,
        cosYaw, sinYaw, cosPitch, sinPitch,
      )

      eye.group.setAttribute(
        'transform',
        `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})` +
          ` rotate(${p.phi.toFixed(2)}) scale(${p.squash.toFixed(3)} 1) rotate(${(-p.phi).toFixed(2)})` +
          ` scale(${sx.toFixed(3)} ${Math.max(sy, 0.001).toFixed(3)})`,
      )

      // rotate-then-translate, so the lid slides along its own tilted normal.
      // Negated against `side` because a *positive* tilt has to drop each lid's
      // inner edge, and "inner" is +x on the left eye but -x on the right.
      const spin = -eye.side * tilt
      const span = 2 * G.eyeR + G.lidSlack
      eye.lidTop.setAttribute(
        'transform',
        `rotate(${spin.toFixed(2)}) translate(0 ${(-G.eyeR + lidTop * span).toFixed(2)})`,
      )
      eye.lidBottom.setAttribute(
        'transform',
        `rotate(${spin.toFixed(2)}) translate(0 ${(G.eyeR - lidB * span).toFixed(2)})`,
      )

      if (eye.pupil) {
        eye.pupil.setAttribute(
          'transform',
          `translate(${(gx * G.pupilTravel).toFixed(2)} ${(gy * G.pupilTravel).toFixed(2)})`,
        )
      }
    }

    if (mouth) {
      const curve = shape.mouth.x
      // Speech opens the mouth over the expression — enough to clearly flap,
      // not so much that every word is a shout.
      const open = clamp(Math.max(shape.open.x, talk * 0.85), 0, 1)
      const w = G.mouthW

      const m = project(0, G.mouthY, cosYaw, sinYaw, cosPitch, sinPitch)
      mouthGroup.setAttribute(
        'transform',
        `translate(${m.x.toFixed(2)} ${m.y.toFixed(2)})` +
          ` rotate(${m.phi.toFixed(2)}) scale(${m.squash.toFixed(3)} 1) rotate(${(-m.phi).toFixed(2)})`,
      )

      // The curve also *shortens* as the mouth opens, so it tucks behind the
      // ellipse instead of leaving two half-faded stubs poking out either side —
      // which is what a fading-only crossfade looks like, and talking lives in
      // exactly that range.
      // Talking lives in the mid-open range, where a slow crossfade shows the
      // curve AND the ellipse at once — two mouths. Retire the curve hard:
      // gone entirely by ~40% open, leaving the ellipse to do the talking.
      const cw = Math.max(0.5, w * (1 - open * 1.6))
      mouth.setAttribute('d', `M ${-cw.toFixed(2)} 0 Q 0 ${(curve * 11).toFixed(2)} ${cw.toFixed(2)} 0`)
      mouth.setAttribute('opacity', clamp(1 - open * 2.5, 0, 1).toFixed(3))
      mouthOpen.setAttribute('rx', (6.5 + open * 3.2).toFixed(2))
      mouthOpen.setAttribute('ry', (open * 9.5).toFixed(2))
      // Full ink, always: at ry 0 it is invisible anyway, so height alone says
      // how open the mouth is. Fading it too meant a half-open mouth was a
      // half-transparent ellipse under a half-transparent curve — which reads as
      // a smudge, and talking sits in that range constantly.
      mouthOpen.setAttribute('opacity', '1')
    }
  }

  // Speech energy follows its own snappy spring, so lip-sync callers can feed
  // raw per-frame amplitude and still get organic motion out.
  const talkS = spring(0, 950, 22)

  const api = {
    el: root,
    _frame: frame,

    // Cartoon lip-sync: 0..1 speech energy. The mouth opens on top of the
    // expression, and the head bobs and squashes like it means it.
    talk(level) {
      talkS.to = clamp(level, 0, 1)
      return api
    },

    setExpression(name) {
      const preset = EXPRESSIONS[name]
      if (!preset) return api
      for (const key in shape) {
        shape[key].to = key in preset ? preset[key] : EXPRESSIONS.idle[key]
      }
      return api
    },

    react(name, { force = false } = {}) {
      const def = REACTIONS[name]
      if (!def) return api
      if (reduced && !force) return api
      active.push({ def, t: 0 })
      return api
    },

    // Force the gaze somewhere for a moment. x/y are -1..1 from the centre.
    look(x, y, ms = 900) {
      override = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), until: performance.now() + ms }
      return api
    },

    set(options) {
      Object.assign(opt, options)
      return api
    },

    destroy() {
      if (!alive) return
      alive = false
      leave(api)
      if (observer) observer.disconnect()
      window.removeEventListener('scroll', invalidate, { capture: true })
      window.removeEventListener('resize', invalidate)
      root.remove()
    },
  }

  if (reduced) {
    for (const key in shape) settle(shape[key])
  }

  startListening()
  join(api)
  frame(1 / 60, performance.now())

  return api
}
