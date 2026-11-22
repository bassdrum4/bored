# Basket Random — decompiled, editable Construct 3 source

This is the original Basket Random **Construct 3 export**, separated into the pieces
that describe its gameplay and repackaged so they can be edited and rebuilt.
It follows the approach used in the Rooftop Snipers prototype: original export as
the authority, inspectable source, a full extraction/rebuild script, and a
round-trip integrity check.

Unlike Rooftop Snipers (Unity IL2CPP/asm.js), Basket Random keeps its game-specific
behavior as **serialized Construct 3 event sheets and layouts** in data.json.
This lets us recover the original event trees directly rather than guess at
the physics or rewrite the game from a screenshot.

## What's here

| File | Description |
| --- | --- |
| source/project.json | Original project settings and ordering for all 39 project slots |
| source/objects.json | All 108 original objects, behaviors, instance variables, animation/frame references |
| source/families.json | Object families and their member object IDs |
| source/layouts.json | All 3 layouts, their layers and placed instances |
| source/event-sheets/*.json | **All 11 actual gameplay event sheets**, including conditions, actions, nested branches, groups, and functions |
| source/event-listings/*.txt | Object-named, nested, searchable IF/DO indexes of the same event sheets |
| source/audio.json | Original audio declarations |
| source/runtime/main.js | Original executable Construct runtime loader / DOM handler logic |
| source/runtime/c3runtime.js | Original executable Construct 3 JavaScript runtime |
| source/INDEX.md | Object ID index, variable names, behaviors, layout summary and event sheet index |
| decompile.mjs | Extract, verify exact data, and rebuild a playable copy |

The files in source/ are not a replacement HTML game. They are the real original
export's data and scripts, in editable form. Box2D WebAssembly, images and audio
remain in the vendored game at ../../games/content/basket-random/ and are copied
automatically when rebuilding.

## Recover the shipped source again

From the repository root:

    node src/prototypes/basket-random/decompile.mjs --check

This compares the recovered game against the shipped Construct export, including
all event trees, objects, layouts, and both JavaScript runtime files. The original
project data is reconstructed without removing any fields. **Check is supposed
to fail after you intentionally edit the recovered source.**

To discard edits and re-extract from the live version:

    node src/prototypes/basket-random/decompile.mjs --extract

## Edit and play

1. Edit the real logic in source/event-sheets/*.json, or properties in
   source/objects.json or source/layouts.json. The human-readable .txt listings
   are for navigation only; editing those does not change the game.
2. Rebuild a complete game folder:

       node src/prototypes/basket-random/decompile.mjs --rebuild _build/basket-random

3. Run a static server from the repository root:

       npm run dev

   Open /_build/basket-random/index.html, or serve the _build folder with a
   separate static server. The rebuilt folder includes the original art,
   sound, Box2D engine and loaders, so it should function independently.

To install an intentional edited build in the published game itself, explicitly
use the vendor directory as the rebuild target:

    node src/prototypes/basket-random/decompile.mjs --rebuild src/games/content/basket-random

That last command **changes** Bored's published game. It is not run by this
recovery. This prototype is additive, and the live Basket Random game,
its Bored wrapper, and its catalog entry are untouched.

## What decompilation can and cannot recover

- Recovered without reimplementation: complete original Construct project
  arrays, layouts, event sheets, per-object behavior configuration, art/audio
  references and runtime scripts.
- Object names and instance variable names survive. The event index resolves
  numeric object IDs to their recovered names.
- Construct's exported conditions/actions use **numeric opcode IDs** and
  its compiled expression format. Their original editor labels, friendly
  event-block layout, and the original .c3p project file are **not** in the
  export. The source is still editable and round-trippable, but the JSON is not
  directly importable into the Construct 3 editor.
- Physics is the original Box2D WebAssembly, not a hand-written simulation.
  Changing the physics engine itself requires modifying the wasm payload,
  which this decompiler deliberately does not claim to reverse-engineer.
- The full generic runtime is preserved, not falsely presented as handwritten
  Basket Random game code.

No mechanics were intentionally changed during extraction. The published game uses the cleaned-up game and menu data described below.

## Bored menu cleanup (November 2026)

This recovery now tracks the intentionally modified Bored export. The wrapper starts
loading the game immediately, and the Construct project starts in the `game`
layout (its own main menu) instead of the interactive `intro` layout. The
`moreButton` and `TPG` branded-logo instances are removed from the main menu;
corresponding click/hover and external-browser actions are removed from the
original event sheets, including the pause screen. The objects and the unused
intro layout remain present in the recovered object catalog for historical
reference. The gameplay physics, match scoring, controls and randomization are
unchanged. The source, rebuild target, and tests are updated together.
