/**
    * @file gravity.js, turning the world instead of the character.
    *
    * Six plates to stand on, on all four walls of the room. Two of them are on
    * the ceiling and one on each side, so the only way round is to change which
    * way down points.
    *
    * Nothing in the engine treats the floor as special. Gravity is a vector, and
    * standing, running and jumping are all worked out from it: what counts as the
    * ground is whichever face is pointing that way, running is across it, and a
    * jump is against it. Turn it a quarter and the character walks up the wall it
    * was falling past.
    *
    * Running stays across gravity, which means the right hand key moves you
    * clockwise round the room rather than always rightwards on the screen. That
    * is the engine being consistent; a game that wants the other convention flips
    * the input, not the physics.
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
    * The four ways down can point.
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
    * A plate against each wall, two of them out of reach of any one gravity.
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
    * @type {Set<object>} the plates that have been stood on.
*/
const reached = new Set();

player.body.onSensor = (sensor, entering) => {
    if (entering) {
        reached.add(sensor);
    }
};

/**
    * @type {number} which direction gravity is pointing.
*/
let at = 0;

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
    readout.innerHTML =
        '<div><span class="name">gravity</span><span class="value">'
        + DIRECTIONS[at].name.padEnd(8) + '(G turns it a quarter)</span></div>'
        + '<div><span class="name">plates</span><span class="value">'
        + reached.size + ' of ' + plates.length + '   (R forgets them)</span></div>';
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the plates, and the character with a mark on whichever side
    * of it is currently its feet.
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

    for (const plate of plates) {
        context.fillStyle = reached.has(plate) ? '#000' : '#fff';
        context.strokeStyle = '#000';
        context.lineWidth = 1;
        context.fillRect(plate.x, plate.y, plate.width, plate.height);
        context.strokeRect(plate.x + 0.5, plate.y + 0.5, plate.width - 1, plate.height - 1);
    }

    const drawX = body.renderX(alpha);
    const drawY = body.renderY(alpha);
    context.fillStyle = body.grounded ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    context.fillRect(drawX, drawY, body.width, body.height);
    context.strokeRect(drawX + 0.75, drawY + 0.75, body.width - 1.5, body.height - 1.5);

    /* A bar along whichever face is the feet, taken from the body's own down
       vector rather than from anything this file decided. */
    const thickness = 5;
    context.fillStyle = body.grounded ? '#fff' : '#000';
    context.fillRect(
        drawX + (body.downX > 0 ? body.width - thickness : 0),
        drawY + (body.downY > 0 ? body.height - thickness : 0),
        body.downX === 0 ? body.width : thickness,
        body.downY === 0 ? body.height : thickness,
    );
}

requestAnimationFrame(frame);
