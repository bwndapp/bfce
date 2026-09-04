// Optional visual effects for a bbot face — the stack the desktop widget wears.
//
//   import { createFace } from '@bwnd/bbot'
//   import { applyFx } from '@bwnd/bbot/fx'
//
//   const face = createFace(el, { mouth: true })
//   const fx = applyFx(face, { gloss: 0.9, chrome: 0.6, rim: 0.4 })
//   fx.set({ glass: 0.5 })
//
// Deliberately a separate entry point. The core library is ~5 kB and draws two
// circles; this adds a studio environment, a neon tube, a clearcoat and a few
// hundred scratch marks per face. Anyone who wants a plain face should not pay
// for any of it, and anyone rendering a wall of faces should not turn it on —
// every knob here costs real GPU per face, and several are SVG filters.
//
// Everything is driven by CSS custom properties on the host, so `set()` is a
// handful of style writes rather than a rebuild.

const NS = 'http://www.w3.org/2000/svg'

// Every knob, and what a value of 1 means. Names match the widget's config.
// Every custom property the stack reads. The exporters copy these off the live
// host onto the clone — without them every layer renders at its default 0 and
// a photo of a chrome face comes out plain.
export const FX_VARS = [
  '--fx-eyes', '--fx-alpha', '--fx-scan-o', '--fx-gloss-o', '--fx-chrome-o',
  '--fx-glass-o', '--fx-holo-o', '--fx-scratch-o', '--fx-rim-o', '--fx-rim-b',
  '--fx-hue-dur', '--fx-rim-color',
]

export const FX_DEFAULTS = {
  bloom: 0,     // tight burn around the ink
  halation: 0,  // wide soft bleed around the ink
  glass: 0,     // body thins to glass; chromatic rings appear
  gloss: 0,     // anime catchlights on the eyeballs
  chrome: 0,    // mirror-ball reflection of a studio
  holo: 0,      // slow iridescent wash over the features
  rim: 0,       // neon tube hugging the silhouette
  scan: 0,      // CRT scanlines on the ink
  scratch: 0,   // clearcoat wear on the ball
  hue: 0,       // slow hue drift of the whole face
}

const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name)
  for (const k in attrs) node.setAttribute(k, attrs[k])
  return node
}

