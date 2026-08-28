// Expression presets. Every field is a spring target, so switching expressions
// animates instead of snapping.
//
//   lidT / lidB  0..1   how far the top / bottom lid closes over the eye
//   lidSkew      0..1   extra top lid on the right eye only — the sceptical squint
//   scaleSkew    mult   size difference between the eyes — puzzled, not tired
//   tilt         deg    lid rotation; +ve drops the *inner* edge (angry), -ve the outer (sad)
//   eyeScale     mult   eye size
//   squashY      mult   vertical squash on top of eyeScale
//   gap          mult   distance between the eyes
//   eyeY         units  vertical nudge, in viewBox units (face is 100 wide)
//   head         deg    head tilt
//   gazeX/gazeY  -1..1  where the eyes rest, on top of what they're tracking
//   mouth        -1..1  mouth curve, +ve smiles
//   open         0..1   how far the mouth opens
//   track        mult   how strongly the eyes chase the pointer

export const EXPRESSIONS = {
  idle:       { lidT: 0, lidB: 0, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1, squashY: 1, gap: 1, eyeY: 0, head: 0, gazeX: 0, gazeY: 0, mouth: 0.1, open: 0, track: 1 },
  content:    { lidT: 0.1, lidB: 0.2, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 0.96, squashY: 1, gap: 0.98, eyeY: 1, head: 3, gazeX: 0, gazeY: 0.16, mouth: 0.55, open: 0, track: 0.55 },
  happy:      { lidT: 0, lidB: 0.44, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1.06, squashY: 1, gap: 1, eyeY: 1, head: 0, gazeX: 0, gazeY: 0, mouth: 0.85, open: 0, track: 0.85 },
  joy:        { lidT: 0.16, lidB: 0.6, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1.22, squashY: 1, gap: 1.05, eyeY: 2, head: 0, gazeX: 0, gazeY: 0, mouth: 1, open: 0.35, track: 0.4 },
  excited:    { lidT: 0, lidB: 0, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1.24, squashY: 1, gap: 1.07, eyeY: -2, head: 0, gazeX: 0, gazeY: 0, mouth: 1, open: 0.5, track: 1.25 },
  love:       { lidT: 0, lidB: 0.12, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1.26, squashY: 1, gap: 1.02, eyeY: 1, head: 9, gazeX: 0, gazeY: 0.1, mouth: 0.95, open: 0, track: 0.55 },
  surprised:  { lidT: 0, lidB: 0, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1.3, squashY: 1, gap: 1.02, eyeY: -1, head: 0, gazeX: 0, gazeY: 0, mouth: 0, open: 0.95, track: 1 },
  scared:     { lidT: 0.16, lidB: 0.04, lidSkew: 0, scaleSkew: 0, tilt: -22, eyeScale: 1.26, squashY: 1, gap: 0.86, eyeY: -1, head: 0, gazeX: 0, gazeY: 0.12, mouth: -0.6, open: 0.55, track: 1.3 },
  curious:    { lidT: 0, lidB: 0, lidSkew: 0.12, scaleSkew: 0, tilt: 0, eyeScale: 1.08, squashY: 1, gap: 1, eyeY: 0, head: 9, gazeX: 0, gazeY: -0.22, mouth: 0.35, open: 0.1, track: 1 },
  confused:   { lidT: 0, lidB: 0, lidSkew: 0.1, scaleSkew: -0.18, tilt: 0, eyeScale: 1, squashY: 1, gap: 1, eyeY: 0, head: 13, gazeX: 0.22, gazeY: -0.2, mouth: -0.1, open: 0, track: 0.7 },
  thinking:   { lidT: 0.22, lidB: 0, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1, squashY: 1, gap: 1, eyeY: 0, head: 6, gazeX: 0.55, gazeY: -0.5, mouth: 0.1, open: 0, track: 0.12 },
  focus:      { lidT: 0.32, lidB: 0.28, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1.05, squashY: 1, gap: 0.94, eyeY: 0, head: 0, gazeX: 0, gazeY: 0, mouth: 0, open: 0, track: 1.25 },
  suspicious: { lidT: 0.3, lidB: 0.22, lidSkew: 0.24, scaleSkew: 0, tilt: 6, eyeScale: 1, squashY: 1, gap: 0.96, eyeY: 0, head: -5, gazeX: 0, gazeY: 0, mouth: -0.25, open: 0, track: 1 },
  smug:       { lidT: 0.34, lidB: 0, lidSkew: 0.16, scaleSkew: 0, tilt: 8, eyeScale: 1, squashY: 1, gap: 1, eyeY: 0, head: 6, gazeX: 0.38, gazeY: 0, mouth: 0.55, open: 0, track: 0.5 },
  sly:        { lidT: 0.28, lidB: 0.36, lidSkew: 0, scaleSkew: 0, tilt: 7, eyeScale: 1, squashY: 1, gap: 1, eyeY: 0, head: 0, gazeX: 0.42, gazeY: 0, mouth: 0.7, open: 0, track: 0.45 },
  bored:      { lidT: 0.46, lidB: 0, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1, squashY: 1, gap: 1, eyeY: 0, head: 4, gazeX: -0.62, gazeY: 0.16, mouth: -0.2, open: 0, track: 0.18 },
  worried:    { lidT: 0.22, lidB: 0, lidSkew: 0, scaleSkew: 0, tilt: -14, eyeScale: 1.06, squashY: 1, gap: 0.97, eyeY: 1, head: 0, gazeX: 0, gazeY: 0, mouth: -0.45, open: 0, track: 0.9 },
  sad:        { lidT: 0.34, lidB: 0, lidSkew: 0, scaleSkew: 0, tilt: -20, eyeScale: 1.02, squashY: 1, gap: 1, eyeY: 2, head: 0, gazeX: 0, gazeY: 0, mouth: -0.75, open: 0, track: 0.7 },
  annoyed:    { lidT: 0.5, lidB: 0.05, lidSkew: 0, scaleSkew: 0, tilt: 10, eyeScale: 1, squashY: 1, gap: 0.96, eyeY: 0, head: -4, gazeX: 0, gazeY: 0, mouth: -0.3, open: 0, track: 1.05 },
  angry:      { lidT: 0.42, lidB: 0, lidSkew: 0, scaleSkew: 0, tilt: 22, eyeScale: 1, squashY: 1, gap: 0.94, eyeY: 0, head: 0, gazeX: 0, gazeY: 0, mouth: -0.55, open: 0, track: 1.15 },
  sleepy:     { lidT: 0.6, lidB: 0.05, lidSkew: 0, scaleSkew: 0, tilt: -4, eyeScale: 1, squashY: 1, gap: 1, eyeY: 2, head: 5, gazeX: 0, gazeY: 0.2, mouth: -0.15, open: 0.15, track: 0.45 },
  sleep:      { lidT: 0.5, lidB: 0.5, lidSkew: 0, scaleSkew: 0, tilt: 0, eyeScale: 1, squashY: 1, gap: 1, eyeY: 2, head: 6, gazeX: 0, gazeY: 0, mouth: 0.1, open: 0.1, track: 0 },
}

