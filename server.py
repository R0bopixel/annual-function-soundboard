"""Local server for the Annual Function Soundboard.

Serves the app, lists the audio files in the configured audio folder, and
streams those files with byte-range support so seeking works.

The audio folder is set in config.json:

    { "audioDir": "../path/to/Mp3s" }

Relative paths are resolved from this file's folder. If config.json is missing
or has no audioDir, the local `audio/` folder is used.

Run with `start.bat` or:

    python server.py

Then open http://localhost:8080
"""

import json
import os
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, "config.json")
DEFAULT_AUDIO_DIR = os.path.join(ROOT, "audio")
AUDIO_EXTS = {
    ".mp3", ".mpeg", ".mpg", ".wav", ".ogg", ".oga", ".m4a", ".m4b", ".mp4",
    ".aac", ".flac", ".opus", ".webm", ".aif", ".aiff", ".wma",
    ".mov", ".m4v", ".mkv", ".ogv",
}


def load_audio_dir():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
            config = json.load(handle)
        configured = config.get("audioDir")
        if configured:
            if not os.path.isabs(configured):
                configured = os.path.join(ROOT, configured)
            return os.path.abspath(configured)
    except (OSError, ValueError):
        pass
    return DEFAULT_AUDIO_DIR


AUDIO_DIR = load_audio_dir()


class SoundboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self._range_length = None
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        """Map /media/<name> to the configured audio folder."""
        parsed = urllib.parse.urlparse(path)
        if parsed.path.startswith("/media/"):
            name = urllib.parse.unquote(parsed.path[len("/media/"):])
            name = os.path.basename(name)
            return os.path.join(AUDIO_DIR, name)
        return super().translate_path(path)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.rstrip("/") == "/api/audio":
            self.send_audio_list()
            return
        if parsed.path.startswith("/media/"):
            name = urllib.parse.unquote(parsed.path[len("/media/"):])
            if not name or name.endswith("/"):
                self.send_error(404, "File not found")
                return
        super().do_GET()

    def send_head(self):
        """Serve byte ranges so the browser can seek inside audio files."""
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self._range_length = None
            return super().send_head()

        range_header = self.headers.get("Range")
        if not range_header:
            self._range_length = None
            return super().send_head()

        try:
            units, _, spec = range_header.partition("=")
            if units.strip().lower() != "bytes":
                self._range_length = None
                return super().send_head()

            start_text, _, end_text = spec.partition("-")
            size = os.path.getsize(path)
            if start_text:
                start = int(start_text)
                end = int(end_text) if end_text else size - 1
            else:
                suffix = int(end_text)
                start = max(0, size - suffix)
                end = size - 1

            if start < 0 or start >= size or end < start:
                self.send_error(416, "Requested Range Not Satisfiable")
                return None

            end = min(end, size - 1)
            length = end - start + 1
            handle = open(path, "rb")
            handle.seek(start)
            self._range_length = length
            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(length))
            self.end_headers()
            return handle
        except (ValueError, OSError):
            self._range_length = None
            return super().send_head()

    def copyfile(self, source, outputfile):
        length = self._range_length
        if length is None:
            try:
                return super().copyfile(source, outputfile)
            except (ConnectionResetError, BrokenPipeError):
                return

        remaining = length
        try:
            while remaining > 0:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (ConnectionResetError, BrokenPipeError):
            # The browser closed the stream (for example, after seeking).
            pass

    def send_audio_list(self):
        files = []
        if os.path.isdir(AUDIO_DIR):
            for name in sorted(os.listdir(AUDIO_DIR), key=lambda value: value.lower()):
                full_path = os.path.join(AUDIO_DIR, name)
                if not os.path.isfile(full_path):
                    continue
                if os.path.splitext(name)[1].lower() not in AUDIO_EXTS:
                    continue
                try:
                    stat = os.stat(full_path)
                except OSError:
                    continue
                files.append({
                    "name": name,
                    "path": "media/" + urllib.parse.quote(name),
                    "size": stat.st_size,
                    "mtime": int(stat.st_mtime * 1000),
                })

        body = json.dumps({
            "folder": AUDIO_DIR,
            "files": files,
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    if AUDIO_DIR == DEFAULT_AUDIO_DIR:
        os.makedirs(AUDIO_DIR, exist_ok=True)

    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), SoundboardHandler)
    print("Annual Function Soundboard")
    print(f"  App:   http://localhost:{port} (also reachable on the LAN at this machine's IP)")
    print(f"  Audio: {AUDIO_DIR}")
    if not os.path.isdir(AUDIO_DIR):
        print("  Warning: that audio folder does not exist.")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
