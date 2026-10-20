/**
    * @file contacts.js, reading tile, cell and impact speed from a contact.
    *
    * The bottom row floors are glass. A soft landing leaves them intact; a fall
    * from a higher ledge breaks the tile. 'onCollision' receives a contact with
    * the tile identifier, the cell, the tile definition and the impact speed,
    * none of which is available from 'touching.bottom'.
    *
    * The grid reads the map array on every cast, so breaking a tile is a single
    * assignment to the array. R restores all tiles.
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
    * @type {object} tile identifier for each legend character.
*/
const IDS = { '.': 0, '#': 1, o: 3 };

/**
    * Tile definitions. Every field is passed back in the contact's 'tile', so a
    * definition can carry any game data.
    *
    * @type {object}
*/
const DEFINITIONS = { 3: { glass: true } };

/**
    * @type {number} minimum impact speed that breaks glass.
*/
const BREAKING_SPEED = 650;

/**
    * Builds a new map from the legend.
    *
    * @returns {number[][]} tile identifiers.
*/
const freshMap = () => LEGEND.map(row => [...row].map(char => IDS[char]));

const map = freshMap();
const world = new TriquiWorld({ map, tileSize: TILE_SIZE, definitions: DEFINITIONS });
const engine = new TriquiEngine(world);
const player = engine.spawn(64, 420, 20, 28);

/**
    * @type {object[]} recent contacts, newest first, for the readout.
*/
const log = [];

/**
    * @type {number} number of broken glass tiles.
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
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the level, the glass tiles as outlines, and the character.
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
    * Writes the recent contacts to the readout, as received from the collider.
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
