/**
    * @file wallslide.js, wall sliding.
    *
    * The level is an empty vertical shaft. Falling down the middle reaches
    * 'maxFallSpeed'; pushing towards a wall limits the fall speed to
    * 'wallSlideSpeed'.
    *
    * Wall sliding caps the velocity component along gravity and applies no
    * force. It is active only while the input pushes towards the touched wall.
    *
    * Wall jumps are disabled in this example to show wall sliding on its own.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '###############',
    '#.............#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#.............#',
    '###############',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);

/**
    * Tuning overrides that enable this example's abilities. All abilities are
    * disabled in the default tuning.
    *
    * @type {object}
*/
const ABILITIES = {
    wallSlideSpeed: 90,
};

const player = engine.spawn(7 * TILE_SIZE, 2 * TILE_SIZE, 20, 28, ABILITIES);

const keys = { left: 0, right: 0, up: 0, down: 0, jump: false, jumpPressed: false,
    dash: false, dashPressed: false };

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
    if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        keys.up = 1;
    }
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        keys.down = 1;
    }
    if (event.code === 'Space') {
        if (!keys.jump) {
            keys.jumpPressed = true;
        }
        keys.jump = true;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyX') {
        if (!keys.dash) {
            keys.dashPressed = true;
        }
        keys.dash = true;
    }
    if (event.code === 'KeyR' && !event.repeat) {
        player.body.place(7 * TILE_SIZE, 2 * TILE_SIZE);
        player.body.velocityX = 0;
        player.body.velocityY = 0;
        fastest = 0;
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
    if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        keys.up = 0;
    }
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        keys.down = 0;
    }
    if (event.code === 'Space') {
        keys.jump = false;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyX') {
        keys.dash = false;
    }
});

addEventListener('blur', () => {
    Object.assign(keys, { left: 0, right: 0, up: 0, down: 0, jump: false,
        jumpPressed: false, dash: false, dashPressed: false });
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
    * @type {number} highest fall speed in the current attempt.
*/
let fastest = 0;

let previous = performance.now();

/**
    * @param {number} now frame timestamp.
*/
function frame(now) {
    const input = player.input;
    input.left = keys.left;
    input.right = keys.right;
    input.up = keys.up;
    input.down = keys.down;
    input.jump = keys.jump;
    input.dash = keys.dash;
    if (keys.jumpPressed) {
        input.jumpPressed = true;
    }
    if (keys.dashPressed) {
        input.dashPressed = true;
    }
    keys.jumpPressed = false;
    keys.dashPressed = false;

    engine.advance((now - previous) / 1000);
    previous = now;

    if (!player.body.grounded) {
        fastest = Math.max(fastest, player.body.velocityY);
    }

    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the level and the character, with a marker for its current state.
*/
function draw() {
    const body = player.body;
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

    const drawX = body.renderX(alpha);
    const drawY = body.renderY(alpha);
    context.fillStyle = body.grounded ? '#0d6efd' : '#fff';
    context.strokeStyle = '#0d6efd';
    context.lineWidth = player.dashing > 0 ? 3 : 1.5;
    context.fillRect(drawX, drawY, body.width, body.height);
    context.strokeRect(drawX + 0.75, drawY + 0.75, body.width - 1.5, body.height - 1.5);

    /* Facing notch, from 'body.facing'. */
    context.fillStyle = '#0d6efd';
    context.fillRect(drawX + (body.facing > 0 ? body.width - 4 : 0), drawY + 6, 4, 5);
}

/**
    * Writes the remaining abilities and the current state to the readout.
*/
function report() {
    readout.innerHTML = [
        ['falling', player.body.velocityY.toFixed(0).padStart(5) + ' px/s'
            + (player.sliding ? '   holding on' : '')],
        ['fastest', fastest.toFixed(0).padStart(5) + ' px/s this drop   (R to go back up)'],
        ['capped at', String(ABILITIES.wallSlideSpeed).padStart(5) + ' px/s'],
    ].map(line =>
        '<div><span class="name">' + line[0] + '</span>'
        + '<span class="value">' + line[1] + '</span></div>').join('');
}

requestAnimationFrame(frame);
