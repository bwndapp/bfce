# bbot desktop widget

The face, off the page: a frameless, transparent, always-on-top Electron window
that floats on your desktop.

- **Drag it** anywhere — it gets scared mid-drag and boings on landing.
- **Eyes follow your cursor** across the whole desktop, not just the window
  (the main process polls the global cursor position and drives `look()`).
- Left alone, it drifts between moods on its own.
- Hover for controls: **⤡** drag to resize · **✕** close · **✎** customize —
  a settings window with every expression as a live mini-face, reaction
  buttons, colours, presets, and a size slider. Choices persist across runs.

## Run

```sh
cd widget
npm install
npm start
```

On Windows, double-clicking `start.cmd` does both. Launching twice focuses the
running one instead of spawning a twin.

The widget imports `../dist/face.js` straight from this repo — no copy of the
library, nothing extra to build. Electron is its only dependency, installed
locally to this folder and never shipped with the npm package.