const hexA = (hex, a) => {
  const h = String(hex || '#e9ebec').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`
}

/* ------------------------------------------------------------------ scratch */
// A clearcoat that has been polished by someone who didn't care much: swirl
// marks in patches, a few real nicks, and pitting where grit bit in. Generated
// rather than drawn, from a seeded RNG so a given face always wears the same.
function scratchLayer(seed = 1) {
  let s = seed >>> 0 || 1
  const rnd = () => (((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296))

  const LX = -22
  const LY = -33
  const dark = []
  const light = []

  // Each mark is drawn twice, offset — a bright edge and its shadow, which is
  // what makes a scratch read as a groove rather than a line.
  const mark = (x1, y1, x2, y2, w, _s) => {
    const fall = Math.max(0.1, 1 - Math.hypot(LX - x1, LY - y1) / 95)
    light.push(`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke-width="${w.toFixed(2)}" opacity="${(fall * 0.55).toFixed(2)}"/>`)
    dark.push(`<path d="M${(x1 + 0.35).toFixed(1)} ${(y1 + 0.35).toFixed(1)}L${(x2 + 0.35).toFixed(1)} ${(y2 + 0.35).toFixed(1)}" stroke-width="${w.toFixed(2)}" opacity="${(fall * 0.5).toFixed(2)}"/>`)
  }

  const wander = (x, y, a, len, w, curve, gap) => {
    const steps = Math.max(1, Math.round(len / 2.2))
    const seg = len / steps
    const env = 1
    for (let i = 0; i < steps; i++) {
      a += curve
      const nx = x + Math.cos(a) * seg
      const ny = y + Math.sin(a) * seg
      if (!(gap && rnd() < 0.18)) mark(x, y, nx, ny, w * (0.35 + env * 0.65), 0)
      x = nx
      y = ny
    }
  }

  // The coat wears in patches — a few well-worked spots thinning out between
  // them, rather than an even spray.
  const patches = []
  for (let c = 0; c < 5; c++) patches.push([(rnd() - 0.5) * 70, (rnd() - 0.5) * 70, 10 + rnd() * 16])
  const spot = () => {
    const [px, py, pr] = patches[Math.floor(rnd() * patches.length)]
    const r = pr * (rnd() + rnd() - 1) * 1.4 // triangular falloff from the centre
    const a = rnd() * Math.PI * 2
    return [px + Math.cos(a) * r, py + Math.sin(a) * r]
  }

  // Swirl marks: buffer arcs, each patch with its own centre of rotation.
  const centres = patches.map(([x, y]) => [x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40])
  for (let i = 0; i < 620; i++) {
    const [px, py] = rnd() < 0.8 ? spot() : [(rnd() - 0.5) * 96, (rnd() - 0.5) * 96]
    if (Math.hypot(px, py) > 49) continue
    const [cx, cy] = centres[i % centres.length]
    const r = Math.hypot(px - cx, py - cy)
    if (r < 5) continue
    const ang = Math.atan2(py - cy, px - cx) + Math.PI / 2
    const len = 1.5 + rnd() * rnd() * 11
    wander(px, py, ang, len, 0.1 + rnd() * 0.18, len / r / Math.max(2, len / 2.2), rnd() < 0.3)
  }

  // Straight nicks, and a couple of proper gouges.
  for (let i = 0; i < 46; i++) {
    const [px, py] = rnd() < 0.6 ? spot() : [(rnd() - 0.5) * 90, (rnd() - 0.5) * 90]
    if (Math.hypot(px, py) > 46) continue
    const gouge = rnd() < 0.15
    const len = gouge ? 14 + rnd() * 24 : 3 + rnd() * rnd() * 16
    wander(px, py, rnd() * Math.PI * 2, len, gouge ? 0.36 + rnd() * 0.3 : 0.16 + rnd() * 0.2, (rnd() - 0.5) * 0.05, true)
  }

  // Pitting: grit that bit in and stopped.
  const pits = []
  for (let i = 0; i < 70; i++) {
    const [px, py] = rnd() < 0.7 ? spot() : [(rnd() - 0.5) * 92, (rnd() - 0.5) * 92]
    if (Math.hypot(px, py) > 47) continue
    const fall = Math.max(0.1, 1 - Math.hypot(LX - px, LY - py) / 95)
    const rr = (0.12 + rnd() * 0.3).toFixed(2)
    pits.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${rr}" fill="#fff" opacity="${(fall * 0.7).toFixed(2)}"/>`)
    pits.push(`<circle cx="${(px + 0.25).toFixed(1)}" cy="${(py + 0.25).toFixed(1)}" r="${rr}" fill="#000" opacity="${(fall * 0.45).toFixed(2)}"/>`)
  }

  const g = el('g', { class: 'bwx-scratch', 'clip-path': 'url(#bwx-headclip)', filter: 'url(#bwx-chromewarp)' })
  g.style.opacity = 'var(--fx-scratch-o, 0)'
  g.style.pointerEvents = 'none'
  g.innerHTML =
    '<g class="bwx-scratchR" fill="none" stroke-linecap="round">' +
    `<g stroke="#000" opacity="0.6">${dark.join('')}</g>` +
    `<g stroke="#fff">${light.join('')}</g>` +
    `<g stroke="none">${pits.join('')}</g>` +
    '</g>'
  return g
}

// The displacement map that magnifies the environment outward with the square
// of the radius, so the reflection piles up at the rim like a real sphere.
function warpMap(size = 128) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const half = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half
      const dy = (y - half) / half
      const r = Math.min(1, Math.hypot(dx, dy))
      const k = r * r * 0.5
      const i = (y * size + x) * 4
      img.data[i] = Math.round(128 + dx * k * 127)
      img.data[i + 1] = Math.round(128 + dy * k * 127)
      img.data[i + 2] = 128
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL()
}

