// Expression presets. Every field is a spring target, so switching expressions
// animates instead of snapping.
//
//   lidT / lidB  0..1   how far the top / bottom lid closes over the eye
//   lidSkew      0..1   extra top lid on the right eye only — the sceptical squint
//   tilt         deg    lid rotation; +ve drops the *inner* edge (angry), -ve the outer (sad)
//   eyeScale     mult   eye size
//   squashY      mult   vertical squash on top of eyeScale
//   gap          mult   distance between the eyes
//   eyeY         units  vertical nudge, in viewBox units (face is 100 wide)
//   head         deg    head tilt
//   mouth        -1..1  mouth curve, +ve smiles
//   open         0..1   how far the mouth opens
//   track        mult   how strongly the eyes chase the pointer

export const EXPRESSIONS = {
  idle:       { lidT: 0.00, lidB: 0.00, lidSkew: 0.00, tilt:   0, eyeScale: 1.00, squashY: 1.00, gap: 1.00, eyeY:  0, head:  0, mouth:  0.10, open: 0.00, track: 1.00 },
  happy:      { lidT: 0.00, lidB: 0.44, lidSkew: 0.00, tilt:   0, eyeScale: 1.06, squashY: 1.00, gap: 1.00, eyeY:  1, head:  0, mouth:  0.85, open: 0.00, track: 0.85 },
  // joy is happy pushed to a laughing crescent — both lids in, so the two read
  // as different moods rather than two settings of the same one
  joy:        { lidT: 0.16, lidB: 0.60, lidSkew: 0.00, tilt:   0, eyeScale: 1.22, squashY: 1.00, gap: 1.05, eyeY:  2, head:  0, mouth:  1.00, open: 0.35, track: 0.40 },
  surprised:  { lidT: 0.00, lidB: 0.00, lidSkew: 0.00, tilt:   0, eyeScale: 1.30, squashY: 1.00, gap: 1.02, eyeY: -1, head:  0, mouth:  0.00, open: 0.95, track: 1.00 },
  // A shallow lidT is a trap: the chord across a circle is already half its
  // width at 6% closed, so it reads as a dent. Curiosity is the head tilt plus
  // one slightly narrowed eye, not a sliver off the top of both.
  curious:    { lidT: 0.00, lidB: 0.00, lidSkew: 0.12, tilt:   0, eyeScale: 1.08, squashY: 1.00, gap: 1.00, eyeY:  0, head:  9, mouth:  0.35, open: 0.10, track: 1.00 },
  suspicious: { lidT: 0.30, lidB: 0.22, lidSkew: 0.24, tilt:   6, eyeScale: 1.00, squashY: 1.00, gap: 0.96, eyeY:  0, head: -5, mouth: -0.25, open: 0.00, track: 1.00 },
  focus:      { lidT: 0.30, lidB: 0.26, lidSkew: 0.00, tilt:   3, eyeScale: 1.00, squashY: 1.00, gap: 1.00, eyeY:  0, head:  0, mouth:  0.00, open: 0.00, track: 1.20 },
  sleepy:     { lidT: 0.60, lidB: 0.05, lidSkew: 0.00, tilt:  -4, eyeScale: 1.00, squashY: 1.00, gap: 1.00, eyeY:  2, head:  5, mouth: -0.15, open: 0.15, track: 0.45 },
  sad:        { lidT: 0.34, lidB: 0.00, lidSkew: 0.00, tilt: -20, eyeScale: 1.02, squashY: 1.00, gap: 1.00, eyeY:  2, head:  0, mouth: -0.75, open: 0.00, track: 0.70 },
  angry:      { lidT: 0.42, lidB: 0.00, lidSkew: 0.00, tilt:  22, eyeScale: 1.00, squashY: 1.00, gap: 0.94, eyeY:  0, head:  0, mouth: -0.55, open: 0.00, track: 1.15 },
  sleep:      { lidT: 0.50, lidB: 0.50, lidSkew: 0.00, tilt:   0, eyeScale: 1.00, squashY: 1.00, gap: 1.00, eyeY:  2, head:  6, mouth:  0.10, open: 0.10, track: 0.00 },
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
