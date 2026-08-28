# face

A small, friendly face you can drop into a web page. It follows your cursor,
blinks on its own, and glances around when you leave it alone.

The head is a sphere — the eyes sit on its surface, so they travel a curved path
and foreshorten toward the rim instead of sliding around a flat disc. Eleven
moods, nine one-shot reactions.

**3.7 kB gzipped. No dependencies.** React wrapper included, not required.

```
npm run demo    # then open http://localhost:8080/demo/
```

---

## Install

### Nothing to install

The built bundle is hosted, styles included — one import, no stylesheet:

```html
<div id="bot" style="width:160px;height:160px"></div>

<script type="module">
  import { createFace } from 'https://bfce.bwnd.app/face.js'

  createFace(document.querySelector('#bot'), { expression: 'curious' })
</script>
```

Give the host element a width and height — the SVG fills its container, so a
container with no size renders nothing.

Mirrored on jsDelivr if you'd rather pin a tag than track latest:

```js
import { createFace } from 'https://cdn.jsdelivr.net/gh/bwndapp/face@main/dist/face.js'
```

Live demo and agent-readable docs: [bfce.bwnd.app](https://bfce.bwnd.app) ·
[SKILL.md](https://bfce.bwnd.app/SKILL.md) · [llms.txt](https://bfce.bwnd.app/llms.txt)

### Into your project

There is no npm package yet. Copy the source in — it's five files.

```bash
# in your project
mkdir -p src/face
curl -L https://github.com/bwndapp/face/archive/refs/heads/main.tar.gz \
  | tar -xz --strip-components=2 -C src/face face-main/src
```

Or just clone it and copy `src/` wherever you like.

### React

```jsx
import { Face } from './face'

export default function App() {
  return <Face size={160} expression="curious" />
}
```

That's the whole integration. `Face.jsx` imports its own CSS, so it works
out of the box with Vite, Next, CRA, Parcel — anything that lets JS import CSS.

To drive it, take a ref:

```jsx
import { useRef } from 'react'
import { Face } from './face'

function Bot() {
  const face = useRef(null)

  return (
    <>
      <Face ref={face} size={160} mouth pupils />
      <button onClick={() => face.current.react('bounce')}>hello</button>
    </>
  )
}
```

```js
face.current.react('bounce')       // one-shot, decays on its own
face.current.setExpression('sad')  // springs across, never snaps
face.current.look(-1, 0, 1200)     // force the gaze left for 1.2s
```

### Without React

`core.js` has no framework in it at all.

```html
<link rel="stylesheet" href="/face/face.css">
<div id="bot" style="width:160px;height:160px"></div>

<script type="module">
  import { createFace } from '/face/core.js'

  const face = createFace(document.querySelector('#bot'), { expression: 'happy' })
  face.react('nod')
  // face.destroy() when you're done
</script>
```

### Single file, no build step

`npm run build` produces `dist/face.js` — everything bundled, CSS injected at
runtime, nothing to link:

```html
<div id="bot" style="width:160px;height:160px"></div>
<script type="module">
  import { createFace } from './dist/face.js'
  createFace(document.querySelector('#bot'))
</script>
```

---

## Props

| prop | default | |
|---|---|---|
| `size` | `140` | px, square |
| `expression` | `'idle'` | any key of `EXPRESSIONS` |
| `mouth` | `false` | draw a mouth as well as eyes |
| `pupils` | `false` | inner dot that tracks with parallax |
| `track` | `true` | follow the pointer at all |
| `blink` | `true` | involuntary blinking |
| `idle` | `true` | glance around when the pointer goes quiet |

Everything except `expression` is read once, at construction — changing one
rebuilds the SVG. `expression` animates.

`createFace(el, options)` takes the same set, plus `expression` as the starting
mood.

## Expressions

`idle` · `happy` · `joy` · `surprised` · `curious` · `suspicious` · `focus` ·
`sleepy` · `sad` · `angry` · `sleep`

Every field of an expression is a spring target, so moods cross-fade rather than
cut. Import `EXPRESSION_NAMES` to enumerate them.

## Reactions

`blink` · `wink` · `nod` · `shake` · `bounce` · `pop` · `boing` · `spin` ·
`jitter`

Reactions layer on top of whatever mood is active and decay on their own. They
stack — firing two at once is fine. `REACTION_NAMES` enumerates them.

## Colour

Four custom properties. Set them on the face, or on anything above it.

```css
.bot {
  --face-skin:  #000;      /* the big circle — and the lids, which must match  */
  --face-ink:   #e9ebec;   /* eyes and mouth                                   */
  --face-ring:  #2f3336;   /* hairline around the head; transparent by default */
  --face-pupil: var(--face-skin);
}
```

`--face-skin` is load-bearing. The lids are head-coloured rectangles clipped to
each eye, so if it doesn't match what's behind the head, every expression seams.

The library ships no colours of its own beyond dark-mode defaults — it inherits.

```jsx
<Face style={{ '--face-ink': '#b6ff3d', '--face-skin': '#0a0f0b' }} />
```

---

## How it works

**The head is a sphere.** Each feature has a resting spot on the front of a
sphere of radius `headR`. The sphere yaws and pitches to look at you and the
result is projected orthographically back to the screen. So features travel a
curved path and slow near the rim (a point at angle θ projects to `R·sin θ`), a
circle painted on the surface projects to an ellipse — full width across the
radius, squashed along it — and the eyes and mouth turn together as one ball.

**Expressions are lids, not geometry.** There is one shape in this library: a
circle. Every mood comes from two head-coloured rectangles sliding over each eye
and rotating. `angry` and `sad` are the same lid at opposite rotations.

**Everything is a spring.** No CSS transitions, no keyframes. Each animated
value is a damped spring integrated per frame, which is why moods cross-fade
from wherever they currently are instead of restarting.

## Performance

One `requestAnimationFrame` loop and one pointer listener for the whole page, no
matter how many faces. Each face costs ~15 `setAttribute` calls per frame, and
faces scrolled out of view skip their frame entirely via `IntersectionObserver`.

Coming back from offscreen or a background tab reschedules the blink timer
rather than firing the backlog all at once.

`prefers-reduced-motion` drops the idle wander, the blinking, and the reaction
shake. Pointer tracking stays — it's a direct response, not decoration.

## Adding an expression

Add a row to `EXPRESSIONS` in `src/expressions.js`. The header comment documents
every field and its units. Two things learned the hard way:

- **A shallow `lidT` reads as a dent, not a lid.** The chord across a circle is
  already half its width at 6% closed. Go to ~0.3 or stay at 0.
- **Distinguish moods by shape, not amount.** `happy` and `joy` started as the
  same dome at two sizes and read as one mood. `joy` only became its own thing
  once both lids came in and made it a crescent.

## Credits

The visual language — near-black canvas, hairline borders doing the separating
instead of shadows, tightly tracked type, fully-round pill buttons — is inspired
by **X's design system**. The demo site leans on it deliberately.

The face itself is an original implementation. The sphere projection, the lid
system that produces every expression from a single circle, and the spring model
were written from scratch for this library.

## Licence

MIT.