/* --------------------------------------------------------------------- defs */
// Gradients and filters shared by every layer. Injected into the face's own
// <defs>, so a face carries its own and nothing leaks between instances.
function injectDefs(defs) {
  defs.insertAdjacentHTML(
    'beforeend',
    '<pattern id="bwscan" patternUnits="userSpaceOnUse" width="4" height="3">' +
      '<rect x="0" y="0" width="4" height="1.3" fill="#000"/></pattern>' +
      '<clipPath id="bwx-headclip"><circle r="46"/></clipPath>' +
      '<radialGradient id="bwx-glossg"><stop offset="0" stop-color="#fff" stop-opacity="1"/>' +
      '<stop offset="0.55" stop-color="#fff" stop-opacity="0.55"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      // chrome: a mirror-ball environment — bright sky falling to a hard
      // horizon, dark ground warming back up, then fresnel, specular and bounce
      '<linearGradient id="bwx-chromesky" gradientUnits="userSpaceOnUse" x1="0" y1="-64" x2="0" y2="4">' +
      '<stop offset="0" stop-color="#2c333a"/><stop offset="0.28" stop-color="#6f7a85"/>' +
      '<stop offset="0.7" stop-color="#c4ced7"/><stop offset="1" stop-color="#96a2ad"/></linearGradient>' +
      '<linearGradient id="bwx-chromeground" gradientUnits="userSpaceOnUse" x1="0" y1="-4" x2="0" y2="64">' +
      '<stop offset="0" stop-color="#171c21"/><stop offset="0.3" stop-color="#262d34"/>' +
      '<stop offset="1" stop-color="#4c565f"/></linearGradient>' +
      // the key softbox: white-hot centre falling to a warm-grey diffuser edge
      '<radialGradient id="bwx-sbkey" gradientUnits="userSpaceOnUse" cx="-22" cy="-33" r="24">' +
      '<stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#f4f2ee"/>' +
      '<stop offset="1" stop-color="#c9c6c0"/></radialGradient>' +
      // the strip light: a long tube fading out at both ends
      '<linearGradient id="bwx-sbstrip" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.18" stop-color="#fff" stop-opacity="0.85"/>' +
      '<stop offset="0.82" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="bwx-sbfill" gradientUnits="userSpaceOnUse" cx="27" cy="-24" r="16">' +
      '<stop offset="0" stop-color="#eef5fb"/><stop offset="1" stop-color="#a9b8c6"/></radialGradient>' +
      '<radialGradient id="bwx-chromevig" gradientUnits="userSpaceOnUse" cx="0" cy="-6" r="70">' +
      '<stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>' +
      '<filter id="bwx-chromewarp" filterUnits="userSpaceOnUse" x="-64" y="-64" width="128" height="128" color-interpolation-filters="sRGB">' +
      '<feImage href="' + warpMap() + '" x="-64" y="-64" width="128" height="128" preserveAspectRatio="none" result="m"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="m" scale="64" xChannelSelector="R" yChannelSelector="G"/></filter>' +
      '<filter id="bwx-chromeglass" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">' +
      '<feColorMatrix id="bwx-chromeglassm" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter>' +
      '<radialGradient id="bwx-chromefres" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="46">' +
      '<stop offset="0.6" stop-color="#05080b" stop-opacity="0"/><stop offset="0.88" stop-color="#05080b" stop-opacity="0.22"/>' +
      '<stop offset="1" stop-color="#05080b" stop-opacity="0.55"/></radialGradient>' +
      '<radialGradient id="bwx-chromespec" gradientUnits="userSpaceOnUse" cx="-15" cy="-19" r="20">' +
      '<stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.28" stop-color="#fff" stop-opacity="0.5"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="bwx-chromebounce" gradientUnits="userSpaceOnUse" cx="6" cy="36" r="30">' +
      '<stop offset="0" stop-color="#c9d4de" stop-opacity="0.28"/><stop offset="1" stop-color="#c9d4de" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="bwx-holo" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#9be7ff" stop-opacity="0"/><stop offset="0.3" stop-color="#9be7ff" stop-opacity="0.5"/>' +
      '<stop offset="0.45" stop-color="#ffc7f2" stop-opacity="0.55"/><stop offset="0.6" stop-color="#d9c8ff" stop-opacity="0.5"/>' +
      '<stop offset="0.75" stop-color="#c2ffe5" stop-opacity="0.45"/><stop offset="1" stop-color="#c2ffe5" stop-opacity="0"/></linearGradient>' +
      '<filter id="bwx-rimblur1" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1"/></filter>' +
      '<filter id="bwx-rimblur3" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter>' +
      '<filter id="bwx-rimblur7" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6.5"/></filter>' +
      '<radialGradient id="bwl-shade" cx="36%" cy="30%" r="88%">' +
      '<stop offset="0%" stop-color="#fff" stop-opacity="0.18"/><stop offset="45%" stop-color="#fff" stop-opacity="0"/>' +
      '<stop offset="80%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.28"/></radialGradient>'
  )
}

