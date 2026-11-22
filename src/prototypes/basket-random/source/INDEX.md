# Basket Random — recovered source index

Generated from the original Construct 3 project. The JSON is the authoritative
editable source; the event listings below preserve opcode IDs and serialized
expression trees. Numeric opcode IDs are **not** invented event names.

## Event sheets

| Sheet | Events | Top-level entries |
| --- | ---: | ---: |
| player1Event | 50 | 4 |
| player2Event | 51 | 4 |
| player3Event | 52 | 4 |
| player4Event | 51 | 4 |
| gameEvent | 126 | 28 |
| tailEvent | 13 | 1 |
| bonusEvent | 59 | 2 |
| pauseEvent | 6 | 3 |
| menuEvent | 20 | 2 |
| introEvent | 4 | 5 |
| gdEvent | 4 | 3 |

## Objects

| ID | Object | Instance variables | Behaviors |
| ---: | --- | --- | --- |
| 0 | landPhysics | var, adjust | Physics, Pin |
| 1 | body | which, first, angular, jump, moreJump | Physics, Timer |
| 2 | Keyboard | — | — |
| 3 | playerLine | which | Pin |
| 4 | head | which, first | Physics |
| 5 | headLine | which | Pin |
| 6 | Audio | — | — |
| 7 | heavyBall | which, tail, hold, handCollision, who, tin | — |
| 8 | groundCollision | — | — |
| 9 | ballLine | — | Pin |
| 10 | rightShoe | which | — |
| 11 | hair | which | — |
| 12 | rightShort | which | — |
| 13 | tshirt | which | — |
| 14 | ballShadow | — | — |
| 15 | playerShadow | which | — |
| 16 | pause | snow | Anchor, Tween, Timer |
| 17 | groundTile | — | — |
| 18 | groundLine | — | — |
| 19 | whiteLine | — | — |
| 20 | TPG | — | Anchor |
| 21 | scoreBG | which | Anchor |
| 22 | fontWonder | which | Anchor, Timer |
| 23 | fenceTile | — | — |
| 24 | grassTile | — | — |
| 25 | cloudTile | — | Sine |
| 26 | buildingTile | — | — |
| 27 | DrawingCanvas | — | Tween |
| 28 | Array | — | — |
| 29 | head3 | which, first | Physics |
| 30 | body3 | which, first, angular, jump, moreJump | Physics, Timer |
| 31 | Mouse | — | — |
| 32 | p3Collision | — | Pin |
| 33 | p1Collision | — | Pin |
| 34 | head2 | which, first | Physics |
| 35 | body2 | which, first, angular, jump, moreJump | Physics, Timer |
| 36 | p2Collision | — | Pin |
| 37 | head4 | which, first | Physics |
| 38 | body4 | which, first, angular, jump, moreJump | Physics, Timer |
| 39 | p4Collision | — | Pin |
| 40 | starTile | night | — |
| 41 | normalBall | which, tail, hold, handCollision, who | Pin, Tween |
| 42 | kamesBall | which, tail, hold, handCollision, who | — |
| 43 | snowParticle | — | Anchor |
| 44 | Touch | — | — |
| 45 | buttonRight | — | — |
| 46 | buttonLeft | — | — |
| 47 | tutorial | which | Anchor |
| 48 | pauseButtons | which | Tween |
| 49 | Browser | — | — |
| 50 | fadeOut | — | Fade |
| 51 | titleBG | — | Anchor, Fade |
| 52 | title | — | Tween |
| 53 | startButton | which, cpu, hover | Tween |
| 54 | moreButton | hover | Tween |
| 55 | startButton2 | which, cpu, hover | Tween |
| 56 | hitfx | — | Tween |
| 57 | basketText | — | Tween, Sine |
| 58 | game_bg | — | — |
| 59 | introtwporg | — | — |
| 60 | play_intro_btn | — | Sine |
| 61 | groundTileSnow | — | — |
| 62 | buildingTile2 | — | — |
| 63 | buildingTile3 | — | — |
| 64 | smallBall | which, tail, hold, handCollision, who | — |
| 65 | titleChars | startX | Sine |
| 66 | groundTilePlaj | — | — |
| 67 | seaTile | — | — |
| 68 | mountain | — | — |
| 69 | seaWhite | — | Sine |
| 70 | arm | have, ready | Tween |
| 71 | potaP | var, adjust, which | Physics, Pin |
| 72 | handCollision | — | — |
| 73 | potaP2 | var, adjust, which, cpu | Physics, Pin |
| 74 | potaSprite | which | — |
| 75 | potaTiled | — | — |
| 76 | scoreCollision | which | — |
| 77 | arm2 | have, ready | Tween |
| 78 | arm3 | have, ready | Tween |
| 79 | arm4 | have, ready | Tween |
| 80 | handCollision2 | — | — |
| 81 | handCollision3 | — | — |
| 82 | handCollision4 | — | — |
| 83 | potaCollision | which | — |
| 84 | potaBack | which | Pin |
| 85 | potaShadow | — | — |
| 86 | potaFile | which | Sine, Pin, Timer |
| 87 | ballCol | — | Pin |
| 88 | grassLineTile | — | — |
| 89 | groundTileIndoor | — | — |
| 90 | indoorBGTile | — | — |
| 91 | indoorBGTile2 | — | — |
| 92 | font | — | Tween |
| 93 | indoorBGTile3 | — | — |
| 94 | landPhysics2 | — | Physics, Pin |
| 95 | armBiz | have, ready | Pin |
| 96 | indoorTitle | — | — |
| 97 | snowTile | — | — |
| 98 | shark | which | Bullet, Wrap |
| 99 | GameDistributionSDK | — | — |
| 100 | player | which, first | — |
| 101 | skin | which | Pin |
| 102 | tiles | — | — |
| 103 | line | which | — |
| 104 | balls | which, tail, hold, handCollision, who | Physics, Timer |
| 105 | startButtons | which, cpu | — |
| 106 | groundPortrait | — | — |
| 107 | cpu | — | — |

## Layouts

| Layout | Width | Height | Event sheet | Layers |
| --- | ---: | ---: | --- | ---: |
| game | 290 | 190 | gameEvent | 5 |
| rip | 290 | 190 | null | 1 |
| intro | 290 | 190 | introEvent | 2 |

## Important encoding boundaries

- Event sheets are stored as arrays, not Construct editor event blocks.
- Conditions and actions use their original numeric engine opcode IDs.
- Expression parameters retain their original token-array encoding.
- The shipped Construct runtime, Box2D WebAssembly, sprites, and audio
  remain in the vendored folder and are copied into rebuilt packages.
- The generated .txt event listings are navigation aids. Edit the .json files
  and rebuild; editing a .txt listing has no effect.

