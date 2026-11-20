"""Play the game in a browser without WebAssembly.

The real pygame game runs on this machine with a dummy video/audio driver.
Every frame is JPEG-encoded and streamed to the browser as MJPEG, and browser
keyboard/mouse input is posted into pygame's event queue.

    python webplay.py --port 8000

Then open http://127.0.0.1:8000
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Must be set before pygame is imported: no window and no audio device needed.
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")

import pygame  # noqa: E402

WIDTH, HEIGHT = 1280, 640
FPS = 60
JPEG_QUALITY = 72

try:
    from PIL import Image
except ImportError:  # pragma: no cover - Pillow is optional
    Image = None

# ---------------------------------------------------------------- shared state

_frame_lock = threading.Condition()
_frame = b""
_frame_seq = 0

_mouse_pos = [WIDTH // 2, HEIGHT // 2]
_mouse_buttons = [0, 0, 0]
_pressed_keys: set[int] = set()
_input_lock = threading.Lock()


def _publish(surface):
    """Encode a frame and wake any streaming clients."""
    global _frame, _frame_seq
    try:
        if Image is not None:
            raw = pygame.image.tostring(surface, "RGB")
            image = Image.frombytes("RGB", surface.get_size(), raw)
            buffer = io.BytesIO()
            image.save(buffer, "JPEG", quality=JPEG_QUALITY)
            data = buffer.getvalue()
        else:
            buffer = io.BytesIO()
            pygame.image.save(surface, buffer, "frame.jpg")
            data = buffer.getvalue()
    except Exception as exc:  # keep the game alive if a frame cannot be encoded
        print("frame encode failed:", repr(exc))
        return
    with _frame_lock:
        _frame = data
        _frame_seq += 1
        _frame_lock.notify_all()


def _install_hooks():
    """Redirect display output to the stream and input from the browser."""
    original_flip = pygame.display.flip
    original_update = pygame.display.update

    def flip():
        surface = pygame.display.get_surface()
        if surface is not None:
            _publish(surface)
        try:
            original_flip()
        except Exception:
            pass

    def update(*args, **kwargs):
        surface = pygame.display.get_surface()
        if surface is not None:
            _publish(surface)
        try:
            original_update(*args, **kwargs)
        except Exception:
            pass

    pygame.display.flip = flip
    pygame.display.update = update

    pygame.mouse.get_pos = lambda: (int(_mouse_pos[0]), int(_mouse_pos[1]))
    pygame.mouse.get_pressed = lambda num_buttons=3: tuple(
        bool(_mouse_buttons[i]) for i in range(min(3, num_buttons))
    )

    class KeyState:
        def __getitem__(self, key):
            return key in _pressed_keys

        def __len__(self):
            return len(_pressed_keys)

        def __iter__(self):
            return iter(_pressed_keys)

    pygame.key.get_pressed = lambda: KeyState()


# ------------------------------------------------------------------- key codes

KEYMAP = {
    "KeyA": pygame.K_a, "KeyB": pygame.K_b, "KeyC": pygame.K_c, "KeyD": pygame.K_d,
    "KeyE": pygame.K_e, "KeyF": pygame.K_f, "KeyG": pygame.K_g, "KeyH": pygame.K_h,
    "KeyI": pygame.K_i, "KeyJ": pygame.K_j, "KeyK": pygame.K_k, "KeyL": pygame.K_l,
    "KeyM": pygame.K_m, "KeyN": pygame.K_n, "KeyO": pygame.K_o, "KeyP": pygame.K_p,
    "KeyQ": pygame.K_q, "KeyR": pygame.K_r, "KeyS": pygame.K_s, "KeyT": pygame.K_t,
    "KeyU": pygame.K_u, "KeyV": pygame.K_v, "KeyW": pygame.K_w, "KeyX": pygame.K_x,
    "KeyY": pygame.K_y, "KeyZ": pygame.K_z,
    "ArrowUp": pygame.K_UP, "ArrowDown": pygame.K_DOWN,
    "ArrowLeft": pygame.K_LEFT, "ArrowRight": pygame.K_RIGHT,
    "Space": pygame.K_SPACE, "Escape": pygame.K_ESCAPE, "Enter": pygame.K_RETURN,
    "Tab": pygame.K_TAB, "Backspace": pygame.K_BACKSPACE,
    "ShiftLeft": pygame.K_LSHIFT, "ShiftRight": pygame.K_RSHIFT,
    "ControlLeft": pygame.K_LCTRL, "ControlRight": pygame.K_RCTRL,
    "Backquote": pygame.K_BACKQUOTE, "Minus": pygame.K_MINUS, "Equal": pygame.K_EQUALS,
    "Digit0": pygame.K_0, "Digit1": pygame.K_1, "Digit2": pygame.K_2, "Digit3": pygame.K_3,
    "Digit4": pygame.K_4, "Digit5": pygame.K_5, "Digit6": pygame.K_6, "Digit7": pygame.K_7,
    "Digit8": pygame.K_8, "Digit9": pygame.K_9,
}


def _post_event(event):
    try:
        pygame.event.post(event)
    except Exception:
        pass


def _key_event(code, down, text=""):
    key = KEYMAP.get(code)
    if key is None:
        return
    with _input_lock:
        if down:
            _pressed_keys.add(key)
        else:
            _pressed_keys.discard(key)
    if down:
        _post_event(pygame.event.Event(pygame.KEYDOWN, key=key, unicode=text or "", mod=0))
    else:
        _post_event(pygame.event.Event(pygame.KEYUP, key=key, mod=0))


def _mouse_event(kind, data):
    x, y = int(data.get("x", _mouse_pos[0])), int(data.get("y", _mouse_pos[1]))
    button = int(data.get("b", 0))
    if kind == "move":
        _mouse_pos[0], _mouse_pos[1] = x, y
        _post_event(pygame.event.Event(pygame.MOUSEMOTION, pos=(x, y), rel=(0, 0), buttons=(0, 0, 0)))
        return
    pygame_button = button + 1 if button >= 0 else 1
    down = bool(data.get("d"))
    _mouse_pos[0], _mouse_pos[1] = x, y
    if 0 <= button < 3:
        _mouse_buttons[button] = 1 if down else 0
    if down:
        _post_event(pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=(x, y), button=pygame_button))
    else:
        _post_event(pygame.event.Event(pygame.MOUSEBUTTONUP, pos=(x, y), button=pygame_button))


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Among Us</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; height: 100%; background: #0c0c0f; overflow: hidden; }
  #stage { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
  #screen { max-width: 100vw; max-height: 100vh; display: block; outline: none; }
  #hint { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%);
          color: #cfd3dc; font: 13px/1.4 system-ui, sans-serif; background: #0009;
          padding: 6px 12px; border-radius: 999px; pointer-events: none; transition: opacity .4s; }
  #status { position: fixed; top: 10px; left: 12px; color: #8ef; font: 12px monospace;
            background: #0009; padding: 4px 8px; border-radius: 6px; }
</style></head>
<body>
<div id="stage"><img id="screen" src="/stream" alt="game screen" draggable="false"></div>
<div id="status">connecting...</div>
<div id="hint">Click the game, then use WASD / arrows / mouse &nbsp;·&nbsp; Esc = menu</div>
<script>
const img = document.getElementById('screen');
const status = document.getElementById('status');
const hint = document.getElementById('hint');
const GW = __GW__, GH = __GH__;

function send(payload) {
  fetch('/input', {method: 'POST', body: JSON.stringify(payload), keepalive: true}).catch(() => {});
}
function gamePos(ev) {
  const r = img.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(GW - 1, Math.round((ev.clientX - r.left) * GW / r.width))),
    y: Math.max(0, Math.min(GH - 1, Math.round((ev.clientY - r.top) * GH / r.height)))
  };
}
const tracked = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab','Backspace']);
window.addEventListener('keydown', ev => {
  if (tracked.has(ev.code)) ev.preventDefault();
  if (ev.repeat) return;
  send({t:'key', c:ev.code, d:1, text: ev.key && ev.key.length === 1 ? ev.key : ''});
  hint.style.opacity = '0';
}, {passive:false});
window.addEventListener('keyup', ev => {
  if (tracked.has(ev.code)) ev.preventDefault();
  send({t:'key', c:ev.code, d:0});
}, {passive:false});
window.addEventListener('mousemove', ev => send({t:'move', ...gamePos(ev)}));
window.addEventListener('mousedown', ev => { ev.preventDefault(); send({t:'mouse', ...gamePos(ev), b:ev.button, d:1}); hint.style.opacity='0'; });
window.addEventListener('mouseup', ev => send({t:'mouse', ...gamePos(ev), b:ev.button, d:0}));
window.addEventListener('contextmenu', ev => ev.preventDefault());
img.addEventListener('load', () => { status.textContent = 'live'; });
img.addEventListener('error', () => { status.textContent = 'waiting for game...'; setTimeout(() => { img.src = '/stream?' + Date.now(); }, 1500); });
fetch('/state').then(r => r.json()).then(s => { status.textContent = s.ready ? 'live' : 'starting game...'; }).catch(() => {});
</script></body></html>
""".replace("__GW__", str(WIDTH)).replace("__GH__", str(HEIGHT))