/* ------------------------------------------------------------------- chrome */
// A skybox reflected in the ball: a dark ceiling, a mid-grey cyc wall, a dark
// floor, a big overhead scrim, two strip lights and a cooler fill panel — each
// pooled again in the floor. No frames, no bars; soft edges everywhere, the way
// real diffusion looks.
function chromeLayer() {
  const cg = el('g', { class: 'bwx-chromeg', 'clip-path': 'url(#bwx-headclip)' })
  cg.style.opacity = 'var(--fx-chrome-o, 0)'
  cg.style.pointerEvents = 'none'
  cg.innerHTML =
    '<g filter="url(#bwx-chromewarp)"><g class="bwx-chromeR"><g>' +
    '<animateTransform attributeName="transform" type="rotate" values="-1.6 0 0; 1.6 0 0; -1.6 0 0" dur="46s" repeatCount="indefinite"/>' +
    '<rect x="-80" y="-80" width="160" height="160" fill="url(#bwx-chromesky)"/>' +
    // the horizon bows: from above, the reflected ground curls up at the edges
    '<path d="M -80 80 L -80 6 Q 0 -8 80 6 L 80 80 Z" fill="url(#bwx-chromeground)"/>' +
    '<path d="M -80 6 Q 0 -8 80 6" fill="none" stroke="#e8eff5" stroke-width="1.4" opacity="0.28" filter="url(#bwx-rimblur1)"/>' +
    '<g fill="none">' +
    '<path d="M -46 -50 L 0 -46 L -2 -22 L -44 -20 Z" fill="#fff" opacity="0.4" filter="url(#bwx-rimblur7)"/>' +
    '<path d="M -44 -48 L -2 -44 L -4 -24 L -42 -22 Z" fill="url(#bwx-sbkey)" opacity="0.94" filter="url(#bwx-rimblur1)"/>' +
    '<rect x="-62" y="-57" width="124" height="3.2" rx="1.6" fill="url(#bwx-sbstrip)" opacity="0.5" filter="url(#bwx-rimblur3)"/>' +
    '<rect x="-62" y="-57" width="124" height="3.2" rx="1.6" fill="url(#bwx-sbstrip)"/>' +
    '<rect x="-10" y="-13" width="70" height="2" rx="1" fill="url(#bwx-sbstrip)" opacity="0.4" filter="url(#bwx-rimblur3)" transform="rotate(-6)"/>' +
    '<rect x="-10" y="-13" width="70" height="2" rx="1" fill="url(#bwx-sbstrip)" opacity="0.8" transform="rotate(-6)"/>' +
    '<path d="M 14 -38 L 40 -34 L 39 -16 L 15 -14 Z" fill="#fff" opacity="0.24" filter="url(#bwx-rimblur7)"/>' +
    '<path d="M 15 -37 L 39 -33 L 38 -17 L 16 -15 Z" fill="url(#bwx-sbfill)" opacity="0.6" filter="url(#bwx-rimblur1)"/>' +
    '<ellipse cx="-24" cy="26" rx="22" ry="7" fill="#e6ebef" opacity="0.26" filter="url(#bwx-rimblur7)"/>' +
    '<ellipse cx="27" cy="20" rx="13" ry="4.5" fill="#dbe6f0" opacity="0.16" filter="url(#bwx-rimblur7)"/>' +
    '<path d="M -80 12 Q 0 4 80 12" stroke="#98a3ae" stroke-width="2" opacity="0.22" filter="url(#bwx-rimblur3)"/>' +
    '<rect x="-80" y="-80" width="160" height="160" fill="url(#bwx-chromevig)"/>' +
    '</g><rect x="-80" y="-80" width="160" height="160" fill="url(#bwx-chromebounce)"/>' +
    '</g></g>' +
    // the sphere's own shading is not part of the environment: it stays put
    '<circle r="46" fill="url(#bwx-chromefres)"/><circle r="46" fill="url(#bwx-chromespec)"/>'
  return cg
}

