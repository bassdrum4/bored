#!/usr/bin/env python3
"""Disable promotional title-menu controls in the actual Rooftop Snipers Unity scene.

Operates only on serialized GameObjects. Preserves compiled asm.js gameplay,
all textures, other scenes, and asset files. Requires UnityPy (tested: 1.25.4).
Run from the Bored repository root.
"""
import base64
import gzip
import hashlib
import json
import re
import struct
from pathlib import Path

import UnityPy

HTML = Path("src/games/content/rooftop-snipers.html")
TEST = Path("tests/rooftop-snipers.test.cjs")
ASSET = "rooftop-snipers.data.unityweb"
MAGIC = b"UnityWebData1.0" + bytes([0])
COMMENT = b"UnityWeb Compressed Content (gzip)" + bytes([0])
DISABLE = {
    "FullScreenIcon",
    "FullScreenButton",
    "FullscreenError",
    "OnTheAppstore",
    "Tweet",
    "TweetFavoriteCustomization",
    "NewEichGames",
}
KEEP = {"PlayButton", "Settings", "SettingsMenu", "1Player", "2Player"}


def unpack_web(data):
    assert data.startswith(MAGIC), "Unexpected Unity WebData header"
    header_end = struct.unpack_from("<i", data, len(MAGIC))[0]
    members = []
    at = len(MAGIC) + 4
    while at < header_end:
        offset, size, size_name = struct.unpack_from("<iii", data, at)
        name = data[at + 12:at + 12 + size_name].decode("utf8")
        members.append((name, data[offset:offset + size]))
        at += 12 + size_name
    assert at == header_end
    return members


def pack_web(members):
    header_end = len(MAGIC) + 4 + sum(12 + len(name.encode("utf8")) for name, _ in members)
    header = bytearray(MAGIC + struct.pack("<i", header_end))
    payload = bytearray()
    offset = header_end
    for name, contents in members:
        name_bytes = name.encode("utf8")
        header += struct.pack("<iii", offset, len(contents), len(name_bytes))
        header += name_bytes
        payload += contents
        offset += len(contents)
    return bytes(header + payload)


def wrap_gzip(data):
    compressed = bytearray(gzip.compress(data, compresslevel=9, mtime=0))
    compressed[3] = 0x10  # Unity 2017 identifies WebGL gzip by its FCOMMENT
    return bytes(compressed[:10]) + COMMENT + bytes(compressed[10:])


def sha(data):
    return hashlib.sha256(data).hexdigest()


html = HTML.read_text(encoding="utf8")
match = re.search(r'(<script id="unity-build" type="application/json">)(.*?)(</script>)', html, re.S)
assert match, "Unity build JSON missing"
build = json.loads(match.group(2))
original_zip = base64.b64decode(build["assets"][ASSET])
members = unpack_web(gzip.decompress(original_zip))
target = [contents for name, contents in members if name == "data.unity3d"]
assert len(target) == 1, "Could not uniquely locate UnityFS scene asset"
env = UnityPy.load(target[0])

seen = set()
modified = []
for obj in env.objects:
    if obj.type.name != "GameObject":
        continue
    data = obj.read()
    name = data.m_Name
    if name in KEEP:
        assert data.m_IsActive, "Required menu control already inactive: " + name
    if name not in DISABLE:
        continue
    seen.add(name)
    if data.m_IsActive:
        print("Disabling", name, "at", obj.path_id, flush=True)
        data.m_IsActive = False
        data.save()
        modified.append(name)

assert {"FullScreenIcon", "FullScreenButton", "OnTheAppstore", "Tweet", "NewEichGames"} <= seen, (
    "Missing expected UI controls: " + str(DISABLE - seen)
)
assert KEEP <= {obj.read().m_Name for obj in env.objects if obj.type.name == "GameObject"}, "Missing Play/Settings"
if not modified:
    print("Title controls already inactive; no changes")
    raise SystemExit(0)

new_unityfs = env.file.save(packer="original")
assert new_unityfs.startswith(b"UnityFS")
check = UnityPy.load(new_unityfs)
for obj in check.objects:
    if obj.type.name == "GameObject" and obj.read().m_Name in DISABLE:
        assert not obj.read().m_IsActive, "Disabled control became active again"
for name, contents in members:
    if name != "data.unity3d":
        assert contents, "Unexpected missing asset data"
new_members = [(name, new_unityfs if name == "data.unity3d" else content) for name, content in members]
new_zip = wrap_gzip(pack_web(new_members))
assert unpack_web(gzip.decompress(new_zip))
old_hash, new_hash = sha(original_zip), sha(new_zip)
print("Original/edited data SHA-256:", old_hash, new_hash, flush=True)
build["assets"][ASSET] = base64.b64encode(new_zip).decode("ascii")
new_html = html[:match.start(2)] + json.dumps(build, separators=(",", ":")) + html[match.end(2):]
HTML.write_text(new_html, encoding="utf8")

test = TEST.read_text(encoding="utf8")
assert old_hash in test, "Preserved-data assertion changed; review before updating"
TEST.write_text(test.replace(old_hash, new_hash).replace(
    "// Prevent accidentally swapping the actual game for the native remake or a",
    "// The Unity scene disables promotional title controls (see scripts/rooftop-hide-menu-buttons.py).\n"
    "  // Prevent accidentally swapping the actual game for the native remake or a"
), encoding="utf8")
print("Disabled controls:", sorted(set(modified)), flush=True)
