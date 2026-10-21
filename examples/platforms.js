/**
    * @file platforms.js, moving platforms.
    *
    * The level has three platforms: a tram along the bottom, a lift on the
    * right, and a shuttle in the middle reached from the lift. A character
    * standing on a platform is carried with it.
    *
    * Each step the engine moves the platforms, then moves their riders by the
    * same displacement through the collider. A rider carried into a wall stops
    * at the wall.
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

/* Tram: back and forth along the floor. */
engine.addPlatform(6 * TILE_SIZE, 13 * TILE_SIZE, 96, 12, {
    points: [{ x: 19 * TILE_SIZE, y: 13 * TILE_SIZE }],
    speed: 70,
});

/* Lift: rises on the right until its top is level with the high ledge. If it
   stopped under the ledge, a rider would be carried into it. */
engine.addPlatform(20 * TILE_SIZE, 13 * TILE_SIZE, 80, 12, {
    points: [{ x: 20 * TILE_SIZE, y: 4 * TILE_SIZE }],
    speed: 60,
});

/* Shuttle: a three point route over the gap. */
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
    * Prevents the default action of a key handled by this page, unless a modifier
    * is held.
    *
    * Only arrows and the space bar are blocked, because they scroll the page.
    * Blocking every key would also disable browser shortcuts such as F12 and
    * Ctrl+Shift+I.
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
    * @param {number} now frame timestamp.
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
    * Draws the level, the platforms and the character, all interpolated with
    * the same alpha.
*/
function draw() {
    const alpha = engine.alpha;

    context.fillStyle = '#fff';
    context.fillRect(0, 0, viewWidth, viewHeight);

    context.fillStyle = '#dee2e6';
    context.strokeStyle = '#6c757d';
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

    /* Platforms are interpolated like bodies. */
    context.fillStyle = '#495057';
    for (const platform of engine.platforms) {
        context.fillRect(platform.renderX(alpha), platform.renderY(alpha),
                         platform.width, platform.height);
    }

    const body = player.body;
    context.fillStyle = body.grounded ? '#0d6efd' : '#fff';
    context.strokeStyle = '#0d6efd';
    context.lineWidth = 1.5;
    context.fillRect(body.renderX(alpha), body.renderY(alpha), body.width, body.height);
    context.strokeRect(body.renderX(alpha) + 0.75, body.renderY(alpha) + 0.75,
                       body.width - 1.5, body.height - 1.5);
}

requestAnimationFrame(frame);
