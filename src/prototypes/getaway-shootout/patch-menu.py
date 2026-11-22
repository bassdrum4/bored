#!/usr/bin/env python3
"""Hide non-game title/splash branding in Getaway Shootout's actual Unity assets.

Like scripts/rooftop-hide-menu-buttons.py, this changes serialized GameObjects,
not HTML or an overlay. Existing play/settings, scripts, physics and scene
transitions remain untouched. Requires UnityPy 1.25.4.
"""
import gzip
import os
import hashlib
import struct
from pathlib import Path
from collections import Counter

import UnityPy

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "src/games/content/getaway-shootout/unity/GetawayShootout.data.unityweb"
MAGIC = b"UnityWebData1.0\0"
COMMENT = b"UnityWeb Compressed Content (gzip)\0"

# Named objects confirmed from the recovered serialized scenes.
DISABLE = {"Branding_TwoPlayerGamesOrg", "NewEichGames", "Mobile"}
# This object belongs to a separate splash scene controlled by LoadSplash.
# Turning it off leaves the game rendering its background with no transition.
SPLASH_REQUIRED = "two_logo"
# 'Mobile' is the standalone title screen's App Store promotion. The touch
# controls for actual gameplay live in separate PlayerCanvas scene objects.
APP_STORE_OBJECT = "Mobile"
KEEP = {"Play", "OnePlayer", "Two Player", "Settings", "ExitButton"}
ALREADY_INACTIVE = {"TwitterButton", "Branding_Silvergames", "Branding_CrazyGames", "BuyButton"}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def unpack_web(data):
    if not data.startswith(MAGIC):
        raise RuntimeError("Unexpected UnityWebData header")
    header_end = struct.unpack_from("<i", data, len(MAGIC))[0]
    parts = []
    at = len(MAGIC) + 4
    while at < header_end:
        off, size, nlen = struct.unpack_from("<iii", data, at)
        name = data[at + 12:at + 12 + nlen].decode("utf8")
        parts.append((name, data[off:off + size]))
        at += 12 + nlen
    assert at == header_end
    return parts

def pack_web(parts):
    end = len(MAGIC) + 4 + sum(12 + len(name.encode("utf8")) for name, _ in parts)
    header = bytearray(MAGIC + struct.pack("<i", end))
    payload = bytearray()
    offset = end
    for name, body in parts:
        name_b = name.encode("utf8")
        header.extend(struct.pack("<iii", offset, len(body), len(name_b)))
        header.extend(name_b)
        payload.extend(body)
        offset += len(body)
    return bytes(header + payload)

def unity_gzip(buf):
    compressed = bytearray(gzip.compress(buf, compresslevel=9, mtime=0))
    compressed[3] = 0x10
    return bytes(compressed[:10]) + COMMENT + bytes(compressed[10:])

original = Path(os.environ.get("GETAWAY_ORIGINAL_DATA", str(DATA))).read_bytes()
parts = unpack_web(gzip.decompress(original))
scenes = [(name, content) for name, content in parts if name == "data.unity3d"]
if len(scenes) != 1:
    raise RuntimeError("Expected exactly one Unity serialized scene container")
env = UnityPy.load(scenes[0][1])
seen = Counter()
modified = []
before = {}
for obj in env.objects:
    if obj.type.name != "GameObject":
        continue
    go = obj.read()
    name = go.m_Name
    seen[name] += 1
    before.setdefault(name, []).append(bool(go.m_IsActive))
    if name in DISABLE and go.m_IsActive:
        go.m_IsActive = False
        go.save()
        modified.append((name, obj.path_id))
assert DISABLE <= set(seen), "Unexpected original game scene; missing branding objects: " + str(DISABLE - set(seen))
assert KEEP <= set(seen), "Missing gameplay navigation components"
assert before.get(SPLASH_REQUIRED) == [True], "Startup splash must remain active"
assert before.get(APP_STORE_OBJECT) in ([True], [False]), "Unexpected App Store scene object"
assert all(any(before[name]) for name in ("Play", "OnePlayer", "Two Player", "Settings")), "Play/settings scene was already disabled"
assert all(not any(before[name]) for name in ALREADY_INACTIVE if name in before), "Previously inactive third-party buttons unexpectedly enabled"

if not modified:
    print("Getaway branding objects already inactive; no changes", flush=True)
    raise SystemExit(0)

scene = env.file.save(packer="original")
if not scene.startswith(b"UnityFS"):
    raise RuntimeError("Invalid rebuilt UnityFS scene")
again = UnityPy.load(scene)
after = {}
for obj in again.objects:
    if obj.type.name == "GameObject":
        go = obj.read()
        after.setdefault(go.m_Name, []).append(bool(go.m_IsActive))
for name in DISABLE:
    assert name in after and not any(after[name]), f"{name} still visible"
for name in ("Play", "OnePlayer", "Two Player", "Settings", SPLASH_REQUIRED):
    assert after.get(name) == before.get(name), f"Gameplay menu changed: {name}"

edited = unity_gzip(pack_web([
    (name, scene if name == "data.unity3d" else body) for name, body in parts
]))
verify_parts = unpack_web(gzip.decompress(edited))
assert len(verify_parts) == len(parts)
for (name, body), (other_name, other_body) in zip(parts, verify_parts):
    assert name == other_name
    if name != "data.unity3d":
        assert body == other_body, "Unrelated game asset modified: " + name
assert sha(original) != sha(edited), "Unity data did not change"
DATA.write_bytes(edited)
print("Disabled actual Unity GameObjects:", modified, flush=True)
print("Gameplay menu retained:", sorted(KEEP), flush=True)
print("Original data SHA-256:", sha(original), flush=True)
print("Patched data SHA-256:", sha(edited), flush=True)