export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS)

const TAU = Math.PI * 2
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p))

// One-shot animations layered on top of whatever expression is active.
// `apply(p, o)` runs each frame with p going 0 → 1; `o` is the frame's offset bag.
export const REACTIONS = {
  blink: {
    dur: 0.26,
    apply: (p, o) => { o.blink = Math.max(o.blink, Math.sin(p * Math.PI) ** 0.55) },
  },
  wink: {
    dur: 0.42,
    apply: (p, o) => { o.winkR = Math.max(o.winkR, Math.sin(p * Math.PI) ** 0.55) },
  },
  nod: {
    dur: 0.72,
    apply: (p, o) => { o.hy += Math.sin(p * TAU * 1.5) * 7 * (1 - p) },
  },
  shake: {
    dur: 0.72,
    apply: (p, o) => { o.hx += Math.sin(p * TAU * 2) * 7 * (1 - p) },
  },
  bounce: {
    dur: 0.85,
    apply: (p, o) => {
      const e = Math.sin(p * TAU) * (1 - p)
      o.hy -= Math.abs(e) * 13
      o.sy += e * 0.13
      o.sx -= e * 0.13
    },
  },
  pop: {
    dur: 0.5,
    apply: (p, o) => {
      const e = Math.sin(p * Math.PI) * (1 - p * 0.4)
      o.sx += e * 0.17
      o.sy += e * 0.17
    },
  },
  boing: {
    dur: 0.95,
    apply: (p, o) => {
      const e = Math.sin(p * TAU * 2.2) * Math.exp(-p * 4)
      o.sy += e * 0.24
      o.sx -= e * 0.24
    },
  },
  spin: {
    dur: 0.95,
    apply: (p, o) => { o.rot += easeInOut(p) * 360 },
  },
  jitter: {
    dur: 0.5,
    apply: (p, o) => {
      const d = 1 - p
      o.hx += Math.sin(p * 79) * 2.2 * d
      o.hy += Math.cos(p * 67) * 2.2 * d
    },
  },
}

export const REACTION_NAMES = Object.keys(REACTIONS)
