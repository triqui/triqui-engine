/**
    * @file platforms.js, floors that go somewhere.
    *
    * Three of them: a tram across the bottom, a lift up the right hand side, and
    * a short shuttle in the middle that the lift delivers you to. Stand on one
    * and it takes you with it.
    *
    * The carrying is not the platform's doing. The engine moves each platform, then
    * moves whoever was standing on it by the same amount, through the collider,
    * which is why being carried into a wall stops you at the wall rather than
    * posting you into it.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.............#####.....#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#..####.................#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(3 * TILE_SIZE, 12 * TILE_SIZE - 28, 20, 28);

/* The tram runs the length of the floor and back. */
engine.addPlatform(6 * TILE_SIZE, 13 * TILE_SIZE, 96, 12, {
    points: [{ x: 19 * TILE_SIZE, y: 13 * TILE_SIZE }],
    speed: 70,
});

/* The lift climbs the right hand side until its deck is level with the high
   ledge, a short hop to the left. Stopping it under the ledge instead would
   deliver you head first into the underside of it. */
engine.addPlatform(20 * TILE_SIZE, 13 * TILE_SIZE, 80, 12, {
    points: [{ x: 20 * TILE_SIZE, y: 4 * TILE_SIZE }],
    speed: 60,
});

/* The shuttle carries you back in over the gap, on a three cornered route. */
engine.addPlatform(15 * TILE_SIZE, 6 * TILE_SIZE, 80, 12, {
    points: [
        { x: 8 * TILE_SIZE, y: 6 * TILE_SIZE },
        { x: 8 * TILE_SIZE, y: 10 * TILE_SIZE },
    ],
    speed: 80,
    loop: 'cycle',
});

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

let previous = performance.now();

/**
    * @param {number} now when this frame began.
*/
function frame(now) {
    const input = player.input;
    input.left = keys.left;
    input.right = keys.right;
    input.jump = keys.jump;
    if (keys.jumpPressed) {
        input.jumpPressed = true;
    }
    keys.jumpPressed = false;

    engine.advance((now - previous) / 1000);
    previous = now;

    draw();
    const riding = player.body.riding;
    readout.innerHTML = '<div><span class="name">riding</span><span class="value">'
        + (riding
            ? 'a platform, moving ' + riding.deltaX.toFixed(2) + ', ' + riding.deltaY.toFixed(2)
              + ' per step'
            : 'nothing')
        + '</span></div>';
    requestAnimationFrame(frame);
}

/**
    * Draws the level, the platforms and the character, all at the same moment
    * between two physics steps.
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

    /* Platforms interpolate exactly like bodies, with the same two positions and alpha. */
    context.fillStyle = '#777';
    for (const platform of engine.platforms) {
        context.fillRect(platform.renderX(alpha), platform.renderY(alpha),
                         platform.width, platform.height);
    }

    const body = player.body;
    context.fillStyle = body.grounded ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    context.fillRect(body.renderX(alpha), body.renderY(alpha), body.width, body.height);
    context.strokeRect(body.renderX(alpha) + 0.75, body.renderY(alpha) + 0.75,
                       body.width - 1.5, body.height - 1.5);
}

requestAnimationFrame(frame);
