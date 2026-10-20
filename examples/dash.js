/**
    * @file dash.js, two dashes and a course that needs both.
    *
    * Shift or X dashes, in whichever of eight directions is being held, and
    * straight ahead when none is. While it lasts the dash controls the velocity
    * completely, with no gravity, friction or steering. Coming out of it the
    * character keeps its direction but not its speed, or a dash upwards would be a
    * second jump and a dash along the ground a permanent sprint.
    *
    * Two things limit it. The first is the number of dashes, which only the ground
    * gives back. A wall does not, or a character with one dash would have as many
    * as the level has walls. The second is a cooldown, so that two dashes in hand
    * cannot be spent in the same instant.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#..###..................#',
    '#.......................#',
    '#.....####......####....#',
    '#.......................#',
    '#.......................#',
    '#..###.......###........#',
    '#.......................#',
    '#.......................#',
    '#........####.......###.#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);

/**
    * What this character can do that a plain one cannot. Everything here is off
    * by default in the engine: abilities are given, not assumed.
    *
    * @type {object}
*/
const ABILITIES = {
    dashes: 2,
    dashSpeed: 520,
    dashTime: 0.14,
    dashCooldown: 0.2,
};

const player = engine.spawn(2 * TILE_SIZE, 14 * TILE_SIZE - 28, 20, 28, ABILITIES);

const keys = { left: 0, right: 0, up: 0, down: 0, jump: false, jumpPressed: false,
    dash: false, dashPressed: false };

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
    * @type {number} dashes spent since the page loaded.
*/
let spent = 0;

let previous = performance.now();

/**
    * @param {number} now when this frame began.
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

    if (player.dashing > 0 && player.sinceDash < engine.step * 1.5) {
        spent++;
    }

    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the level and the character, the character marked with what it is
    * doing at that moment.
*/
function draw() {
    const body = player.body;
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

    const drawX = body.renderX(alpha);
    const drawY = body.renderY(alpha);
    context.fillStyle = body.grounded ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = player.dashing > 0 ? 3 : 1.5;
    context.fillRect(drawX, drawY, body.width, body.height);
    context.strokeRect(drawX + 0.75, drawY + 0.75, body.width - 1.5, body.height - 1.5);

    /* A notch on the side it is looking, which the engine keeps for us because a
       dash with no direction held has to go somewhere. */
    context.fillStyle = '#000';
    context.fillRect(drawX + (body.facing > 0 ? body.width - 4 : 0), drawY + 6, 4, 5);
}

/**
    * Writes out what the character has left and what it is doing.
*/
function report() {
    readout.innerHTML = [
        ['dashes', '#'.repeat(player.dashesLeft)
            + '-'.repeat(ABILITIES.dashes - player.dashesLeft)
            + '   ' + player.dashesLeft + ' of ' + ABILITIES.dashes
            + '   (the ground gives them back)'],
        ['cooldown', player.sinceDash >= ABILITIES.dashCooldown ? 'ready'
            : (ABILITIES.dashCooldown - player.sinceDash).toFixed(2) + 's'],
        ['dashing', player.dashing > 0
            ? player.dashing.toFixed(2) + 's left, heading '
              + player.dashAlong.toFixed(2) + ', ' + player.dashFall.toFixed(2)
            : 'no   -   ' + spent + ' spent so far'],
    ].map(line =>
        '<div><span class="name">' + line[0] + '</span>'
        + '<span class="value">' + line[1] + '</span></div>').join('');
}

requestAnimationFrame(frame);
