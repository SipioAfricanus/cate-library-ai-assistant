# Cate Library AI Assistant

A Flask site that wraps a Dify chatflow to help Cate School students and faculty find
books, plus a ram mascot (flat-vector, canvas-drawn, zero dependencies) that appears both
in the site's side panel and as a standalone desktop pet.

Live at <https://cate-library-ai-assistant.vercel.app>.

## Layout

```
app.py                  Flask backend -- proxies Dify's Service API, streams SSE to the
                         browser, handles the Human Input (search-mode / purchase-request)
                         pause-and-resume flow, and the book-request -> Google Sheet endpoint
templates/chat.html      The whole frontend: chat UI, search-mode controls, mascot wiring
static/
  cate-crest.png
  mascot/                The shared mascot module -- see below
desktop/                 Electron desktop pet -- see below
requirements.txt         Python deps (flask, requests, python-dotenv)
vercel.json / .vercelignore   Deployment config
```

### The mascot (`static/mascot/`)

Deliberately zero-dependency: a small cut-out rig (`rig/node.js`) posed each frame by
plain JS (`anim/poses.js`), drawn with `<canvas>` 2D paths (`art/`) -- no build step, no
bundler. The browser loads the source files directly as ES modules, so what you edit is
exactly what runs, in dev and in production alike.

- `index.js` -- `createMascot()`, the single entry point both consumers use
- `rig/`, `art/`, `anim/` -- the character itself (skeleton, drawing, poses)
- `behavior/wander.js` -- roaming logic for the desktop pet; knows nothing about windows
  or the DOM, just owns a position in a 2D rect and reports what it wants. This is what
  lets the identical module drive a CSS position in a browser and an OS window in Electron.
- `behavior/react.js`, `audio/bleat.js` -- website-panel-only (outcome detection from the
  chat answer text, the optional default-off "baaa" sound)
- `entries/web.js` -- the only file that touches `chat.html`'s DOM; wires the panel up to
  `window.ramMascot`
- `dev/` -- `harness.html` + `serve.py`, a standalone page for iterating on the art/rig
  without the Flask app running. **Excluded from deploy** (see `.vercelignore`).

### The desktop pet (`desktop/`)

An Electron app that imports the *same* `static/mascot/` modules unchanged -- it's the
proof that `wander.js` is genuinely host-agnostic. Two windows: a transparent
always-on-top overlay holding the ram (click-through everywhere except the ram's own
pixels), and a plain app window for the chatbot, opened by double-clicking the ram.

Not part of the Vercel deploy -- it's a separate thing you build and hand to whoever
runs it locally.

## Running the site locally

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
cp .env.example .env   # then fill in the values below
venv/bin/python app.py # -> http://localhost:5001
```

`.env` needs:

| Key | What it's for |
|---|---|
| `DIFY_BASE_URL` | Dify API base, e.g. `https://api.dify.ai/v1` |
| `DIFY_CHATFLOW_API_KEY` | The chatflow app's API key |
| `BOOK_REQUEST_SECRET` | Shared secret guarding `/api/book-requests` |
| `APPS_SCRIPT_URL` | Google Apps Script web app URL (writes purchase requests to Sheets) |
| `APPS_SCRIPT_TOKEN` | Shared secret for the Apps Script call |

## Working on the mascot

```bash
python3 static/mascot/dev/serve.py
# -> http://localhost:8765/static/mascot/dev/harness.html
```

Renders the ram at several sizes, a scrubbable walk-cycle filmstrip, and a wander demo,
all without needing Flask or Dify running. Use this custom server, not
`python3 -m http.server` -- browsers cache ES modules aggressively even with `no-store`
headers, and `serve.py` works around it by putting a build token in the URL *path* (a
query string doesn't propagate to relative sub-imports, so it doesn't fully bust the
cache; see the comment at the top of `serve.py`).

## Building the desktop pet

```bash
cd desktop
npm install
npm run dist:mac       # -> desktop/dist/Cate Library Ram-<version>-universal-mac.zip
```

Universal build (Intel + Apple Silicon), unsigned (no Apple Developer certificate is
wired up). Unzip and drag the `.app` anywhere; **first launch** needs right-click ->
Open to get past Gatekeeper's unidentified-developer warning, since it isn't signed.

For local iteration without packaging: `npm start` (or `npm run start:local` to point it
at `http://localhost:5001` instead of production).

## Deploying

```bash
vercel deploy --prod
```

`.vercelignore` keeps the deploy to what production actually needs -- `desktop/`,
`venv/`, and `node_modules/` never get uploaded. If the mascot ever 404s in production
after a change, check that exclusion list first; an overly broad pattern there has
silently broken the deploy before.

## Git branches

`master` is the only branch anything deploys from. `feat/cate-ram-pet` is a parked,
intentionally-unmerged branch holding an earlier full 3D (Three.js) build of the mascot
-- procedural body, PBR materials, GLB loader support. It was set aside in favor of the
current flat-vector 2D approach but kept around in case any of that work (the geometry
utilities in particular) is worth returning to. Safe to ignore for day-to-day work.
