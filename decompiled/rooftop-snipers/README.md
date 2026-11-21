# Rooftop Snipers — decompiled, editable source

This folder is the real Rooftop Snipers build taken apart into source you can edit.

The game in `src/games/content/rooftop-snipers.html` is a Unity 2017 WebGL export built with
**IL2CPP AOT**: the C# was compiled to C++, then that was compiled to asm.js. There is no IL
and no C# left in the payload, so the only faithful source of the game's behaviour is the
asm.js program itself. That is what is here — the whole program, unbundled, formatted and
indexed — plus the class model that IL2CPP kept in its metadata.

Nothing in `src/` was changed to make this.

## What is here

| Path | What it is |
| --- | --- |
| `source/rooftop-snipers.code.js` | **The game.** The complete asm.js program from the shipped payload (21.55 MB, 478,279 lines, 33,833 functions), indented and navigable. Edit this. |
| `functions.tsv` | Index of every function in that file: name, line, parameters, nesting depth. |
| `il2cpp/classes.md` | The recovered C# class model: 302 no-namespace types with exact field names, method names, parameter counts and metadata tokens (`Gamemanager`, `Shoot`, `ShootAI`, `Jump`, `Sniper`, `SlowMo`, …). |
| `il2cpp/string-literals.txt` | The `ldstr` string table from `global-metadata.dat` (2,842 entries). |

## Edit and run it

```bash
# 1. change anything in decompiled/rooftop-snipers/source/rooftop-snipers.code.js
# 2. repack it into a playable game document
node scripts/decompile-rooftop-snipers.mjs --rebuild _build/rooftop-snipers/my-build.html
# 3. open that file through any static server (it must be served over http, not file://)
npx vite --port 3000        # then browse to /_build/rooftop-snipers/my-build.html
```

`--rebuild` re-gzips the source with Unity's gzip comment, re-embeds it in the original
document, and writes a self-contained game file. Only the code payload changes; the loader,
the data, the memory image and the wrapper are carried across untouched.

To make an edit the arcade actually serves, rebuild over
`src/games/content/rooftop-snipers.html`. That file is the deployed game and the suite pins
the SHA-256 of the code payload in `tests/rooftop-snipers.test.cjs`, so update that hash in
the same commit — that assertion exists to stop an accidental swap, and shipping a real edit
means renewing it deliberately.

Regenerate this whole folder from the shipped document (no network, no other inputs):

```bash
node scripts/decompile-rooftop-snipers.mjs          # rebuild the tree
node scripts/decompile-rooftop-snipers.mjs --check  # verify it still is the shipped program
```

## Why the code looks like this

IL2CPP compiles each C# method into a C++ function, and Emscripten then emits that function
into asm.js with a mangled name (`aVi`, `_Ui`, …). The names in `il2cpp/classes.md` are the
compiled names and survive in the metadata; they are not attached to the code, because the
function-pointer tables that would link them live in the binary's data segment rather than in
a symbol table. So:

- **What you have**: every instruction of the shipping game, in order, with its constants,
  branches, memory offsets and calls intact — genuinely editable source.
- **What you do not have**: the original C# text, and a mapping from `aVi` to
  `Gamemanager.wrapRound`. Those are not recoverable from this export; anything claiming
  otherwise is guessing.

The practical way to find the function behind a behaviour: run the game with devtools open
(`dynCall_*` in the module's export list is the call gateway), break on the behaviour, and
read the mangled function name off the stack. Then search `functions.tsv` for that name and
edit it here. `il2cpp/classes.md` tells you which class and method exist, so you know what to
look for.

## What was verified

- **Same program, not a reimplementation.** The formatted source is compared token by token
  against the decompressed shipped payload: 17,977,346 tokens, identical stream and identical
  SHA-256 digest (`--check`). Formatting is whitespace only.
- **It parses.** `node --check` accepts the whole file.
- **It runs.** The rebuilt document was booted in headless Chrome next to the shipped one:
  both reach `__boredSnapshot().loaded === true`, hide the cover, paint a 960×540 canvas and
  show the identical title screen (see the two captures below), with no page or console
  errors on either.

| shipped build | rebuilt from this source |
| --- | --- |
| `boot-shipped.png` | `boot-rebuilt.png` |

The only differences between the two captures are the animating clouds.

## Not covered

- Art, audio, scenes and serialized component values live in `data.unityweb` (a UnityFS
  bundle), not in this code. Asset edits need UnityPy or the Unity editor, not this folder.
- `src/games/content/rooftop-snipers.html` is unchanged by this work; this folder and the
  repacker are additive.
