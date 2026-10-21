/**
    * @file dom.js, rendering with DOM elements instead of a canvas.
    *
    * Every tile and character is a div positioned with a CSS transform. The
    * engine needs no changes, because it only computes positions.
    *
    * The same render loop works with Pixi or Phaser sprites. Positions must be
    * read with 'renderX'/'renderY' at 'engine.alpha', otherwise the movement
    * stutters at the physics step rate.
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
    engine.spawn(40, 324, 20, 28),
    engine.spawn(160, 292, 20, 28),
];

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

/* ── the scene, built once ──────────────────────────────────────────────── */

const stage = document.getElementById('stage');
stage.style.width = world.columns * TILE_SIZE + 'px';
stage.style.height = world.rows * TILE_SIZE + 'px';

/**
    * Creates a div of the given size and appends it to the stage.
    *
    * @param {string} kind   the class to give it.
    * @param {number} width  width, in pixels.
    * @param {number} height height, in pixels.
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
    * @param {number} now frame timestamp.
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

    /* Rendering. */
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
