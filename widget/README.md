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
  reactions, colours, fits, size) and *config* (connection, ElevenLabs,
  desktop tools). Everything persists across runs.
- **It can use your computer.** Opt in, and the bot searches, lists, reads
  and opens files in the folders you allow — over the socket it already has,
  no ports, no tunnel. See *Desktop tools* below.

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

## Desktop tools

The bot's brain runs in its incubator container, but it can reach back to
this machine over the same socket. Turn it on in ✎ → config → desktop and
pick the folders it may see (Documents, Desktop and Downloads by default).
Then "find that report from last week" becomes a real search here, and the
bot hands you the path. Tools are read-only and never leave the chosen
folders:

| tool | does |
|---|---|
| `search_files` | name words or a glob, optional age/extension filter; newest first |
| `list_dir` | entries of a folder, or the allowed roots |
| `read_file` | the first N chars of a text file (binary formats report size only) |
| `open_path` | open with the default app, or reveal in the file manager |

What the bot reads travels to its container to be understood — keep private
folders out of the list. Each use is logged as a quiet line in the chat.

The frames, for the server side:

```
widget → server   {type:'tools', tools:[{name, description, input_schema}]}   after every hello; [] withdraws
server → widget   {type:'tool_request', id, name, input, incubator_id?, conversation_id?}
widget → server   {type:'tool_result', id, content:[{type:'text', text}], is_error?}
```

Tool shape and results are MCP's, so the container can expose the manifest to
its agent as-is. Requests may arrive mid-turn or unprompted, several at once.
`dev-server.js` emulates the agent side: a message starting with `find`,
`read`, `ls` or `open` triggers the matching tool.

The widget imports `../dist/face.js` straight from this repo — no copy of the
library, nothing to build. `electron` and `ws` are its only dependencies, local
to this folder and excluded from the npm package.
