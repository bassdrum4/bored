# Getaway Shootout — recovered executable source

This is Getaway Shootout's **actual Unity WebGL program**, recovered from the
vendored original under `src/games/content/getaway-shootout/`. It is not a
from-scratch clone, and it is not recovered C# source.

The original C# was compiled by IL2CPP into C++ and then by Emscripten into
asm.js. The recoverable code is the complete asm.js program. It is formatted,
indexed and editable here, as with Rooftop Snipers.

## Files

- `source/getaway-shootout.code.js` — complete executable program (~36.7 MB,
  444,715 source lines, 32,697 functions)
- `functions.tsv` — minified function name, source line, parameters, depth
- `il2cpp/classes.md` — names and fields/methods of 480 Unity/IL2CPP
  no-namespace class definitions
- `il2cpp/string-literals.txt` — recovered strings (2,907)
- `asset-files.tsv`, `scene-gameobjects.tsv` — Unity asset and GameObject
  inventory (including the actual title-menu branding objects)
- `decompile.mjs` — extract, check, and rebuild the compiled program
- `inspect-game.py` — inspect actual Unity scene objects with UnityPy
- `patch-menu.py` — narrowly deactivate only unwanted external title/splash
  branding in the serialized scene, preserving game menu functionality

## Editing the game

From the repository root:

```bash
# Verify the editable program is still token-identical to the vendored build
node src/prototypes/getaway-shootout/decompile.mjs --check

# Edit source/getaway-shootout.code.js using the function index and class map
# Rebuild the actual Unity WebGL executable from your edits
node src/prototypes/getaway-shootout/decompile.mjs --rebuild \
  src/games/content/getaway-shootout/unity/GetawayShootout.asm.code.unityweb

# Check that the decompressed and rebuilt executable parses as JavaScript
node --check src/prototypes/getaway-shootout/source/getaway-shootout.code.js
```

`--check` tests the **entire token stream**, not file whitespace. It is expected
to fail once you intentionally change the original game behavior; retain the
original digest as a baseline before changing the code.

## Menu cleanup (scene data, not CSS)

The title scene contains GameObjects named `Branding_TwoPlayerGamesOrg`,
`NewEichGames`, and the `two_logo` splash. These were originally active.
`TwitterButton`, `Branding_Silvergames`, `Branding_CrazyGames`, and
`BuyButton` were already inactive in the particular vendored build.

The script below modifies **serialized Unity GameObject active flags** inside
`GetawayShootout.data.unityweb` and verifies that `Play`, `OnePlayer`,
`Two Player`, and `Settings` retain their original active state. Other scene
data, scripts, controls, character assets and powerups are unchanged.

```bash
python -m pip install UnityPy==1.25.4
python src/prototypes/getaway-shootout/patch-menu.py
```

Unity still needs to initialize its runtime and decompress assets. Removing a
decorative splash object cannot skip those necessary loading steps. This patch
does not claim to have eliminated every internally controlled scene transition.

Getaway Shootout is originally by New Eich Games / Michael Eichler; the
recovered source and assets retain their original authorship, regardless of
Bored's uncluttered play interface. The existence of a public WebGL export or
recovered code is not itself a redistribution license.
