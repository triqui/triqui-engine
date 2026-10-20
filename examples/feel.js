/**
    * @file feel.js, what coyote time and the jump buffer are actually worth.
    *
    * The page holds two copies of the same level side by side, with one character
    * in each. They answer to the same keys and differ in two numbers: the one on
    * the left has coyote time and jump buffer set to zero, the one on the right
    * keeps the defaults. Nothing else about them is different.
    *
    * Run off a ledge and press jump a frame late, or press it a frame before
    * landing, and the two part company. Which is the whole argument for the
    * feature: it changes nothing about the physics and everything about being
    * believed.
*/

import { TriquiWorld, TriquiEngine, DEFAULT_TUNING } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#...........#...........#',
    '#...........#...........#',
    '#...........#...........#',
    '#...........#...........#',
    '#...........#...........#',
    '#...........#...........#',
    '#...........#...........#',
    '#...##...####...##...####',
    '#...........#...........#',
    '###.........###.........#',
    '#...........#...........#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const HALF = 12 * TILE_SIZE;
const FLOOR = 12 * TILE_SIZE - 28;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);

/**
    * The two characters, and what tells them apart.
    *
    * @type {Array<{name: string, controller: object}>}
*/
const runners = [
    { name: 'raw', controller: engine.spawn(3 * TILE_SIZE, FLOOR, 20, 28,
        { coyoteTime: 0, jumpBuffer: 0 }) },
    { name: 'forgiving', controller: engine.spawn(3 * TILE_SIZE + HALF, FLOOR, 20, 28) },
];

const keys = { left: 0, right: 0, jump: false, jumpPressed: false };

/**
    * Swallows a key press, but only when it is one of ours and nothing is being
    * held with it.
    *
    * Arrows and the space bar scroll the page, so those are worth taking. Nothing
    * else is: calling preventDefault on every key takes F12, Ctrl+Shift+I and
    * every other browser shortcut with it, which is a miserable thing to do to
    * somebody trying to look at the console.
    *
    * @param {object} event the key event.
*/
function mine(event) {
    const ours = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
    if (!event.ctrlKey && !event.metaKey && !event.altKey && ours.includes(event.code)) {
        event.preventDefault();
    }
}

addEventListener('keydown', event => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        keys.left = 1;
    }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        keys.right = 1;
    }
    if (event.code === 'Space' || event.code === 'KeyW') {
        if (!keys.jump) {
            keys.jumpPressed = true;
        }
        keys.jump = true;
    }
    mine(event);
});

addEventListener('keyup', event => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        keys.left = 0;
    }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        keys.right = 0;
    }
    if (event.code === 'Space' || event.code === 'KeyW') {
        keys.jump = false;
    }
});

addEventListener('blur', () => {
    Object.assign(keys, { left: 0, right: 0, jump: false, jumpPressed: false });
});

const canvas = document.getElementById('view');
const context = canvas.getContext('2d');
const readout = document.getElementById('readout');
const viewWidth = world.columns * TILE_SIZE;
const viewHeight = world.rows * TILE_SIZE;
const ratio = Math.min(window.devicePixelRatio || 1, 2);

canvas.width = viewWidth * ratio;
canvas.height = viewHeight * ratio;
canvas.style.aspectRatio = viewWidth + ' / ' + viewHeight;
context.scale(ratio, ratio);

/**
    * @type {number[]} how many times each of them has fallen into the gap.
*/
const falls = runners.map(() => 0);

let previous = performance.now();

/**
    * One frame: the same keys to both, then draw them and the tally.
    *
    * @param {number} now when this frame began.
*/
function frame(now) {
    for (const runner of runners) {
        const input = runner.controller.input;
        input.left = keys.left;
        input.right = keys.right;
        input.jump = keys.jump;
        if (keys.jumpPressed) {
            input.jumpPressed = true;
        }
    }
    keys.jumpPressed = false;

    engine.advance((now - previous) / 1000);
    previous = now;

    runners.forEach((runner, index) => {
        /* Landing on the bottom row means the ledge was missed. */
        const body = runner.controller.body;
        if (body.justLanded && body.y + body.height === 12 * TILE_SIZE) {
            falls[index]++;
        }
    });

    draw();
    requestAnimationFrame(frame);
}

/**
    * Draws the level, the dividing wall and the two characters.
*/
function draw() {
    const alpha = engine.alpha;

    context.fillStyle = '#fff';
    context.fillRect(0, 0, viewWidth, viewHeight);

    context.fillStyle = '#bbb';
    context.strokeStyle = '#555';
    context.lineWidth = 1;
    for (let row = 0; row < world.rows; row++) {
        for (let col = 0; col < world.columns; col++) {
            if (world.tileAt(col, row) === 0) {
                continue;
            }
            context.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            context.strokeRect(col * TILE_SIZE + 0.5, row * TILE_SIZE + 0.5,
                               TILE_SIZE - 1, TILE_SIZE - 1);
        }
    }

    context.font = '11px ui-monospace, Menlo, Consolas, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';

    runners.forEach((runner, index) => {
        const body = runner.controller.body;
        const drawX = body.renderX(alpha);
        const drawY = body.renderY(alpha);

        context.fillStyle = body.grounded ? '#000' : '#fff';
        context.strokeStyle = '#000';
        context.lineWidth = 1.5;
        context.fillRect(drawX, drawY, body.width, body.height);
        context.strokeRect(drawX + 0.75, drawY + 0.75, body.width - 1.5, body.height - 1.5);

        context.fillStyle = '#000';
        context.fillText(runner.name, index * HALF + 6 * TILE_SIZE, TILE_SIZE + 8);
    });

    readout.innerHTML = runners.map((runner, index) => {
        const tuning = runner.controller.tuning;
        return '<div><span class="name">' + runner.name + '</span><span class="value">'
            + ('coyote ' + tuning.coyoteTime.toFixed(2) + 's').padEnd(16)
            + ('buffer ' + tuning.jumpBuffer.toFixed(2) + 's').padEnd(16)
            + 'missed ' + String(falls[index]).padStart(3)
            + '</span></div>';
    }).join('');
}

console.assert(DEFAULT_TUNING.coyoteTime > 0, 'the right hand one has something to show');
requestAnimationFrame(frame);
