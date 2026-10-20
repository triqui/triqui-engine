# Working on Triqui

Instructions for coding agents, and for people working the way agents do. Read
this before changing anything. `examples/AGENTS.md` adds the rules for examples.

## What this is

Triqui is a platformer character engine in one file, `src/triqui.js`. It moves
rectangles through a tile level and decides how characters run, jump, fall,
ride, get pushed, get shot and get crushed. It does not draw, read input, run
its own loop or know which game it is part of. Geometry questions, such as what
a ray meets, are answered by `src/raycast.js`, a separate library.

The code is plain JavaScript modules, with no build step and no runtime
dependencies. It is used from Canvas, the DOM, Pixi and Phaser, and from
TypeScript projects with `allowJs` and `strict`, which get their types from the
JSDoc.

The library is distributed by copying `src/triqui.js` and `src/raycast.js` into
a project, side by side. Both must stay self-contained: `triqui.js` imports
only `./raycast.js`, and `raycast.js` imports nothing.

```
src/triqui.js    the engine. Imports ./raycast.js and nothing else
src/raycast.js   raycast2d 1.0.0, copied verbatim. NEVER EDIT
game.js          the demo behind index.html, two players sharing the keyboard
index.html
examples/        one idea per page; see examples/AGENTS.md
tests/           node:test, one file per area
tools/           smoke runner, level checker, link generator, raycast guard
types/           strict TypeScript consumer that must compile
```

## Before you finish, every time

```
npm install      once, for TypeScript
npm run check
```

`check` runs, in order: the raycast.js checksum, the example links, the tests,
every example headless for 400 frames, and the TypeScript consumer. All five
must pass. Do not report work as done on a partial run.

`npm run levels` is kept out of `check` because it takes about forty seconds:
it plays every climbable level by brute force. Run it whenever you touch a
level, the jump, the run, gravity, or the collider.

## Hard rules

1. **`src/raycast.js` is never edited.** This includes bug fixes, new options
   and reformatting. Everything Triqui needs is reached through its public API:
   `Raycaster`, `TileGrid`, `ShapeSet`, `RayHit`, `Filters`, cast options such
   as `target` and `filter`, and `userData`. If something truly cannot be done
   that way, stop and say so. The only legitimate change is replacing the whole
   file with a newer upstream release of `src/raycast.js` from
   `triqui/raycast2d`, together with the new checksum in
   `tools/raycast-intact.mjs`, in the same commit.

2. **The engine is renderer agnostic.** `triqui.js` must never touch `document`,
   `window`, a canvas, `requestAnimationFrame`, `performance`, timers or the
   keyboard. It never starts its own loop: the host calls `engine.advance(seconds)`.
   The camera belongs to the renderer, so the engine has none.

3. **No slopes.** Every surface is axis aligned. This is a decision, written in
   the header of `triqui.js`: two-axis resolution, contacts named by face and
   turnable gravity all depend on it. Do not add sloped tiles, normals that are
   not axis aligned, or "snap to ground". Ramps are staircases of tiles.

4. **Engine or game?** If you would write it identically in the next game, it
   belongs in `triqui.js`. If it changes from game to game, it belongs in the
   game. Springs, conveyors, gliding, invulnerability after a hit, scoring,
   respawn rules and enemy behaviour are game code: the engine already exposes
   what they need (contacts, `impulse`, live tuning, sensors, `think`). Before
   adding to the engine, try writing it as an example; add to the engine only
   what that attempt shows is missing.

5. **Abilities are off by default.** Air jumps, wall slide, wall jump and dash
   are zero in `DEFAULT_TUNING`. Anything new of that kind is too. Existing
   characters must behave exactly as before.

6. **Everything is in English**: code, comments, JSDoc, page text, commit
   messages.

## How the engine is put together

One fixed step (default 1/120 s). `advance` clears the frame's events, then
for each whole step:

1. every body remembers its previous position and contacts (`beginStep`)
2. each controller: `think`, then `update` (input → velocity → collider)
3. platforms move, carry their riders, shove anybody they moved into
4. every body turns contacts into events (`endStep`), crush check
5. projectiles fly
6. sensors are read

Things that follow from that order and have bitten before:

- **Events are per frame, state is per step.** `justLanded`, `justHitWall`,
  `contacts`, `justEntered`... are cleared at the top of `advance` and
  accumulate across the frame's steps. `think` runs inside steps, so it must
  read state (`grounded`, `touching`, `fallSpeed`, `state`) or keep its own
  memory, never the `just*` flags.
