# Squaretato

Upstream: https://github.com/TheGustafson/squaretato (author: TheGustafson). The upstream README declares the project MIT licensed. Vendored deployment: gh-pages commit 44e34c83e99de41e9c51f6e9669592a3625fc794, asset index-Cq5IxYS2.js. Upstream source branch at import: e996e1189f0cc93f4c8977cbbeb796a6572b7a70.

Bored changes: relative asset paths; namespaced local saves; removed debug commands and background music (asset rights not independently documented); no server calls, no shared scores. Original synthesized sound effects retained. The SVG card is original to Bored. No upstream music redistributed.

MIT License

Copyright (c) TheGustafson (upstream Squaretato author)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Integration follow-up: the patched build is inlined in the game document so hub input analytics, Escape handling and loading work in the normal Bored frame. Rendering DPR capped at 1.5; the game pauses when it loses focus or the tab becomes hidden, and clears canceled touch input. The snapshot is for local inspection only, not score submission.


## Bored survival overhaul
The default game is now a separately implemented, original-art 20-wave autobattler, with a new save key (bored.squaretato.save.v2). The prior MIT-declared version is retained at legacy.html for existing saves and provenance. No commercial game code, artwork, or audio was copied. Reference for generic mechanics: https://brotato.wiki.spellsandguns.com/Waves and https://brotato.wiki.spellsandguns.com/Shop. The gameplay is inspired by the standard wave/shop loop, not a claim of exact parity.

Second pass: difficulty-tier schedule, material bag, rare elite crates, destructible trees, regeneration formula, weapon aiming graphics and browser smoke test. Reference: https://brotato.wiki.spellsandguns.com/Dangers, https://brotato.wiki.spellsandguns.com/Materials, https://brotato.wiki.spellsandguns.com/HP_Regeneration.

Third pass: quadratic XP threshold with +1 HP per level, shop inflation/rarity curves, enemy growth/limits and additional enemy types, boss early completion, endless toggle and per-character win records. Reference: https://brotato.wiki.spellsandguns.com/Experience, https://brotato.wiki.spellsandguns.com/Shop, https://brotato.wiki.spellsandguns.com/Enemies.
