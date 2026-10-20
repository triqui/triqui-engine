/**
    * @file contacts.js, what the collider knows and used to throw away.
    *
    * The floors on the bottom row are glass. Land on one gently and nothing
    * happens; fall onto it from a couple of ledges up and it goes, because the
    * contact that stopped the fall carries the tile's identifier, the cell it
    * lives in, its definition and the speed of the impact. None of that survives
    * 'touching.bottom'.
    *
    * The map is an ordinary array and the grid reads it every cast, so breaking a
    * tile is one assignment. R puts them all back.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
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
    '#.ooo.........ooooooo...#',
    '#.......................#',
    '#########################',
];

/**
    * @type {object} what each character in the map means.
*/
const IDS = { '.': 0, '#': 1, o: 3 };

/**
    * Tile definitions. Anything here is handed back on the contact, so a tile can
    * carry whatever the game needs to know about it.
    *
    * @type {object}
*/
const DEFINITIONS = { 3: { glass: true } };

/**
    * @type {number} how fast a landing has to be to break glass.
*/
const BREAKING_SPEED = 650;

/**
    * Builds a fresh map from the legend.
    *
    * @returns {number[][]} tile identifiers.
*/
const freshMap = () => LEGEND.map(row => [...row].map(char => IDS[char]));

const map = freshMap();
const world = new TriquiWorld({ map, tileSize: TILE_SIZE, definitions: DEFINITIONS });
const engine = new TriquiEngine(world);
const player = engine.spawn(64, 420, 20, 28);

/**
    * @type {object[]} the last few contacts, newest first, for the panel.
*/
const log = [];

/**
    * @type {number} how many panes have gone.
*/
let broken = 0;

player.body.onCollision = contact => {
    if (contact.tile && contact.tile.glass && contact.face === 'bottom'
        && contact.speed >= BREAKING_SPEED) {
        map[contact.cellY][contact.cellX] = 0;
        broken++;
    }

    log.unshift(contact);
    log.length = Math.min(log.length, 4);
};

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
    if (event.code === 'KeyR' && !event.repeat) {
        freshMap().forEach((row, index) => {
            map[index] = row;
        });
        broken = 0;
        log.length = 0;
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
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the level, the glass in outline, and the character.
*/
function draw() {
    const body = player.body;
    const alpha = engine.alpha;

    context.fillStyle = '#fff';
    context.fillRect(0, 0, viewWidth, viewHeight);

    context.lineWidth = 1;
    for (let row = 0; row < world.rows; row++) {
        for (let col = 0; col < world.columns; col++) {
            const id = world.tileAt(col, row);
            if (id === 0) {
                continue;
            }
            const x = col * TILE_SIZE;
            const y = row * TILE_SIZE;
            context.fillStyle = id === 3 ? '#f0f0f0' : '#bbb';
            context.strokeStyle = id === 3 ? '#000' : '#555';
            context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            context.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        }
    }

    context.fillStyle = body.grounded ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    context.fillRect(body.renderX(alpha), body.renderY(alpha), body.width, body.height);
    context.strokeRect(body.renderX(alpha) + 0.75, body.renderY(alpha) + 0.75,
                       body.width - 1.5, body.height - 1.5);
}

/**
    * Writes out the last few contacts, exactly as the collider handed them over.
*/
function report() {
    const lines = [['broken', broken + ' of 10 panes   (R puts them back)']];

    for (const contact of log) {
        const what = contact.other
            ? 'another body'
            : 'tile ' + contact.tileId + ' at ' + contact.cellX + ',' + contact.cellY;
        lines.push([contact.face, what.padEnd(24)
            + ('normal ' + contact.normalX + ',' + contact.normalY).padEnd(14)
            + String(Math.round(contact.speed)).padStart(4) + ' px/s']);
    }

    readout.innerHTML = lines.map(line =>
        '<div><span class="name">' + line[0] + '</span>'
        + '<span class="value">' + line[1] + '</span></div>').join('');
}

requestAnimationFrame(frame);
