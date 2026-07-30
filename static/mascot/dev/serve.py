#!/usr/bin/env python3
"""Dev server for the mascot harness.

    python3 static/mascot/dev/serve.py
    -> http://localhost:8765/static/mascot/dev/harness.html

Exists for exactly one reason: `python3 -m http.server` sends no cache headers, so browsers
cache the ES modules aggressively. Editing mascot/src and reloading then silently serves the
OLD code -- the harness renders a stale ram and you debug art that isn't running. A reload
does not help, because reloading revalidates the HTML but not already-cached module graphs.

Sending no-store on everything makes edit-reload actually mean edit-reload.
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
# Three levels up: static/mascot/dev -> repo root. Serving the repo root (rather than
# static/) keeps harness URLs identical to the paths Flask and Vercel serve in production,
# so an import that works here works there.
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        """Strip a leading /v/<token>/ so the harness can version the whole module graph.

        no-store headers alone were NOT enough: Chrome kept serving the module graph loaded
        by the first page load, so editing mascot/src and reloading silently ran the old
        code. A `?v=` query busts the module it is on, but relative sub-imports do not
        inherit a query -- `./palette.js` resolved from `index.js?v=1` is still plain
        `palette.js`, so the dependencies stayed stale.

        Putting the version in the PATH fixes that, because relative resolution DOES inherit
        the directory prefix: `/v/123/mascot/src/index.js` pulls
        `/v/123/mascot/src/art/palette.js`, a fresh URL for every module, every load.
        """
        if path.startswith("/v/"):
            parts = path.split("/", 3)          # ['', 'v', '<token>', 'rest...']
            path = "/" + parts[3] if len(parts) > 3 else "/"
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quiet: one line per asset per reload drowns out anything useful.
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"serving {ROOT} on http://localhost:{PORT} (no-store)")
    print(f"harness: http://localhost:{PORT}/mascot/dev/harness.html")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler).serve_forever()