class Handler(BaseHTTPRequestHandler):
    server_version = "AmongUsWeb/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/state":
            body = json.dumps({"ready": _frame_seq > 0, "frames": _frame_seq}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/stream":
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            sent = 0
            try:
                while True:
                    with _frame_lock:
                        if _frame_seq == sent:
                            _frame_lock.wait(1.0)
                        if _frame_seq == sent or not _frame:
                            continue
                        data, sent = _frame, _frame_seq
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n")
                    self.wfile.write(b"Content-Length: " + str(len(data)).encode() + b"\r\n\r\n")
                    self.wfile.write(data)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                return
        self.send_error(404)

    def do_POST(self):
        if self.path.split("?")[0] != "/input":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096:
                raise ValueError
            data = json.loads(self.rfile.read(length))
            kind = data.get("t")
            if kind == "key":
                _key_event(str(data.get("c", "")), bool(data.get("d")), str(data.get("text", ""))[:1])
            elif kind == "mouse":
                _mouse_event("mouse", data)
            elif kind == "move":
                _mouse_event("move", data)
        except Exception:
            pass
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()


def serve(port):
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.2}, daemon=True).start()
    return httpd


async def run_game():
    _install_hooks()
    print("loading game assets...", flush=True)
    from game import Game

    game = Game()
    print("game ready - open the browser", flush=True)
    while True:
        game.reset_round()
        await game.menu.game_intro()


def main():
    parser = argparse.ArgumentParser(description="Play Among Us in the browser")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    serve(args.port)
    print(f"\nAmong Us (browser)\nOpen: http://127.0.0.1:{args.port}\nCtrl+C to stop.\n", flush=True)
    try:
        asyncio.run(run_game())
    except KeyboardInterrupt:
        pass
    print("closing", flush=True)


if __name__ == "__main__":
    main()
