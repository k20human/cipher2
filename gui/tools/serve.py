#!/usr/bin/env python3
"""Static server for the cyberdeck GUI.

http.server's default MIME table is not enough for a PWA: Chrome silently
rejects a manifest served as text/plain, and a stale service worker means
updates never land. Both are fixed here.
"""

import http.server
import json
import os
import sys

# The shell wrapper that launches this server under Termux does not
# necessarily run it from gui/, so resolve "status" next to this file
# rather than relying on the process's current directory. Skip writing
# its bytecode cache too, so importing it leaves nothing on disk.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import status as status_probe

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".html": "text/html",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        "": "application/octet-stream",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Every asset, not just sw.js. Without this the only freshness signal
        # is the Last-Modified SimpleHTTPRequestHandler already sends, and a
        # browser is free to apply heuristic caching to that — which it does.
        # The service worker's own install step fetches through the same HTTP
        # cache, so it would faithfully precache a stale file under a freshly
        # bumped CACHE_VERSION, and publishing an update would silently do
        # nothing. no-cache still allows a conditional request, so the
        # Last-Modified round trip stays a cheap 304; it forbids only serving
        # a copy without asking first. (sw.js keeps needing it for the same
        # reason it always did, and is now covered by the same rule.)
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/status":
            return self._serve_status()
        if self.path.startswith("/api/"):
            self.send_error(404, "unknown api route")
            return
        return super().do_GET()

    def _serve_status(self):
        payload = json.dumps(status_probe.snapshot()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"serving {ROOT} on http://localhost:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
