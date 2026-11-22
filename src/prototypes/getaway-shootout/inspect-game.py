#!/usr/bin/env python3
"""Inspect the original Getaway Shootout Unity WebData scenes, without changing them.

Reads the self-hosted WebGL data archive. Writes indexed, inspectable asset
and GameObject lists, like the Rooftop Snipers reverse-engineering workflow.
"""
import gzip
import struct
from pathlib import Path

import UnityPy

ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / "src/games/content/getaway-shootout/unity/GetawayShootout.data.unityweb"
OUT = Path(__file__).resolve().parent
MAGIC = b"UnityWebData1.0\0"

buf = gzip.decompress(BUILD.read_bytes())
if not buf.startswith(MAGIC):
    raise RuntimeError(f"Unexpected Getaway WebData header: {buf[:32]!r}")
header_end = struct.unpack_from("<i", buf, len(MAGIC))[0]
offset = len(MAGIC) + 4
members = []
while offset < header_end:
    start, size, length = struct.unpack_from("<iii", buf, offset)
    name = buf[offset+12:offset+12+length].decode()
    members.append((name, buf[start:start+size]))
    offset += 12+length
assert offset == header_end

asset_lines = ["name\tbytes"]
names = ["scene_asset\tpath_id\tname\tactive"]
error_lines = []
for name, contents in members:
    asset_lines.append(f"{name}\t{len(contents)}")
    if not any(name.endswith(ext) for ext in (".unity3d", ".assets", ".resource", ".bundle")):
        continue
    try:
        env = UnityPy.load(contents)
        count = 0
        for obj in env.objects:
            if obj.type.name != "GameObject":
                continue
            go = obj.read()
            game_name = go.m_Name.replace("\t", " ").replace("\n", " ")
            names.append(f"{name}\t{obj.path_id}\t{game_name}\t{int(go.m_IsActive)}")
            count += 1
        print(f"Assets {name}: {len(contents):,} bytes; {count} GameObjects", flush=True)
    except Exception as exc:
        msg = f"{name}: {type(exc).__name__}: {exc}"
        print(msg, flush=True)
        error_lines.append(msg)

(OUT/"asset-files.tsv").write_text("\n".join(asset_lines)+"\n")
(OUT/"scene-gameobjects.tsv").write_text("\n".join(names)+"\n")
if error_lines:
    (OUT/"inspect-errors.txt").write_text("\n".join(error_lines)+"\n")
print(f"Indexed {len(members)} embedded files, {len(names)-1} GameObjects", flush=True)
print("PROMOTIONAL / MENU NAMES:")
for line in names[1:]:
    if any(word in line.lower() for word in [
        "mainmenu", "title", "menu", "load", "splash", "logo", "sponsor",
        "portal", "link", "button", "store", "credit", "new", "eich", "twitter",
        "facebook", "app", "more", "quit", "game", "play", "start"
    ]):
        print(line, flush=True)
