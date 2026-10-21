/**
    * @file gravity.js, rotating gravity.
    *
    * Six plates are placed on the four walls of the room. Two are on the ceiling
    * and one on each side wall, so reaching all of them requires rotating
    * gravity.
    *
    * Gravity is a vector, and ground detection, running and jumping are derived
    * from it: the ground is the face in the gravity direction, the run axis is
    * perpendicular to it, and jumps go against it. G rotates gravity by a
    * quarter turn.
    *
    * Because the run axis follows gravity, the right key moves the character
    * clockwise around the room, not always to the right of the screen. A game
    * that wants screen relative controls must remap the input.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#####################',
    '#...................#',
    '#...................#',
    '#.......#####.......#',
    '#.......#...#.......#',
    '#.......#...#.......#',
    '#.......#####.......#',
    '#...................#',
    '#...................#',
    '#####################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

/**
    * The four gravity directions.
    *
    * @type {Array<{name: string, x: number, y: number}>}
*/
const DIRECTIONS = [
    { name: 'down', x: 0, y: 1 },
    { name: 'left', x: -1, y: 0 },
    { name: 'up', x: 0, y: -1 },
    { name: 'right', x: 1, y: 0 },
];

const STRENGTH = 2000;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(2 * TILE_SIZE, 8 * TILE_SIZE - 28, 20, 28);

/**
    * Plates on every wall. No single gravity direction reaches all of them.
    *
    * @type {object[]}
*/
const plates = [
    engine.addSensor(2 * TILE_SIZE, 8 * TILE_SIZE - 10, 40, 10, 'floor left'),
    engine.addSensor(17 * TILE_SIZE, 8 * TILE_SIZE - 10, 40, 10, 'floor right'),
    engine.addSensor(2 * TILE_SIZE, TILE_SIZE, 40, 10, 'ceiling left'),
    engine.addSensor(17 * TILE_SIZE, TILE_SIZE, 40, 10, 'ceiling right'),
    engine.addSensor(TILE_SIZE, 4 * TILE_SIZE, 10, 40, 'left wall'),
    engine.addSensor(19 * TILE_SIZE + 22, 4 * TILE_SIZE, 10, 40, 'right wall'),
];

/**
    * @type {Set<object>} plates already visited.
*/
const reached = new Set();

player.body.onSensor = (sensor, entering) => {
    if (entering) {
        reached.add(sensor);
    }
};

/**
    * @type {number} index of the current gravity direction.
*/
let at = 0;

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
    if (event.code === 'KeyG' && !event.repeat) {
        at = (at + 1) % DIRECTIONS.length;
        engine.setGravity(DIRECTIONS[at].x * STRENGTH, DIRECTIONS[at].y * STRENGTH);
    }
    if (event.code === 'KeyR' && !event.repeat) {
        reached.clear();
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
    readout.innerHTML =
        '<div><span class="name">gravity</span><span class="value">'
        + DIRECTIONS[at].name.padEnd(8) + '(G turns it a quarter)</span></div>'
        + '<div><span class="name">plates</span><span class="value">'
        + reached.size + ' of ' + plates.length + '   (R forgets them)</span></div>';
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the plates, and the character with a marker on the face
    * that points in the gravity direction.
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

    for (const plate of plates) {
        context.fillStyle = reached.has(plate) ? '#0d6efd' : '#fff';
        context.strokeStyle = '#0d6efd';
        context.lineWidth = 1;
        context.fillRect(plate.x, plate.y, plate.width, plate.height);
        context.strokeRect(plate.x + 0.5, plate.y + 0.5, plate.width - 1, plate.height - 1);
    }

    const drawX = body.renderX(alpha);
    const drawY = body.renderY(alpha);
    context.fillStyle = body.grounded ? '#0d6efd' : '#fff';
    context.strokeStyle = '#0d6efd';
    context.lineWidth = 1.5;
    context.fillRect(drawX, drawY, body.width, body.height);
    context.strokeRect(drawX + 0.75, drawY + 0.75, body.width - 1.5, body.height - 1.5);

    /* Feet marker, from the body's 'downX'/'downY'. */
    const thickness = 5;
    context.fillStyle = body.grounded ? '#fff' : '#0d6efd';
    context.fillRect(
        drawX + (body.downX > 0 ? body.width - thickness : 0),
        drawY + (body.downY > 0 ? body.height - thickness : 0),
        body.downX === 0 ? body.width : thickness,
        body.downY === 0 ? body.height : thickness,
    );
}

requestAnimationFrame(frame);
