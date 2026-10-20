# Triqui

Triqui is a platformer character engine written in a single JavaScript file.
It moves rectangles through a tile level and decides how characters run, jump,
fall, ride platforms, get pushed, get shot and get crushed. It does not draw
anything. You give it the elapsed time, read back where everything is, and draw
it with the renderer you already use, such as Canvas, the DOM, Pixi or Phaser.

Collision geometry is handled by [raycast2d](https://github.com/triqui/raycast2d),
which is included as `src/raycast.js`. Triqui has no other dependencies and does
not need a build step.

```js
import { TriquiWorld, TriquiEngine } from './triqui.js';

const world = new TriquiWorld({ map, tileSize: 32 });
const engine = new TriquiEngine(world);
const player = engine.spawn(40, 420, 20, 28);

function frame(now) {
    player.input.left = keys.left;
    player.input.right = keys.right;
    player.input.jump = keys.jump;
    player.input.jumpPressed = keys.jumpPressed;

    engine.advance(elapsedSeconds);

    const { body } = player;
    sprite.x = body.renderX(engine.alpha);
    sprite.y = body.renderY(engine.alpha);
}
```

## Demo

Live demo: https://triqui.github.io/triqui-engine/

Every example can be played in the browser; the links are in the table below.

## Features

### World and physics

- Tile levels, with definitions for each kind of tile and data for each cell
- A fixed step (120 Hz by default) with interpolation, so drawing is smooth at any refresh rate
- Collision by ray casting, with the two axes resolved separately and no tunnelling
- Gravity as a vector, set per character, so standing, running, jumping and all events turn with it
- Optional collision between characters

### Movement

Every value can be set per character and changed while the game is running.

- Running, with separate acceleration and friction on the ground and in the air
- Variable jump height, coyote time and jump buffer
- Air jumps, wall slide, wall jump and dash in eight directions, all disabled by default
- Impulses, for springs, knockback and charged jumps

### Moving geometry

- Platforms that follow a route, carry their riders and push whoever they meet
- One way platforms, with the option to drop through them
- Crushing, which only happens when a push has nowhere left to put somebody
- A character walking behind a moving surface keeps its pace instead of stuttering

### Events and queries

- Contacts that report the face, the tile, the cell, the normal and the impact speed
- Events for each frame: landed, left the ground, hit a ceiling or a wall, crushed
- Sensors that report entering and leaving, for coins, water, doors and spikes
- Hurtboxes smaller than the body, so hazards and shots can forgive a near miss
- Projectiles that check their whole path each step and let you decide, contact by
  contact, whether they stop or pass through

### Integration

- A registry of everything that has a position, each with an `id`, a `kind` and your own `data`
- `controller.state`, a single word that can be used to pick an animation
- A `think` hook called once per physics step, for enemies and other characters
  without a keyboard
- `remove` and `add` for pooling characters
- Full types from JSDoc, for TypeScript projects with `allowJs` and `strict`

### Left out by design

Triqui does not draw, read input, run its own loop, manage a camera or handle
slopes. Every surface is axis aligned, so a ramp has to be built as a staircase
of tiles. The header of `src/triqui.js` explains why.

## Using it

Copy the two source files into your project, side by side:

    src/triqui.js
    src/raycast.js

Then import from `triqui.js`, which loads `raycast.js` from its own folder.

## Examples

Each example links to the playable page and to its source. To run them
locally, serve the folder with any static server, because ES modules do not
load from `file://`, then open `index.html` or any page in `examples/`.

```
npx http-server .
```

| Example | What it shows | Code |
|---|---|---|
| [minimal](https://triqui.github.io/triqui-engine/examples/minimal.html) | The smallest working setup. Press R to see the collider's rays | [source](examples/minimal.js) |
| [tuning](https://triqui.github.io/triqui-engine/examples/tuning.html) | Fourteen sliders and five preset characters, in a room marked like a ruler | [source](examples/tuning.js) |
| [shoot](https://triqui.github.io/triqui-engine/examples/shoot.html) | Four kinds of projectile built on the same shot | [source](examples/shoot.js) |
| [glide](https://triqui.github.io/triqui-engine/examples/glide.html) | Two ways of falling slowly, and where each one lands | [source](examples/glide.js) |
| [hurtbox](https://triqui.github.io/triqui-engine/examples/hurtbox.html) | A visible hurtbox, with a count of near misses | [source](examples/hurtbox.js) |
| [pool](https://triqui.github.io/triqui-engine/examples/pool.html) | Six characters reused over and over | [source](examples/pool.js) |
| [feel](https://triqui.github.io/triqui-engine/examples/feel.html) | The same level with and without coyote time and jump buffer | [source](examples/feel.js) |
| [chase](https://triqui.github.io/triqui-engine/examples/chase.html) | Enemies that look for you using line of sight | [source](examples/chase.js) |
| [patrol](https://triqui.github.io/triqui-engine/examples/patrol.html) | Four enemy behaviours, one of which never walks off a ledge | [source](examples/patrol.js) |
| [dom](https://triqui.github.io/triqui-engine/examples/dom.html) | Rendering with `div` elements instead of a canvas | [source](examples/dom.js) |
| [contacts](https://triqui.github.io/triqui-engine/examples/contacts.html) | Glass tiles that break on a hard landing | [source](examples/contacts.js) |
| [platforms](https://triqui.github.io/triqui-engine/examples/platforms.html) | A tram, a lift and a shuttle | [source](examples/platforms.js) |
| [one way](https://triqui.github.io/triqui-engine/examples/oneway.html) | A tower of platforms you can only land on from above | [source](examples/oneway.js) |
| [drop through](https://triqui.github.io/triqui-engine/examples/dropthrough.html) | The same tower, climbed downwards | [source](examples/dropthrough.js) |
| [crush](https://triqui.github.io/triqui-engine/examples/crush.html) | A press and a piston that push you, and crush you only when you are cornered | [source](examples/crush.js) |
| [pickups](https://triqui.github.io/triqui-engine/examples/pickups.html) | Coins and water, both made with sensors | [source](examples/pickups.js) |
| [gravity](https://triqui.github.io/triqui-engine/examples/gravity.html) | Gravity rotated by a quarter turn at a time | [source](examples/gravity.js) |
| [wall slide](https://triqui.github.io/triqui-engine/examples/wallslide.html) | Sliding down a wall to slow the fall | [source](examples/wallslide.js) |
| [wall jump](https://triqui.github.io/triqui-engine/examples/walljump.html) | Climbing a shaft with nothing to stand on | [source](examples/walljump.js) |
| [air jumps](https://triqui.github.io/triqui-engine/examples/airjump.html) | Double and triple jumps | [source](examples/airjump.js) |
| [dash](https://triqui.github.io/triqui-engine/examples/dash.html) | Two kinds of dash and a course that needs both | [source](examples/dash.js) |
| [impulse](https://triqui.github.io/triqui-engine/examples/impulse.html) | Charged jumps and springs | [source](examples/impulse.js) |
| [wrap](https://triqui.github.io/triqui-engine/examples/wrap.html) | A room without a floor, where falling brings you back in from the top | [source](examples/wrap.js) |

## Using it from TypeScript

```json
{ "compilerOptions": { "allowJs": true, "strict": true, "moduleResolution": "bundler" } }
```

All types come from the JSDoc, including the tuning, the contacts and the
callbacks:

```ts
import { TriquiEngine, type TriquiController, type TriquiContact } from './triqui.js';

player.tuning.runSpeed = 200;
player.body.onCollision = (contact: TriquiContact) => {
    console.log(contact.face);
};
```

Leave `checkJs` off for `triqui.js` itself.

## Development

```
npm install
npm run check
npm run levels
```

`npm run check` verifies that `raycast.js` is unchanged, checks the links
between examples, runs the tests, runs every example headless and compiles the
TypeScript consumer. `npm run levels` plays every level that is meant to be
climbable and confirms that each ledge can be reached. It takes about forty
seconds.

[AGENTS.md](AGENTS.md) contains the rules for working on the project and the
reasons behind them: what belongs in the engine and what belongs in a game, why
`raycast.js` is never edited, and the order in which a physics step runs.
[examples/AGENTS.md](examples/AGENTS.md) contains the conventions for examples.
Both files are written for coding agents, but they are meant to be read by
people as well.

## Licence

MIT. See [LICENSE](LICENSE).
