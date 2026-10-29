# Rooftop Snipers

This is the original Unity WebGL export from
[SoBloxsy/rooftop-snipers](https://github.com/SoBloxsy/rooftop-snipers), pinned to
commit `44aad84ec9c5f70ffb6179ed7f4fa91eb5c824bd`. That repository contains a
2017 Unity asm.js build, assets, and a loader; it does **not** contain the Unity
project or editable C# gameplay source. We package the actual game rather than
claim to have recovered its source. Upstream credits Michael Eichler / New Eich
Games for the game. Its supplied MIT notice (Copyright 2021 Echo) is retained
verbatim inside the packaged document; that notice is the uploader's stated
license, not independent verification of ownership of the original game assets.

## Bored integration

- Slug: `rooftop-snipers`. The original game replaces the native remake in the
  same library entry, preserving favorites and recent-game identity. The duplicate
  Classic entry and remake preview are removed. The remake’s score-capture spec,
  score-rule manifest entry and daily challenge are retired; existing stored
  score records are not deleted or applied to this different implementation.
- Launch from the normal library or Play Against Friends collection. The native
  game menu selects one or two players. P1 uses W to jump and holds/releases E
  to aim/fire; P2 uses I and O. Touch buttons send those same legacy key events.
- Load game starts Unity after a player gesture. Opening the card downloads the
  document; loading Unity does not make any HTTP requests. The document works
  alone, as a saved HTML file, or inside Bored's `srcdoc` iframe.
- Roughly 11.3 MB for the single document (base64 of 8.3 MB of compressed build
  files plus the loader); Unity requests a 256 MiB heap, with further browser,
  decoding and graphics overhead. This is heavier than Bored's native games.
- No shared leaderboard, daily challenge, or Bored Together async mode. The
  compiled export exposes no reliable score/turn API. The snapshot reports
  loaded state only and deliberately does not invent score data.
- Bored's account, favorites, recent games, session analytics and player menu
  work through the existing launch path. Escape returns; Shift+R restarts.

The wrapper embeds the compressed resources as base64 and creates Blob URLs
only after Load game. A custom `Module.resolveBuildUrl` maps each known build
filename to its Blob URL because the old loader's default resolver does not
understand the `blob:` scheme. The original compression decoder then loads the
build. One checked patch redirects Unity's C# HTTP request factory to a local
network-error response, suppressing the old optional Unity telemetry/config
requests without changing gameplay or replacing the browser's XHR globally.
The CSP permits inline/Blob scripts and legacy asm.js eval,
but no HTTP asset, analytics, or CDN calls from the game document. The original
site wrapper's metadata, icons, stylesheet and links are omitted.

## Boring Edition

The wrapper renames the game to "Rooftop Snipers: Boring Edition": `<title>`, the
cover heading, the stage label and the catalog card. That is text this repository
owns, so it is a plain edit to `scripts/templates/rooftop-snipers.html` and
`src/games/catalog.js`.

The in-game title is a baked Unity texture (`Rooftop Snipers Title`), not text, so
the running game still shows the original logo. An earlier attempt painted a
subtitle into that texture and repacked `data.unity3d`; the repacked payload
opened in UnityPy but the compiled game would not boot, so it was reverted and the
`data` blob is byte-identical to upstream again. Changing that art needs a loop
that can watch the game boot in a real browser: the deploy workflow publishes
`src/` on every push without running the suite, so a broken payload ships.

## Reproduce or edit

The shipped HTML contains generated binary payloads. Edit
`scripts/templates/rooftop-snipers.html`, then regenerate:

```sh
git clone https://github.com/SoBloxsy/rooftop-snipers.git ../rooftop-snipers-upstream
git -C ../rooftop-snipers-upstream checkout 44aad84ec9c5f70ffb6179ed7f4fa91eb5c824bd
node scripts/package-rooftop-snipers.mjs ../rooftop-snipers-upstream
npm run games:check
npm test
```

The packager verifies SHA-256 hashes for every imported build file, loader,
config and license before writing. It does not download anything or require a
build at deployment time. The final document is served as written, exactly
like the other Bored game documents.
