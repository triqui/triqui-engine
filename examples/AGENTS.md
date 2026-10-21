# Writing examples

Read `../AGENTS.md` first. This adds what is specific to `examples/`.

An example teaches **one idea**. It is a pair of files, `name.js` and
`name.html`, small enough to read top to bottom, and it is the documentation:
people copy from these. Examples never change `triqui.js`. If an example
cannot be written without changing the engine, report it: the engine change is
a separate piece of work with its own tests.

## The page, `name.html`

Copy the structure of an existing page rather than starting from scratch.
`platforms.html` is the plain case; `tuning.html` has a control panel.

Pages use Bootstrap 5.3.3 from jsDelivr plus `examples/examples.css`, which
holds the few shared rules Bootstrap does not cover (readout, canvas, tuning
panel, DOM stage). Do not add inline styles; use Bootstrap classes or add a
rule to `examples.css`.

- `<title>` reads `triqui - <what it shows>`, lower case. The `<h1 class="h4">`
  shows the same text in sentence case.
- A navbar with the `triqui` brand, linking to the demo, and the example
  selector.
- One `<p class="intro text-body-secondary">`: what to press and, in a sentence
  or two, what to notice. Keys go in `<kbd>`, engine names in `<code>`.
- A `card` holding `<div class="card-header bg-body readout" id="readout">` for
  live numbers and `<canvas id="view">` with width and height in the
  attributes. The script resizes the canvas to the level; the attributes only
  avoid a layout jump on load.
- `<script type="module" src="./name.js">`, last.
- `minimal` is the only dark page (`data-bs-theme="dark"` on `<html>`), and
  that is intentional.

**The example selector is generated.** Do not edit it by hand. Add the example
to the list in `tools/nav.mjs`, in the order a reader should meet it, and run
`npm run nav`. It writes the selector between the `<!-- examples -->` markers
on every page, including the demo. `npm run check` fails while any page is
out of date or any example is missing from the list.

## The script, `name.js`

**The header.** Start with a JSDoc block, `@file name.js, <the idea in a
phrase>.`, followed by prose that explains what is on screen, what to do, what
to notice and which engine feature makes it work. If the level is not meant to be climbed
by jumping, say so here.

**Imports.** Import only from `'../src/triqui.js'`, never from `raycast.js`
directly. If an example needs a ray, it uses `world.raycaster`, which is part of
the engine's public surface.

**Order of the file**, as the existing ones do it:

1. `TILE_SIZE`, `LEGEND`, `MAP`, other fixed constants in `UPPER_CASE`
2. world, engine, characters, platforms, sensors
3. game rules: callbacks, `think`, scoring
4. input
5. canvas setup, the loop, `draw`, `report`
6. `requestAnimationFrame(frame)`, last line

**The loop.** Copy keyboard state into `controller.input` at the top of the
frame, call `engine.advance(seconds)` once, then draw with
`body.renderX(engine.alpha)` / `renderY`. Never draw raw `x`/`y`: the fixed step
then shows as stutter. Clamp a frame's elapsed time if you use it for your own
timers (`Math.min(elapsed, 0.25)`), as the engine does internally.

**Button presses.** `jumpPressed` and `dashPressed` are set
on the keydown that changed the key, not on repeats; the engine spends them.
Clear the copies in `keys` after handing them over.

**Keyboard.** Every example has the same `mine(event)` helper and calls it at
the end of keydown. It swallows only arrows and space, and never with
Ctrl/Meta/Alt, so the page does not scroll and browser shortcuts such as
F12 and Ctrl+Shift+I still work. Never call `event.preventDefault()` on every key.
Add a `blur` listener that releases every key, or a key held while the window
loses focus sticks down.

**Changing the world from a callback.** Do not `remove`, `add`, `spawn` or
`fire` from inside `onCollision`, `onSensor`, `onContact` or `think`: mark what
should happen and do it after `advance` returns. `pool.js` shows the pattern.

**Moving things on purpose.** Use `body.place(x, y)` for respawns and wraps,
then set the velocity. Assigning `x`/`y` draws the body smeared across the jump.

**Show what the engine knows.** The readout is for numbers the reader cannot
see, such as speeds, timers, counts and the last contact. Draw the facing
notch from `body.facing`, and falling or standing from `body.grounded`. Draw
with the Bootstrap palette: tiles in gray-300 (`#dee2e6`) with gray-600
(`#6c757d`) edges, characters in primary (`#0d6efd`), hazards in danger
(`#dc3545`), pickups in warning (`#ffc107`), and the other theme colours only
where the idea needs an accent.

**`console.log` is for callbacks the reader is meant to replace**, with a
comment saying so. Do not leave debugging output behind.

## Levels

All rows must have the same width, and the level needs a wall all the way
round. The grid reports everything past its edges as empty, so a level without
an outer wall cannot hold anybody.

If a level is meant to be climbed with the **ordinary jump**, check it:

```
npm run reach -- examples/name.js
npm run reach -- examples/name.js --tuning '{"jumpSpeed":640}'
```

It must report every ledge reachable from the floor and leavable. The tool
only models running and jumping. It knows nothing about air jumps, dashes,
wall jumps, lifts, gliding, wrapping or rotated gravity, so most existing
examples fail it by design, and that is expected. The ones that pass are listed in
`tools/levels.mjs`, and `npm run levels` checks all of them (about forty
seconds). A level on that list must keep passing; a new climbable level goes
on it. For anything else, say in the header how the level is meant to be
crossed.

## Before you finish

```
npm run nav       if you added or renamed an example
npm run levels    if you touched a level, or the jump or run tuning
npm run check
```

and open the page in a browser if you can (`npx http-server .` or any static
server; ES modules do not load from `file://`). The smoke run proves an
example does not throw; only a browser shows whether it looks right and is fun
to play.
