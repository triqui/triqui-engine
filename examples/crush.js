/**
    * @file crush.js, pushing and crushing by moving platforms.
    *
    * A press moves up and down in the middle of the room and a piston moves
    * horizontally on the right.
    *
    * Contact alone is not fatal. A platform that moves into a character pushes it
    * in the direction of travel, by the overlap distance: hitting the press from
    * below pushes the character down, and walking into the piston pushes the
    * character ahead of it. A character is crushed only when the push cannot
    * clear it, under the press against the floor or between the piston and the
    * wall. 'onCrushed' reports it.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const SPAWN_X = 2 * TILE_SIZE;
const SPAWN_Y = 14 * TILE_SIZE - 28;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(SPAWN_X, SPAWN_Y, 20, 28);

/*
    * The press stops eight pixels above the floor, less than the character
    * height, so a character under it is crushed.
    *
    * At the top it stops one character height below the ceiling. If it reached
    * the ceiling, a character riding on top would be carried into the ceiling
    * and crushed as well. With the gap, the top of the press works as a lift.
*/
const press = engine.addPlatform(10 * TILE_SIZE, 4 * TILE_SIZE, 160, 24, {
    points: [{ x: 10 * TILE_SIZE, y: 13 * TILE_SIZE }],
    speed: 150,
});

/* The piston stops eight pixels from the wall, less than the character width,
   so a character pushed against the wall is crushed. */
const piston = engine.addPlatform(20 * TILE_SIZE, 12 * TILE_SIZE, 24, 64, {
    points: [{ x: 23 * TILE_SIZE, y: 12 * TILE_SIZE }],
    speed: 110,
});

/**
    * @type {number} number of times the character was crushed.
*/
let losses = 0;

/**
    * @type {string} what crushed the character last, for the readout.
*/
let lastCulprit = 'nothing yet';

/**
    * @type {number} remaining frames of the flash shown after a crush.
*/
let flash = 0;

player.body.onCrushed = what => {
    losses++;
    flash = 12;
    lastCulprit = what === press ? 'the press' : what === piston ? 'the piston' : 'the level';

    /* place() also resets the previous position, so the respawn is not
       interpolated. */
    player.body.place(SPAWN_X, SPAWN_Y);
    player.body.velocityX = 0;
    player.body.velocityY = 0;
};

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
    flash = Math.max(0, flash - 1);

    draw();
    readout.innerHTML =
        '<div><span class="name">crushed</span><span class="value">'
        + losses + ' times, last by ' + lastCulprit + '</span></div>';
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the press, the piston and the character.
*/
function draw() {
    const alpha = engine.alpha;

    context.fillStyle = flash > 0 ? '#f8d7da' : '#fff';
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
