# Ballistic Chickens — the real game, vendored

The arcade entry is **the original Ballistic Chickens**, not a reimplementation. It is
[`-ezbreez-`'s kaboom.js game](https://funner.global.ssl.fastly.net/games/alotmoreagain/ballisticchickens/)
(the idea and the first build are mrVoo's). Its page loads six plain JavaScript files — no
bundle, no minifier, no decompiling needed — and those files are here byte-for-byte as served.

## What is here

| file | what it is |
| --- | --- |
| `source/index.html` | the game's page as published (the script list) |
| `source/data.js` | achievements, shop offers, star and flower tables |
| `source/code/start.js` | kaboom init, sprite atlases, fonts |
| `source/code/game.js` | the flight: launch, fuel, drag, obstacles, camera, end card |
| `source/code/shop.js` | the six upgrades and the buy button |
| `source/code/menu.js` | logo, PLAY and the ambient sky |
| `source/code/achieve.js` | the achievement grid |
| `build.mjs` | inlines the six files into `src/games/content/ballistic-chickens.html` |

```bash
node src/prototypes/ballistic-chickens/build.mjs           # rebuild the game document
node src/prototypes/ballistic-chickens/build.mjs --check   # fail if the document drifted
```

The game document is generated, so **edit `source/` and rebuild** — do not hand-edit the
script block in `src/games/content/ballistic-chickens.html`. The hand-written wrapper above
that block (save key, snapshot, asset base) is part of the document and is not generated.

## Patches applied by `build.mjs`

Everything else is the original code, including its constants, upgrade maths and money.

1. **Assets are local.** `loadRoot('sprites/')` and the four `loadFont('fonts/…')` paths point at
   `src/games/assets/ballistic-chickens/` instead of the CDN. kaboom uploads images as WebGL
   textures and loads fonts with CORS, and the original host sends no `Access-Control-Allow-Origin`,
   so the artwork could not be loaded from another origin at all. The wrapper works out the
   absolute URL from `document.baseURI`: a srcdoc frame inherits the hub's URL, a direct load
   resolves against the document itself.
2. **The save record is the arcade's.** The game's `getData('save', …)` / `setData('save', …)` calls
   become `bcLoadSave(…)` / `bcStoreSave(…)`, which read and write `bored.ballistic-chickens.save`
   in `localStorage` inside try/catch. kaboom's own helpers write the bare key `save`, which this
   origin would share with every other game here.
3. **Purchases persist.** The original only writes the save when a flight ends, so buying an
   upgrade and closing the tab lost it. `shop.js` now stores the record on each purchase, and the
   end card records the best distance (`STUFF.best`) alongside money and upgrades.
4. **PLAY plays.** Inside a frame the original button opened a new tab
   (`window.open('https://Ballistic-Chickens.mrvoo.repl.co')`) and was labelled `OPEN`; it now
   always fades into the game.
5. **The hub can read it.** `game.js` publishes the live run to `window.__bcRun`
   (`distance`, `altitude`, `maxAltitude`, `score`, `ended`) and the end card marks it finished;
   the wrapper's `window.__boredSnapshot()` turns that into
   `{ slug, meters, height, score, finished }`.

Two things were left as the original has them: achievements (`achieve()` is defined but never
called in this build, so the grid stays empty) and `source/index.html`'s `/js/all.js`, which the
CDN answers with a 404 and which nothing in the game reads.

## Network requirements

* `https://unpkg.com/kaboom@2001.0.0-alpha.21/dist/kaboom.js` — the engine, loaded with a script tag.
  If it fails the document shows a short message instead of a blank canvas.
* Nothing else. Artwork, fonts and code are served from this repo.

There is no mid-flight resume: a run lasts a few seconds and ends on the end card, and only the
money, upgrade and best-distance record are carried between visits.
