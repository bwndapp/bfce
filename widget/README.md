# bbot desktop widget

The face, off the page: a frameless, transparent, always-on-top Electron window
that stands in for one of your Tension incubators.

- **Click the face to chat.** Speech bubbles float above it: streamed replies,
  markdown (code, lists, headings, quotes, links), OG preview cards under
  links, a thinking timer, scrollable history, a clear button. Threads are the
  same ones the Tension web UI shows.
- **Press and move to drag** — it gets scared mid-drag and boings on landing.
- **Eyes follow your cursor** across the whole desktop (the main process polls
  the global cursor position and drives `look()`).
- **It acts the conversation out** — thinking pose with a thought-trail while
  a reply is pending, focus during tool calls, a mood read from each reply,
  a worried shake on errors.
- **Bots can reach out first.** A DM or alert arrives on the open socket; the
  widget plays a soft blip and shows a big anime "!" until you click in, then
  loads that thread.
- Hover for the other controls: **⤡** drag to resize · **✕** close · **✎**
  settings — a tabbed panel: *style* (mood gallery of live mini-faces,
  reactions, colours, fits, size) and *config* (connection). Everything
  persists across runs.

## Run

```sh
cd widget
npm install
npm start
```

On Windows, double-clicking `start.cmd` does both. Launching twice focuses the
running one instead of spawning a twin.

## Connect it to bwnd

Mint a device key in Tension → Settings → Desktop widgets, then ✎ → config:
paste the `bbk_…` key, connect, and pick which incubator this bbot stands in
for. Chat requires the connection — offline sends show an error.

For local development without an account, `npm run dev-server` runs an emulator
of the bwnd socket (streaming, notifications, history) on
`ws://localhost:8787`; any key is accepted. The protocol lives in `bridge.js`
(client) and `dev-server.js` (reference server).

The widget imports `../dist/face.js` straight from this repo — no copy of the
library, nothing to build. `electron` and `ws` are its only dependencies, local
to this folder and excluded from the npm package.
