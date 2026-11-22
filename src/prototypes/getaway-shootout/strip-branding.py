#!/usr/bin/env python3
"""Remove third-party title/splash artwork from the actual Getaway Shootout Unity export.

Deliberately preserves all GameObjects (especially the active two_logo splash
controller), scripts, scene transitions, gameplay UI, physics and loading logic.
Only the named Texture2D artwork is replaced with fully transparent pixels.
"""
import gzip
import hashlib
import struct
from pathlib import Path

from PIL import Image
import UnityPy

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "src/games/content/getaway-shootout/unity/GetawayShootout.data.unityweb"
MAGIC = b"UnityWebData1.0\0"
COMMENT = b"UnityWeb Compressed Content (gzip)\0"
PROMOTIONAL_TEXTURES = {
    "two_logo",                       # TwoPlayerGames.org initial splash
    "two-logo-big",                   # TwoPlayerGames.org banner
    "silvergames_logo_with_shadow-500x70",
    "CrazyGamesLogo",
    "NeweichgamesSplash",             # Extra publisher splash (creator credit retained in source)
}
MUST_STAY_ACTIVE = {"two_logo", "Play", "OnePlayer", "Two Player"}

def unpack(data):
    assert data.startswith(MAGIC), "Unexpected UnityWebData header"
    end = struct.unpack_from("<i", data, len(MAGIC))[0]
    pos = len(MAGIC) + 4
    members = []
    while pos < end:
        offset, size, nlen = struct.unpack_from("<iii", data, pos)
        name = data[pos + 12:pos + 12 + nlen].decode("utf8")
        members.append((name, data[offset:offset + size]))
        pos += 12 + nlen
    assert pos == end
    return members

def pack(members):
    end = len(MAGIC) + 4 + sum(12 + len(name.encode("utf8")) for name, _ in members)
    header = bytearray(MAGIC + struct.pack("<i", end))
    payload = bytearray()
    offset = end
    for name, body in members:
        name_bytes = name.encode("utf8")
        header += struct.pack("<iii", offset, len(body), len(name_bytes)) + name_bytes
        payload += body
        offset += len(body)
    return bytes(header + payload)

def unity_gzip(data):
    header = bytearray(gzip.compress(data, compresslevel=9, mtime=0))
    header[3] = 0x10
    return bytes(header[:10]) + COMMENT + bytes(header[10:])

def objects_in(env):
    state = {}
    for obj in env.objects:
        if obj.type.name != "GameObject": continue
        go = obj.read()
        state.setdefault(go.m_Name, []).append(bool(go.m_IsActive))
    return state

original = DATA.read_bytes()
parts = unpack(gzip.decompress(original))
bundles = [(name, body) for name, body in parts if name == "data.unity3d"]
assert len(bundles) == 1, "Original Unity scene archive not found"
env = UnityPy.load(bundles[0][1])
before = objects_in(env)
seen = set()
changed = []
for obj in env.objects:
    if obj.type.name != "Texture2D": continue
    texture = obj.read()
    if texture.m_Name not in PROMOTIONAL_TEXTURES: continue
    seen.add(texture.m_Name)
    original_image = texture.image
    assert original_image.width > 0 and original_image.height > 0, "Unexpected promotional artwork"
    # Retain dimensions and path IDs: other components may reference these
    # sprites, and a missing texture might crash the compiled engine.
    transparent = Image.new("RGBA", original_image.size, (0, 0, 0, 0))
    texture.image = transparent
    texture.save()
    changed.append((texture.m_Name, obj.path_id, original_image.size))
assert seen == PROMOTIONAL_TEXTURES, "Brand artwork missing: " + str(PROMOTIONAL_TEXTURES - seen)
for name in MUST_STAY_ACTIVE:
    assert any(before.get(name, [])), f"Essential startup/menu GameObject inactive: {name}"

serialized = env.file.save(packer="original")
assert serialized.startswith(b"UnityFS"), "UnityFS rebuild invalid"
check = UnityPy.load(serialized)
after = objects_in(check)
assert before == after, "Unexpected GameObject state change"
verified = set()
for obj in check.objects:
    if obj.type.name != "Texture2D": continue
    tex = obj.read()
    if tex.m_Name in PROMOTIONAL_TEXTURES:
        rgba = tex.image.convert("RGBA")
        assert rgba.getchannel("A").getextrema() == (0, 0), f"{tex.m_Name} still visible"
        verified.add(tex.m_Name)
assert verified == PROMOTIONAL_TEXTURES
other = [(name, content) for name, content in parts if name != "data.unity3d"]
patched = unity_gzip(pack([
    (name, serialized if name == "data.unity3d" else body) for name, body in parts
]))
again = unpack(gzip.decompress(patched))
assert [(n, v) for n, v in again if n != "data.unity3d"] == other, "Unrelated assets altered"
assert patched != original, "No changes produced"
DATA.write_bytes(patched)
print("Outside branding removed (transparent textures):", changed)
print("All GameObject active states preserved; startup controller remains active")
print("Original SHA256:", hashlib.sha256(original).hexdigest())
print("Patched SHA256:", hashlib.sha256(patched).hexdigest())
