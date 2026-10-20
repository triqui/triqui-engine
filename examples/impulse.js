/**
    * @file impulse.js, charged jumps and springs built with impulses.
    *
    * Both features are game code that uses a single engine method.
    *
    * Holding C charges a jump and releasing C performs it. The built in jump
    * cannot do this because its speed is fixed when it starts, so 'jumpSpeed' is
    * set to zero and the jump is implemented here.
    *
    * The grey tiles are springs. 'onCollision' checks the tile definition and
    * applies an impulse. This works inside the callback because the collider has
    * already updated the body velocity when the callback runs.
    *
    * Both use 'impulseAligned', which is relative to gravity instead of the
    * world axes. After rotating gravity with G, springs still push away from
    * their surface.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#........#####..........#',
    '#.......................#',
    '#.......................#',
    '#..####.........#####...#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '###oo#########oo####oo###',
];

/**
    * @type {object} tile identifier for each legend character.
*/
const IDS = { '.': 0, '#': 1, o: 4 };

/**
    * Spring tiles are ordinary solid tiles for the collider. The 'spring' flag
    * is read back from the contact.
    *
    * @type {object}
*/
const DEFINITIONS = { 4: { spring: true } };

const MAP = LEGEND.map(row => [...row].map(char => IDS[char]));

/**
    * @type {number} spring impulse speed.
*/
const SPRING = 720;

/**
    * @type {number} minimum and maximum charged jump speed.
*/
const CHARGE_FLOOR = 260;
const CHARGE_CEILING = 760;

/**
    * @type {number} time to charge from minimum to maximum, in seconds.
*/
const CHARGE_TIME = 0.9;

const GRAVITY_DIRECTIONS = [
    { name: 'down', x: 0, y: 1 },
    { name: 'left', x: -1, y: 0 },
    { name: 'up', x: 0, y: -1 },
    { name: 'right', x: 1, y: 0 },
];

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE, definitions: DEFINITIONS });
const engine = new TriquiEngine(world);

/* The built in jump is disabled; this file implements the jump. */
const player = engine.spawn(2 * TILE_SIZE, 13 * TILE_SIZE, 20, 28, { jumpSpeed: 0 });

player.body.onCollision = contact => {
    if (contact.tile && contact.tile.spring && contact.face === 'bottom') {
        player.body.impulseAligned(0, SPRING);
    }
};

/**
    * @type {number} charge time, in seconds.
*/
let charge = 0;

/**
    * @type {number} which way gravity is pointing.
*/
let gravityAt = 0;

const keys = { left: 0, right: 0, charging: false };

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
    if (event.code === 'KeyC' || event.code === 'Space') {
        keys.charging = true;
    }
    if (event.code === 'KeyG' && !event.repeat) {
        gravityAt = (gravityAt + 1) % GRAVITY_DIRECTIONS.length;
        const where = GRAVITY_DIRECTIONS[gravityAt];
        engine.setGravity(where.x * 2000, where.y * 2000);
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
    if (event.code === 'KeyC' || event.code === 'Space') {
        /* The jump happens on release. The engine does not handle this key. */
        if (keys.charging && player.body.grounded) {
            player.body.impulseAligned(0, strength());
        }
        keys.charging = false;
        charge = 0;
    }
});

addEventListener('blur', () => {
    keys.left = 0;
    keys.right = 0;
    keys.charging = false;
    charge = 0;
});

/**
    * @returns {number} jump speed for the current charge.
*/
function strength() {
    const wound = Math.min(1, charge / CHARGE_TIME);
    return CHARGE_FLOOR + (CHARGE_CEILING - CHARGE_FLOOR) * wound;
}

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
    const elapsed = (now - previous) / 1000;
    previous = now;

    player.input.left = keys.left;
    player.input.right = keys.right;

    /* Charging only progresses while grounded. */
    if (keys.charging && player.body.grounded) {
        charge = Math.min(CHARGE_TIME, charge + elapsed);
    }

    engine.advance(elapsed);
    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the springs, and the character, which gets shorter as the
    * charge increases.
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
            context.fillStyle = id === 4 ? '#777' : '#bbb';
            context.strokeStyle = '#555';
            context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            context.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
            if (id === 4) {
                context.fillStyle = '#fff';
                context.fillRect(x + 4, y + 6, TILE_SIZE - 8, 3);
                context.fillRect(x + 4, y + 13, TILE_SIZE - 8, 3);
            }
        }
    }

    const squat = charge > 0 ? Math.round((charge / CHARGE_TIME) * 8) : 0;
    const drawX = body.renderX(alpha);
    const drawY = body.renderY(alpha) + squat * body.downY;

    context.fillStyle = body.grounded ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    context.fillRect(drawX, drawY, body.width, body.height - squat * Math.abs(body.downY));
    context.strokeRect(drawX + 0.75, drawY + 0.75,
                       body.width - 1.5, body.height - squat * Math.abs(body.downY) - 1.5);
}

/**
    * Writes the charge as a text bar and the resulting jump speed.
*/
function report() {
    const full = 16;
    const wound = Math.round((charge / CHARGE_TIME) * full);
    readout.innerHTML =
        '<div><span class="name">charge</span><span class="value">'
        + '['.concat('#'.repeat(wound), '-'.repeat(full - wound), ']   ')
        + (keys.charging ? strength().toFixed(0).padStart(3) + ' px/s on release'
            : 'hold C or space, on the ground')
        + '</span></div>'
        + '<div><span class="name">springs</span><span class="value">'
        + SPRING + ' px/s, away from themselves   (G turns gravity)</span></div>';
}

requestAnimationFrame(frame);
