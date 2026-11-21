#!/usr/bin/env python3
"""Inspect Bored's bundled Unity 2017 title screen without modifying game data."""
import base64
import gzip
import json
import re
import struct
from pathlib import Path

import UnityPy

html = Path("src/games/content/rooftop-snipers.html").read_text(encoding="utf8")
match = re.search(r'<script id="unity-build" type="application/json">(.*?)</script>', html, re.S)
assert match, "Missing embedded Unity build"
build = json.loads(match.group(1))
blob = gzip.decompress(base64.b64decode(build["assets"]["rooftop-snipers.data.unityweb"]))
magic = b"UnityWebData1.0" + bytes([0])
assert blob.startswith(magic), "Not UnityWebData1.0"
header_end = struct.unpack_from("<i", blob, len(magic))[0]
files = {}
at = len(magic) + 4
while at < header_end:
    offset, size, name_len = struct.unpack_from("<iii", blob, at)
    name = blob[at + 12 : at + 12 + name_len].decode()
    files[name] = blob[offset : offset + size]
    at += 12 + name_len
print("UnityWebData members:", [(name, len(value)) for name, value in files.items()], flush=True)

pattern = re.compile(r"full.?screen|tweet|twitter|app.?store|google.?play|market|favorite|menu|setting|button|logo|title|start|new.?eich|social|play", re.I)
for name, value in files.items():
    if not (value.startswith(b"UnityFS") or value.startswith(b"UnityRaw") or value.startswith(b"UnityWeb")):
        continue
    print("\\nUNITY ASSET", name, len(value), flush=True)
    try:
        env = UnityPy.load(value)
    except Exception as error:
        print("READ ERROR", str(error), flush=True)
        continue
    counts = {}
    hits = []
    all_go = []
    for obj in env.objects:
        kind = obj.type.name
        counts[kind] = counts.get(kind, 0) + 1
        if kind not in ("GameObject", "Sprite", "Texture2D", "MonoScript", "TextAsset"):
            continue
        try:
            data = obj.read()
            title = str(getattr(data, "m_Name", ""))
            if kind == "GameObject":
                all_go.append((obj.path_id, title))
            if pattern.search(title):
                hits.append((kind, obj.path_id, title))
        except Exception as error:
            pass
    print("Types", counts, flush=True)
    print("Relevant objects", hits[:220], flush=True)
    print("All GameObjects", all_go[:1000], flush=True)