/* -------------------------------------------------- holo, glass and the rim */
// Over the features rather than under them: an iridescent wash, the chromatic
// rings that read as thick glass, and a neon tube hugging the silhouette —
// wide bloom, tight bloom, coloured glass, white core, and a hot spot orbiting.
function headFxLayer() {
  const hx = el('g', { class: 'bwhx' })
  hx.style.pointerEvents = 'none'
  hx.innerHTML =
    '<g clip-path="url(#bwx-headclip)" style="opacity: var(--fx-holo-o, 0)">' +
    '<rect x="-70" y="-70" width="140" height="140" fill="url(#bwx-holo)">' +
    '<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="22s" repeatCount="indefinite"/>' +
    '</rect></g>' +
    '<g style="opacity: var(--fx-glass-o, 0)">' +
    '<circle r="43.1" fill="none" stroke="#ff4d6d" stroke-width="1.5" opacity="0.34" style="mix-blend-mode: screen"/>' +
    '<circle r="43.5" fill="none" stroke="#7dffb0" stroke-width="1.5" opacity="0.34" style="mix-blend-mode: screen"/>' +
    '<circle r="43.9" fill="none" stroke="#55c8ff" stroke-width="1.5" opacity="0.34" style="mix-blend-mode: screen"/>' +
    '<circle r="39.5" fill="none" stroke="#000000" stroke-width="6.5" opacity="0.09"/>' +
    '<g style="mix-blend-mode: screen">' +
    '<path d="M -30 32 A 44 44 0 0 0 12 42" fill="none" stroke="#ff5d7a" stroke-width="3.4" opacity="0.22" stroke-linecap="round"/>' +
    '<path d="M 40 18 A 44 44 0 0 0 30 -32" fill="none" stroke="#66d9ff" stroke-width="3.4" opacity="0.22" stroke-linecap="round"/>' +
    '<path d="M -12 -42 A 44 44 0 0 0 -42 -10" fill="none" stroke="#b58cff" stroke-width="3.4" opacity="0.18" stroke-linecap="round"/>' +
    '<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="42s" repeatCount="indefinite"/>' +
    '</g>' +
    '<path d="M -18 40 A 44 44 0 0 0 40 -18" fill="none" stroke="#ffffff" stroke-width="3.6" opacity="0.2" stroke-linecap="round"/>' +
    '</g>' +
    '<g style="stroke: var(--fx-rim-color, var(--face-ink, #e9ebec))" fill="none" stroke-linecap="round">' +
    '<g style="opacity: var(--fx-rim-b, 0)">' +
    '<circle r="46" stroke-width="9" opacity="0.55" filter="url(#bwx-rimblur7)"/>' +
    '<circle r="45.5" stroke-width="5" opacity="0.8" filter="url(#bwx-rimblur3)">' +
    '<animate attributeName="opacity" values="0.8;0.72;0.8;0.8;0.66;0.8;0.78;0.8" dur="7.3s" repeatCount="indefinite"/>' +
    '</circle></g>' +
    '<g style="opacity: var(--fx-rim-o, 0)">' +
    '<circle r="45.5" stroke-width="2.4" opacity="0.95"/>' +
    '<circle r="45.5" stroke-width="0.9" stroke="#fff" opacity="0.9"/>' +
    '<circle r="45.5" stroke-width="1.6" stroke="#fff" opacity="0.7" stroke-dasharray="26 260" filter="url(#bwx-rimblur1)">' +
    '<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="9s" repeatCount="indefinite"/>' +
    '</circle></g></g>'
  return hx
}

/* ------------------------------------------------------------------ the css */
// Injected once per document. Only the pieces that must be selectors — the
// rest of the stack is inline `style` on the layers it builds.
// The rules an exported clone needs. Deliberately free of transitions: an SVG
// handed to an <img> is rasterised with no time progression, so a transitioned
// opacity is captured at its *start* value — which is 0, and which is why a
// photo of a chrome face came out plain.
export const FX_CSS = `
.bwface .bwf-head, .bwface .bwf-lid { fill-opacity: var(--fx-alpha, 1); }
.bwf-eyegloss { opacity: var(--fx-gloss-o, 0); pointer-events: none; }
.bwf-eyescan, .bwm-scan { opacity: var(--fx-scan-o, 0); pointer-events: none; }
.bwfx-huedrift { animation: bwfx-hue var(--fx-hue-dur, 30s) linear infinite; }
@keyframes bwfx-hue { from { filter: hue-rotate(0deg) } to { filter: hue-rotate(360deg) } }
@media (prefers-reduced-motion: reduce) { .bwfx-huedrift { animation: none } }
`

// On the live page the knobs should ease rather than snap.
const FX_CSS_LIVE = FX_CSS + `
.bwface [style*="var(--fx-"] { transition: opacity 260ms cubic-bezier(0.2, 0, 0, 1); }
`

