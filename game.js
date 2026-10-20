/**
    * @file game.js, the demo: a tile level with two characters.
    *
    * The engine handles the physics. This file contains only game code: key
    * bindings, the level layout and rendering.
    *
    * It expects three elements in the page: a canvas with the id 'view', a
    * container with the id 'readout', and a button with the id 'toggle'.
*/

import { TriquiWorld, TriquiEngine } from './src/triqui.js';

/* ── level ──────────────────────────────────────────────────────────────── */

/**
    * @type {number} size of one cell, in pixels.
*/
const TILE_SIZE = 32;

/**
    * The level layout. '#' is solid and '.' is empty. The grid reports cells
    * outside the map as empty, so the level needs a solid border.
    *
    * Every ledge can be reached from the floor and left again with the default
    * tuning, holding a direction from the start of the jump. The default jump
    * height is about 2.4 tiles, so ledges are two rows up and one or two columns
    * to the side, never directly overhead.
    *
    * @type {string[]}
*/
const LEGEND = [
    '#########################',
    '#.......................#',
    '#...................#####',
    '#.......................#',
    '#.................###...#',
    '#.......................#',
    '#.............###.......#',
    '#.......................#',
    '#.........###...........#',
    '#.......................#',
    '#.....###.........####..#',
    '#.......................#',
    '#.###.........#######...#',
    '#.......................#',
    '#########################'
];

/**
    * @type {number[][]} the level as tile identifiers, indexed as
    *                    MAP[row][column].
*/
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

/**
    * @type {number} character size. Slightly smaller than a cell, so it fits
    *                through a two row gap.
*/
const PLAYER_WIDTH = 20;
const PLAYER_HEIGHT = 28;

/**
    * Start positions. Each entry creates one character; the engine has no limit
    * on the number of characters.
    *
    * All characters share the same input. They start in different places, so
    * their paths diverge as soon as one of them hits a wall.
    *
    * @type {Array<{x: number, y: number}>}
*/
const SPAWNS = [
    { x: 40, y: 420 },
    { x: 200, y: 420 },
];

/**
    * The four gravity directions the demo cycles through with G.
    *
    * @type {Array<{name: string, x: number, y: number}>}
*/
const GRAVITY_DIRECTIONS = [
    { name: 'down', x: 0, y: 1 },
    { name: 'left', x: -1, y: 0 },
    { name: 'up', x: 0, y: -1 },
    { name: 'right', x: 1, y: 0 },
];

/**
    * @type {number} gravity strength, in pixels per second squared.
*/
const GRAVITY_STRENGTH = 2000;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE, bodiesCollide: true });
const engine = new TriquiEngine(world);
const players = SPAWNS.map(spawn =>
    engine.spawn(spawn.x, spawn.y, PLAYER_WIDTH, PLAYER_HEIGHT));

/**
    * @type {number[]} landing count per character, from 'justLanded'. Unlike
    *                  'grounded', which stays true while standing, 'justLanded'
    *                  is set once per landing.
*/
const landings = players.map(() => 0);

/**
    * @type {number} index of the current gravity direction.
*/
let gravityAt = 0;

/* ── input ──────────────────────────────────────────────────────────────── */

const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
const GRAVITY_KEY = 'KeyG';

/**
    * Keyboard state. It is copied into the input of every character once per
    * frame. Each character has its own input object, so a gamepad or AI could
    * write to it instead.
    *
    * @type {{left: number, right: number, jump: boolean, jumpPressed: boolean}}
*/
const keys = { left: 0, right: 0, jump: false, jumpPressed: false };

