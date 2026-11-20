"""Asset-path compatibility and browser loader helpers.

The game's asset literals were written on Windows, which ignores case and accepts
backslashes. pygbag's virtual filesystem and Linux are case-sensitive, so
"Assets/Images/Menu/back.png" fails when the directory is actually "menu".
Every loader goes through resolve_asset(), which falls back to a per-segment,
case-insensitive lookup and rewrites backslashes to forward slashes.
"""
from __future__ import annotations

import importlib
import os
import sys

import pygame

IS_WEB = sys.platform == "emscripten"


def web_title(text):
    """Show load progress in the browser tab while starting up."""
    if not IS_WEB:
        return
    try:
        import platform

        platform.window.document.title = "amongus: " + str(text)
    except Exception:
        pass


def resolve_asset(path):
    """Return an existing path for `path`, matching each segment case-insensitively."""
    if not isinstance(path, str) or not path:
        return path
    normalized = path.replace("\\", "/")
    if os.path.exists(normalized):
        return normalized

    drive, rest = os.path.splitdrive(normalized)
    if rest.startswith("/"):
        current = (drive or "") + "/"
        parts = [part for part in rest.split("/") if part]
    else:
        current = drive or "."
        parts = [part for part in rest.split("/") if part and part != "."]

    for part in parts:
        try:
            entries = os.listdir(current)
        except OSError:
            return path
        match = part if part in entries else next(
            (entry for entry in entries if entry.lower() == part.lower()), None)
        if match is None:
            return path
        current = os.path.join(current, match)
    return current


# Under pygbag the pygame package is assembled from separate modules, so the
# submodules may not be attributes of `pygame` until they are imported.
def _submodule(name, current=None):
    if current is not None:
        return current
    try:
        return importlib.import_module(name)
    except Exception:
        return None


pygame.image = _submodule("pygame.image", getattr(pygame, "image", None))
pygame.mixer = _submodule("pygame.mixer", getattr(pygame, "mixer", None))
pygame.font = _submodule("pygame.font", getattr(pygame, "font", None))
_music = getattr(pygame.mixer, "music", None)
if _music is None:
    _music = _submodule("pygame.mixer.music")
if _music is None:
    class _SilentMusic:
        """Stand-in for pygame.mixer.music where the wasm build lacks it."""

        def __getattr__(self, name):
            return lambda *args, **kwargs: None

    _music = _SilentMusic()
if pygame.mixer is not None:
    pygame.mixer.music = _music

_counts = {"image": 0, "sound": 0}

_image_load = pygame.image.load


def _load_image(file, *args, **kwargs):
    _counts["image"] += 1
    web_title("image %d %s" % (_counts["image"], os.path.basename(str(file))))
    return _image_load(resolve_asset(file), *args, **kwargs)


pygame.image.load = _load_image

_sound = pygame.mixer.Sound


def _load_sound(file, *args, **kwargs):
    _counts["sound"] += 1
    web_title("sound %d %s" % (_counts["sound"], os.path.basename(str(file))))
    return _sound(resolve_asset(file), *args, **kwargs)


pygame.mixer.Sound = _load_sound

if _music is not None:
    _music_load = pygame.mixer.music.load

    def _load_music(file, *args, **kwargs):
        web_title("music " + os.path.basename(str(file)))
        return _music_load(resolve_asset(file), *args, **kwargs)

    pygame.mixer.music.load = _load_music

_font = pygame.font.Font


def _load_font(file, *args, **kwargs):
    return _font(resolve_asset(file), *args, **kwargs)


pygame.font.Font = _load_font


# pygame-ce on wasm does not implement pygame.time.set_timer, which the game
# uses for its one-second countdowns. Emulate it from the real clock: due
# timers are turned into events when the game asks for its events.
if IS_WEB:
    _timers = {}

    def _set_timer(event, millis, loops=0):
        event_type = getattr(event, "type", event)
        if not millis:
            _timers.pop(event_type, None)
            return
        millis = max(1, int(millis))
        _timers[event_type] = [millis, pygame.time.get_ticks() + millis]

    pygame.time.set_timer = _set_timer
    _event_get = pygame.event.get

    def _get_events(*args, **kwargs):
        events = _event_get(*args, **kwargs)
        now = pygame.time.get_ticks()
        for event_type, timer in list(_timers.items()):
            if now >= timer[1]:
                events.append(pygame.event.Event(event_type, {}))
                timer[1] = now + timer[0]
        return events

    pygame.event.get = _get_events