let cssDone = false
function injectCss() {
  if (cssDone || typeof document === 'undefined') return
  cssDone = true
  const style = document.createElement('style')
  style.dataset.bwfx = ''
  style.textContent = FX_CSS_LIVE
  document.head.appendChild(style)
}

/* ------------------------------------------------------------------- public */

/**
 * Dress a face in the effect stack.
 *
 * @param target  a face returned by createFace, or its host element
 * @param options any of FX_DEFAULTS, each 0..1
 * @returns { set(options), destroy(), el }
 */
export function applyFx(target, options = {}) {
  const root = target?.el || (target?.querySelector ? target.querySelector('svg.bwface') : null)
  if (!root) throw new Error('applyFx: expected a face from createFace(), or an element containing one')

  const host = root.parentElement || root
  const defs = root.querySelector('defs')
  const headGroup = root.querySelector('g:not([clip-path])') || root.getElementsByTagName('g')[0]
  if (!defs || !headGroup) throw new Error('applyFx: this does not look like a bbot face')

  injectCss()
  injectDefs(defs)

  // Layers are built the first time a knob that needs them goes above zero, and
  // never again. Building them all up front is what the widget does — fine for
  // one always-on face, ruinous as a library: asking for `gloss` alone would
  // otherwise cost a chrome environment, a displacement map and 2,400 scratch
  // marks, all sitting at opacity 0.
  let shade = null
  let chrome = null
  const built = {}

  // Order is the whole trick: the reflection sits under the shading, the
  // clearcoat over both, the features above all of it, and the holo/glass/rim
  // wash over everything. `shade` is the anchor the other two insert against.
  function ensureShade() {
    if (shade) return shade
    shade = el('circle', { class: 'bwl', r: '46', fill: 'url(#bwl-shade)' })
    shade.style.pointerEvents = 'none'
    headGroup.insertBefore(shade, headGroup.children[2] || null)
    return shade
  }

  const LAYERS = {
    chrome: () => {
      chrome = chromeLayer()
      headGroup.insertBefore(chrome, ensureShade())
    },
    scratch: () => {
      headGroup.insertBefore(scratchLayer(Math.floor(Math.random() * 1e9)), ensureShade().nextSibling)
    },
    head: () => headGroup.appendChild(headFxLayer()),
    eyes: () => {
      // Scanlines and catchlights ride the ink itself, inside each eye's clip
      // and under its lids, so a blink covers them exactly as it covers the eye.
      for (const group of root.querySelectorAll('.bwf-eye-group')) {
        const firstLid = group.querySelector('.bwf-lid')
        if (!firstLid || group.querySelector('.bwf-eyescan')) continue
        const sc = el('circle', { class: 'bwf-eyescan', r: '12.6', fill: 'url(#bwscan)' })
        firstLid.parentNode.insertBefore(sc, firstLid)
        const gl = el('g', { class: 'bwf-eyegloss' })
        gl.innerHTML =
          '<circle cx="-4" cy="-4.5" r="3.4" fill="url(#bwx-glossg)" opacity="0.95"/>' +
          '<circle cx="3.4" cy="2.6" r="1.6" fill="url(#bwx-glossg)" opacity="0.75"/>'
        firstLid.parentNode.insertBefore(gl, firstLid)
      }
    },
  }

  // The ink glow goes on `.bwf-fx`, the unclipped wrapper around the features,
  // not on the clipped group inside it and not on an eye. SVG clips after it
  // filters, so a glow anywhere under a clip-path is shaved off at that edge —
  // on the eye it has half a unit to bleed into, on the head group it stops
  // dead at the rim. On the wrapper it spreads off the face and onto the page.
  const skinFx = root.querySelector('.bwf-fx')

  const need = (name) => {
    if (built[name]) return
    built[name] = true
    LAYERS[name]()
  }

  const state = { ...FX_DEFAULTS, ...options }

  function set(next = {}) {
    Object.assign(state, next)
    const ink = getComputedStyle(host).getPropertyValue('--face-ink').trim() || '#e9ebec'
    const { bloom, halation, glass, gloss, chrome: chromeV, holo, rim, scan, scratch: scratchV, hue } = state

    // Materialise only the layers this configuration actually uses.
    if (chromeV > 0.001) need('chrome')
    if (scratchV > 0.001) need('scratch')
    if (holo > 0.001 || glass > 0.001 || rim > 0.001) need('head')
    if (gloss > 0.001 || scan > 0.001) need('eyes')

    // The ink glows in its own colour: bloom is the tight burn, halation the
    // wide soft bleed, and glass splits it into two chromatic ghosts.
    const f = []
    // Radii are in viewBox units: the face is 100 across and an eye is r=12, so
    // these are roughly "a third of an eye" for the burn and "a whole eye" for
    // the bleed. The widget's vmin values do not translate — inside an SVG a
    // CSS length here is user space, not screen pixels.
    if (bloom > 0.01) f.push(`drop-shadow(0 0 ${(0.6 + bloom * 2).toFixed(2)}px ${hexA(ink, 0.45 + bloom * 0.5)})`)
    if (halation > 0.01) f.push(`drop-shadow(0 0 ${(2.2 + halation * 7.2).toFixed(2)}px ${hexA(ink, 0.1 + halation * 0.3)})`)
    if (glass > 0.01) {
      f.push(`drop-shadow(${(glass * 1.6).toFixed(2)}px 0 rgba(255, 60, 100, ${(glass * 0.5).toFixed(2)}))`)
      f.push(`drop-shadow(${(-glass * 1.6).toFixed(2)}px 0 rgba(0, 190, 255, ${(glass * 0.5).toFixed(2)}))`)
    }
    // Written literally onto the element rather than through `filter:
    // var(--fx-eyes)`. WebKit does not reliably resolve a custom property
    // inside `filter` on an SVG child, which is a silent no-op: the glow
    // simply never appears, and only on Safari. The var is still published
    // for anyone styling against it, but nothing here depends on it.
    const eyes = f.join(' ') || 'none'
    if (skinFx) skinFx.style.filter = eyes
    host.style.setProperty('--fx-eyes', eyes)

    host.style.setProperty('--fx-scan-o', (scan * 0.6).toFixed(2))
    host.style.setProperty('--fx-gloss-o', (gloss * 0.9).toFixed(2))
    // Chrome under glass: metal shows the whole room, glass only the lights. As
    // glass rises the reflection's alpha follows its luminance, so the dark
    // ceiling and floor melt away and the strip lights stay.
    host.style.setProperty('--fx-chrome-o', (chromeV * 0.9 * (1 - glass * 0.3)).toFixed(2))
    const cgm = root.querySelector('#bwx-chromeglassm')
    if (cgm && chrome) {
      if (glass > 0.01) {
        const k = (1 + glass * 0.5).toFixed(3)
        cgm.setAttribute(
          'values',
          `${k} 0 0 0 0  0 ${k} 0 0 0  0 0 ${k} 0 0  ${(glass * 0.3).toFixed(3)} ${(glass * 0.59).toFixed(3)} ${(glass * 0.11).toFixed(3)} ${(1 - glass).toFixed(3)} 0`
        )
        chrome.setAttribute('filter', 'url(#bwx-chromeglass)')
      } else chrome.removeAttribute('filter')
    }
    host.style.setProperty('--fx-glass-o', (glass * 0.9).toFixed(2))
    host.style.setProperty('--fx-holo-o', (holo * 0.22).toFixed(2))
    host.style.setProperty('--fx-scratch-o', (scratchV * 0.9).toFixed(2))
    host.style.setProperty('--fx-rim-o', Math.min(1, rim * 1.15).toFixed(2)) // the tube lights fast
    host.style.setProperty('--fx-rim-b', (rim * rim * 0.95).toFixed(2))      // the bloom swells after
    host.style.setProperty('--fx-alpha', (1 - glass * 0.92).toFixed(2))
    host.classList.toggle('bwfx-huedrift', hue > 0.01)
    host.style.setProperty('--fx-hue-dur', `${(34 - hue * 28).toFixed(1)}s`)
    return api
  }

  const api = {
    el: root,
    set,
    get: () => ({ ...state }),
    destroy() {
      for (const sel of ['.bwx-chromeg', '.bwx-scratch', '.bwhx', '.bwl', '.bwf-eyescan', '.bwf-eyegloss']) {
        for (const node of root.querySelectorAll(sel)) node.remove()
      }
      for (const k of ['eyes', 'scan-o', 'gloss-o', 'chrome-o', 'glass-o', 'holo-o', 'scratch-o', 'rim-o', 'rim-b', 'alpha', 'hue-dur']) {
        host.style.removeProperty(`--fx-${k}`)
      }
      host.classList.remove('bwfx-huedrift')
    },
  }

  return set(state)
}

export default applyFx