- **Callbacks fire mid-step.** `onCollision`, `onSensor`, `onCrushed`,
  `onContact`, `onEnd` run while the engine iterates its lists. They may change
  the body they were given (velocity, `impulse`, tuning), but must not `remove`,
  `add`, `spawn` or `fire`. Collect, then act after `advance` returns. See
  `examples/pool.js`.
- **A contact's velocity is settled before the callback runs**, so a callback
  can change it (that is how springs work). How hard the hit was is
  `contact.speed`, not the body's velocity.
- **Teleport with `body.place(x, y)`**, never by assigning `x`/`y`, or the body
  is interpolated across the jump for a frame.
- **Characters act before platforms move.** Reversing that leaves a boarding
  passenger embedded in the deck. Keep the order.
- **A body spawned inside solid tiles stays stuck.** The collider stops, it does
  not extract. Spawn in free space.

## Conventions in `triqui.js`

**JSDoc on everything public, directly above it.** TypeScript users get every
type from these comments, so a comment that drifts away from its member, or is
left stacked on top of another, silently turns the member into `any`. When you
move code, move its comment with it.

The comment style is the file's own: `/**`, lines indented four spaces with
`*`, closing `*/` at the opener's column. Write plain technical English in the
present tense: state what a member does, its units and its constraints, and
explain the reason when it is not obvious. Avoid figurative language, dashes
used as punctuation and sentence fragments.

**Types must hold under `strict`.** Never annotate public API as `{object}` or
`{Function}`. Use the typedefs (`TriquiTuning`, `TriquiContact`,
`TriquiShotContact`) or write the shape out:
`@type {((contact: TriquiContact) => void) | null}`. `data` is the one
deliberate `any`, like Box2D's `userData`.

When you add public surface that is easy to misspell or misuse, add a line for
it under the `@ts-expect-error` section of `types/consumer.ts`. If the types
ever loosen, that directive goes unused and `npm run types` fails.

**Naming.** `UPPER_CASE` for fixed module-level constants (`DEFAULT_TUNING`,
`DEFAULT_STEP`, `TILE_SIZE`, `LEGEND`); `camelCase` for variables and anything
computed at runtime; `PascalCase` with the `Triqui` prefix for exported
classes. The same holds in examples.

**Initialise every field in the constructor.** A field that is documented and
read but only assigned later is `undefined` until then. `body.facing` once was,
and a dash pressed before any steering produced `NaN`.

Keep lines under 100 characters, except the boxed section separators. This
holds in every file in the repository.

## Recipes

**Adding a tuning value.** Add it to `DEFAULT_TUNING` with its comment, and to
the `TriquiTuning` typedef as well, because a test checks that the two match. If
it is a count that touching the ground or a wall restores, reset it both in
`TriquiController.reset()` and in the constructor. Read it in `update`, add a
test, and consider adding a slider to `examples/tuning.js`.

**Adding a new kind of object.** Subclass `TriquiRectangle`, give it a list on
the engine with `addSomething`/`removeSomething` methods that call `register` and
`forget`, so it appears in `engine.actors` with a `kind`, an `id` and `data`.

**Pooling characters.** Call `remove(controller)`, and later `add(controller)`.
`add` keeps the character (size, tuning, data, hurtbox, think, callbacks,
position, velocity) and clears the engine's record of its last life. Each
`add` hands out a new `id`.

## Tests

Tests live in `tests/*.test.js`. They use plain `node:test` and are built on
`tests/helpers.js`. Every
feature has at least one test that would fail if the feature broke. When you
fix a bug, add the test that would have caught it. Assert on behaviour you can
state in a sentence ("stops flush against the wall", "a fourth jump does
nothing"), not on incidental numbers, and give tolerances where the physics is
continuous.

## Levels

A level is a `LEGEND` of strings: `.` empty, `#` solid, `=` one way deck in
the tools. With the default tuning a jump clears about 2.4 tiles, so a ledge
reachable by jumping sits two rows up and one or two columns to the side. It
should never be straight overhead, because the character would hit its head.

`npm run reach -- path/to/file.js` plays one level by brute force and reports
any ledge that cannot be reached from the floor or left again
(`--tuning '{"jumpSpeed":640}'` to try other numbers). It models running and
jumping only, so levels built around an ability, a lift or a wrap fail it by
design. `npm run levels` runs it over every level that should pass.

## Things to leave alone unless asked

- The order of `MODES` in `examples/shoot.js`, `PRESETS` in `examples/tuning.js`
  and the examples list in `tools/nav.mjs`.
- `game.js` and `index.html`: they are the demo, not a test bed.
- Performance ceilings that are documented as such (the box overlap and the
  sensor loop are brute force on purpose).