addEventListener('keydown', event => {
    if (LEFT_KEYS.includes(event.code)) {
        keys.left = 1;
    }
    if (RIGHT_KEYS.includes(event.code)) {
        keys.right = 1;
    }
    if (JUMP_KEYS.includes(event.code)) {
        /*
            * 'jumpPressed' is set only on the keydown that changes the key
            * state, so key repeat does not trigger a jump on landing.
        */
        if (!keys.jump) {
            keys.jumpPressed = true;
        }
        keys.jump = true;
    }
    if (event.code === GRAVITY_KEY && !event.repeat) {
        gravityAt = (gravityAt + 1) % GRAVITY_DIRECTIONS.length;
        const where = GRAVITY_DIRECTIONS[gravityAt];
        engine.setGravity(where.x * GRAVITY_STRENGTH, where.y * GRAVITY_STRENGTH);
    }
    /* Prevent the default action only for game keys without modifiers, so
       browser shortcuts such as Ctrl+D and F12 keep working. */
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (!modified && (LEFT_KEYS.includes(event.code) || RIGHT_KEYS.includes(event.code)
        || JUMP_KEYS.includes(event.code))) {
        event.preventDefault();
    }
});

addEventListener('keyup', event => {
    if (LEFT_KEYS.includes(event.code)) {
        keys.left = 0;
    }
    if (RIGHT_KEYS.includes(event.code)) {
        keys.right = 0;
    }
    if (JUMP_KEYS.includes(event.code)) {
        keys.jump = false;
    }
});

/*
    * Release all keys on blur: a key held while the window loses focus never
    * sends keyup.
*/
addEventListener('blur', () => {
    Object.assign(keys, { left: 0, right: 0, jump: false, jumpPressed: false });
});

const toggle = document.getElementById('toggle');

toggle.addEventListener('click', () => {
    const collider = engine.collider;
    collider.recordRays = !collider.recordRays;
    toggle.textContent = collider.recordRays ? 'hide rays' : 'show rays';
    toggle.blur();                      // otherwise the space bar would activate the button again
});

/* ── drawing ────────────────────────────────────────────────────────────── */

/**
    * @type {number} minimum drawn ray length. Rays cover a fraction of a pixel
    *                per step, so they are lengthened to be visible.
*/
const MIN_RAY_LENGTH = 11;

/**
    * @type {number} radius of the dot marking a contact.
*/
const CONTACT_DOT_RADIUS = 2.5;

/**
    * @type {number} maximum device pixel ratio used for the canvas.
*/
const MAX_PIXEL_RATIO = 2;

/**
    * @type {string} label drawn inside each character.
*/
const PLAYER_LABEL_FONT = '10px ui-monospace, Menlo, Consolas, monospace';

const canvas = document.getElementById('view');
const context = canvas.getContext('2d');
const viewWidth = world.columns * TILE_SIZE;
const viewHeight = world.rows * TILE_SIZE;
const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

canvas.width = viewWidth * ratio;
canvas.height = viewHeight * ratio;
canvas.style.aspectRatio = viewWidth + ' / ' + viewHeight;
context.scale(ratio, ratio);

/**
    * Draws the level, the characters, and the rays when enabled.
*/
function draw() {
    /*
        * Interpolation factor between the last two physics steps.
    */
    const alpha = engine.alpha;

    context.fillStyle = '#fff';
    context.fillRect(0, 0, viewWidth, viewHeight);

    context.strokeStyle = '#e8e8e8';
    context.lineWidth = 1;
    context.beginPath();
    for (let col = 1; col < world.columns; col++) {
        context.moveTo(col * TILE_SIZE + 0.5, 0);
        context.lineTo(col * TILE_SIZE + 0.5, viewHeight);
    }
    for (let row = 1; row < world.rows; row++) {
        context.moveTo(0, row * TILE_SIZE + 0.5);
        context.lineTo(viewWidth, row * TILE_SIZE + 0.5);
    }
    context.stroke();

    context.fillStyle = '#bbb';
    context.strokeStyle = '#555';
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

    if (engine.collider.recordRays) {
        drawRays(alpha);
    }

    context.lineWidth = 1.5;
    context.font = PLAYER_LABEL_FONT;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    engine.bodies.forEach((body, index) => {
        const drawX = body.renderX(alpha);
        const drawY = body.renderY(alpha);

        context.fillStyle = body.grounded ? '#000' : '#fff';
        context.strokeStyle = '#000';
        context.fillRect(drawX, drawY, body.width, body.height);
        context.strokeRect(drawX + 0.75, drawY + 0.75, body.width - 1.5, body.height - 1.5);

        /* Filled when grounded, hollow when airborne; the label identifies the
           character. */
        context.fillStyle = body.grounded ? '#fff' : '#000';
        context.fillText(String(index + 1),
                         drawX + body.width / 2, drawY + body.height / 2);
    });
}

