# Bored — single-file site

**[index.html](index.html)** is the deliverable: one self-contained file containing all
26 games from `https://sites.google.com/midlandps.org/vibecoding/`.

Open it by double-clicking. No server, no network, no build step, no assets folder.

Live copy: **https://bassdrum4.github.io/bored/** (GitHub Pages).

## What's inside

A plain list of the games with a search box. Clicking a game opens it full-screen;
**Back** (top-left) or **Esc** returns to the list.

Everything is inlined into the one file:

| Dependency | How it's handled |
|---|---|
| 26 games | Original `data-code` source, base64-embedded |
| Google Fonts (20 games) | 88 `@font-face` rules, woff2 as base64 data URIs |
| three.js 0.176 (lighthouse) | `three.core.min` + `three.module.min` inlined, loaded via blob URL with a `data:` URI fallback |
| Font Awesome (shadow-net) | Subset to the 4 icons it actually uses (~2 KB) |

Games run in isolated `srcdoc` iframes, so each keeps its own CSS, JS globals, and
canvas exactly as before. A small shim installs a memory-backed `localStorage`
fallback only if the browser blocks storage on `file://`.

## Included (26)

sumo, sand, lighthouse, poker, wordle, lava, volletball, solitaire, commanders, eco,
void-runner, qbert, simon, frogger, pac-man, snake, tank, space-invaders, pong,
asteroids, breakout, tetris, minesweeper, tank2, gun-mayhem, shadow-net

## Deliberately excluded (5)

These were left out by request — they are **not** self-contained and would break the
"runs from disk" promise:

- **dc** — 849 KB, depends on Firebase (6 modules), Google Tag Manager, and
  Drive-hosted images. Game logic would run but online features can't work offline.
- **f-14** → `flyer2.freebuff.app` — Vite SPA, needs separate build assets
- **youtube-viewer** → `youtubeplayer.freebuff.app` — Vite SPA, needs React/vendor chunks
- **proxy** → `breezy-foxes-jump.freebuff.dev` — CORS-blocked, source not readable
- **jellyfish** → `milcktoast.com/medusae/` — CORS-blocked, source not readable

To add any of these later, their own build output plus their asset bundles would have
to be inlined too.

## Known pre-existing bug: lighthouse

The original game's CSS sets `#fatal { display: grid }` but never adds a
`#fatal[hidden] { display: none }` rule. The `display` declaration outranks the
`hidden` attribute, so the "The light is out." overlay always covers the game —
**including on the live site today.** Verified by opening the untouched
`_source/lighthouse.html` directly: same overlay, same cause.

This build preserves that behaviour unchanged, on purpose. A one-line CSS addition
fixes it; ask and it's done.

## Rebuilding

```bash
cd _build
python build.py          # writes ../index.html
```

`build.py` reads `_source/*.html` and downloads anything external (fonts, three.js,
Font Awesome) into `_build/cache/`, so rebuilds work offline once cached.

### Layout

The published GitHub repo contains only `index.html` and this README; everything
else below stays on the author's machine.

- `index.html` — the deliverable (4.6 MB)
- `_source/` — the 26 games exactly as pulled from the live site (**provenance**)
- `_build/build.py` — the build script
- `_build/collector.py` — local sink used to pull source out of the authenticated
  browser (the site requires sign-in, so `curl` cannot read it)
- `_build/shots/` — screenshots from verification
- `_build/verify_*.js` — the verification suite

## Verification

Run from `_build/` (uses the installed Chrome via `puppeteer-core`):

| Script | Checks |
|---|---|
| `verify_file_url.js` | all 26 games boot from `file://`, zero external requests |
| `verify_default_flags.js` | same, with **default** Chrome flags (plain double-click) |
| `verify_deep.js` | WebGL, Font Awesome glyphs, storage, fonts |
| `verify_input.js` | real keyboard input reaches games |
| `verify_ui.js` | search, Back, Esc, re-open |
| `verify_hidden_bug.js` | scans all games for `hidden`-attribute/CSS conflicts |

Last full run: **26/26 games boot, 0 external requests, 0 console errors.**

### One caveat the screenshots exposed

`shots/lighthouse.png` shows the fatal overlay rather than gameplay — that is the
pre-existing bug described above, not a build failure. The canvas underneath is
created and rendering (verified via `toDataURL()` and a live WebGL context).
