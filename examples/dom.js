/**
    * @file dom.js, the same engine with no canvas anywhere.
    *
    * Every tile and every character is a div, moved with a transform. Nothing in
    * Triqui changes to allow it, because nothing in Triqui ever knew about a
    * canvas: the engine moves rectangles and says where they are, and reading
    * that is all a renderer ever does.
    *
    * The same four lines work for a Pixi sprite or a Phaser image. The one that
    * matters is the interpolation. The position has to be read at 'engine.alpha'
    * rather than raw, or the movement stutters against the refresh rate whatever is
    * drawing it.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '####################',
    '#..................#',
    '#..................#',
    '#.............###..#',
    '#..................#',
    '#.........###......#',
    '#..................#',
    '#.....###..........#',
    '#..................#',
    '#.###..............#',
    '#..................#',
    '####################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE, bodiesCollide: true });
const engine = new TriquiEngine(world);
const players = [
    engine.spawn(48, 292, 20, 28),
    engine.spawn(160, 292, 20, 28),
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

/* ── the scene, built once ──────────────────────────────────────────────── */

const stage = document.getElementById('stage');
stage.style.width = world.columns * TILE_SIZE + 'px';
stage.style.height = world.rows * TILE_SIZE + 'px';

/**
    * Makes a div of a given size, parked on the stage.
    *
    * @param {string} kind   the class to give it.
    * @param {number} width  how wide.
    * @param {number} height how tall.
    * @returns {object} the element.
*/
function block(kind, width, height) {
    const element = document.createElement('div');
    element.className = kind;
    element.style.width = width + 'px';
    element.style.height = height + 'px';
    stage.appendChild(element);
    return element;
}

for (let row = 0; row < world.rows; row++) {
    for (let col = 0; col < world.columns; col++) {
        if (world.tileAt(col, row) === 0) {
            continue;
        }
        const tile = block('tile', TILE_SIZE, TILE_SIZE);
        tile.style.transform = 'translate(' + col * TILE_SIZE + 'px,'
            + row * TILE_SIZE + 'px)';
    }
}

/**
    * @type {object[]} one div per body, in the same order as 'engine.bodies'.
*/
const sprites = engine.bodies.map(body => block('body', body.width, body.height));

let previous = performance.now();

/**
    * @param {number} now when this frame began.
*/
function frame(now) {
    for (const player of players) {
        const input = player.input;
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

    /* This is all of the rendering. */
    const alpha = engine.alpha;
    engine.bodies.forEach((body, index) => {
        const sprite = sprites[index];
        sprite.style.transform = 'translate(' + body.renderX(alpha).toFixed(2) + 'px,'
            + body.renderY(alpha).toFixed(2) + 'px)';
        sprite.dataset.standing = body.grounded ? 'yes' : 'no';
    });

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