/**
    * Draws the casts of the last physics step.
    *
    * Rays are lengthened to a minimum length; origin, direction and hit state
    * are exact.
    *
    * One collider serves every character, so all rays are in one list and each
    * records its body. Each ray is offset by its own body's interpolation offset,
    * so it stays attached to the drawn body.
    *
    * @param {number} alpha how far the frame is between the last two steps.
*/
function drawRays(alpha) {
    for (const ray of engine.collider.rays) {
        const body = ray.body;
        const length = Math.max(ray.length, MIN_RAY_LENGTH);
        const startX = ray.x + body.renderX(alpha) - body.x;
        const startY = ray.y + body.renderY(alpha) - body.y;
        const endX = startX + ray.dirX * length;
        const endY = startY + ray.dirY * length;

        context.strokeStyle = ray.hit ? '#000' : '#999';
        context.lineWidth = 1;
        context.setLineDash(ray.hit ? [] : [3, 3]);
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
        context.setLineDash([]);

        if (ray.hit) {
            context.fillStyle = '#000';
            context.beginPath();
            context.arc(endX, endY, CONTACT_DOT_RADIUS, 0, Math.PI * 2);
            context.fill();
        }
    }
}

/* ── readout ────────────────────────────────────────────────────────────── */

const readout = document.getElementById('readout');

/**
    * Formats a number with a fixed width, so the readout columns stay aligned.
    *
    * @param {number} value  the number to format.
    * @param {number} places number of decimals.
    * @returns {string} the number, right aligned in six columns.
*/
function figure(value, places) {
    return value.toFixed(places).padStart(6);
}

/**
    * Writes the readout: a header line and one line per character.
*/
function report() {
    const heading = 'position'.padEnd(16) + 'velocity'.padEnd(15)
        + 'state'.padEnd(10) + 'landings';

    const lines = [
        ['gravity', GRAVITY_DIRECTIONS[gravityAt].name + '   (G turns it)'],
        ['', heading],
    ].concat(engine.bodies.map((body, index) => [
        'player ' + (index + 1),
        figure(body.x, 1) + ',' + figure(body.y, 1) + '  '
        + figure(body.velocityX, 0) + ',' + figure(body.velocityY, 0) + '  '
        + state(body).padEnd(10) + String(landings[index]).padStart(3),
    ]));

    readout.innerHTML = lines.map(line =>
        '<div><span class="name">' + line[0] + '</span>'
        + '<span class="value">' + line[1] + '</span></div>').join('');
}

/**
    * Returns the character state as one word, for example to select an
    * animation.
    *
    * @param {object} body the character's body.
    * @returns {string} 'standing', 'rising' or 'falling'.
*/
function state(body) {
    if (body.grounded) {
        return 'standing';
    }
    /* Rising means moving against gravity, not upwards on screen. */
    const fall = body.velocityX * body.downX + body.velocityY * body.downY;
    return fall < 0 ? 'rising' : 'falling';
}

/* ── loop ───────────────────────────────────────────────────────────────── */

let previous = performance.now();

/**
    * Copies the input, advances the engine by the elapsed time and draws.
    *
    * @param {number} now frame timestamp.
*/
function frame(now) {
    /*
        * The keyboard state is copied into each character's input. The engine
        * clears each 'jumpPressed' separately, so the inputs must not be shared.
    */
    for (const player of players) {
        player.input.left = keys.left;
        player.input.right = keys.right;
        player.input.jump = keys.jump;
        if (keys.jumpPressed) {
            player.input.jumpPressed = true;
        }
    }
    keys.jumpPressed = false;

    engine.advance((now - previous) / 1000);
    previous = now;

    players.forEach((player, index) => {
        if (player.body.justLanded) {
            landings[index]++;
        }
    });

    draw();
    report();
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
