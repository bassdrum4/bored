# Bored — single-file site

**[index.html](index.html)** is the deliverable: one self-contained file containing all
26 games from `https://sites.google.com/midlandps.org/vibecoding/`, plus three entries
(F-14, DC, Klang) that live on their own servers and load in the player over the
network.

Open it by double-clicking. No server, no build step, no assets folder. The 26
embedded games need no network; the last three rows do (see below).

Live copy: **https://bassdrum4.github.io/bored/** (GitHub Pages).

## What's inside

A plain list of 29 rows — the 26 pulled games plus three remote entries — with a
search box. Clicking a game opens it full-screen;
**Back** (top-left) or **Esc** returns to the list.

Everything is inlined into the one file:

| Dependency | How it's handled |
|---|---|
| 26 games | Original `data-code` source, UTF-8 inlined strings |
| Google Fonts (20 games) | 88 `@font-face` rules, woff2 as base64 data URIs |
| three.js 0.176 (lighthouse) | `three.core.min` + `three.module.min` inlined as UTF-8, loaded via blob URL with a `data:` URI fallback |
| Font Awesome (shadow-net) | Subset to the 4 icons it actually uses (~2 KB) |
| F-14, DC, Klang | **Not inlined** — remote SPAs, loaded in the player from their own origins |

Games run in isolated `srcdoc` iframes, so each keeps its own CSS, JS globals, and
canvas exactly as before; the three remote entries use a normal iframe `src` instead.
A small shim installs a memory-backed `localStorage`
fallback only if the browser blocks storage on `file://`.

## Pulled from the class site (26)

sumo, sand, lighthouse, poker, wordle, lava, volletball, solitaire, commanders, eco,
void-runner, qbert, simon, frogger, pac-man, snake, tank, space-invaders, pong,
asteroids, breakout, tetris, minesweeper, tank2, gun-mayhem, shadow-net

## Embedded live (3)

These three were originally left out because they are not self-contained pages.
They are back as rows 27–29 — same row look, same Back/Esc flow — but they load
in the player from their own servers, so they need internet:

- **F-14** → `flyer2.freebuff.app` — Vite SPA flight sim
- **DC** → `workbag.dpdns.org` — the original class-site dc tile pointed elsewhere;
  this URL is the one the hub's row opens. It loads its own Firebase/GTM deps.
- **Klang** → `youtubeplayer.freebuff.app/player` — Vite SPA YouTube music player;
  signed-out visitors see Klang's own sign-in screen

None of the three sends `X-Frame-Options` or a framing `Content-Security-Policy`
(re-checked 2026-10-05), so they run inside the player iframe.

## Deliberately excluded (2)

- **proxy** → `breezy-foxes-jump.freebuff.dev` — CORS-blocked, source not readable
- **jellyfish** → `milcktoast.com/medusae/` — CORS-blocked, source not readable

To inline any of the remote three instead, their own build output plus their asset
bundles would have to be bundled into the file.

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
| `verify_embeds.js` | the 3 remote entries load in the player; the idle hub makes zero requests |
| `verify_hidden_bug.js` | scans all games for `hidden`-attribute/CSS conflicts |

Last full run: **26/26 games boot, 0 external requests, 0 console errors; 3 embeds
navigate and render; idle hub makes 0 requests.**

### One caveat the screenshots exposed

`shots/lighthouse.png` shows the fatal overlay rather than gameplay — that is the
pre-existing bug described above, not a build failure. The canvas underneath is
created and rendering (verified via `toDataURL()` and a live WebGL context).
