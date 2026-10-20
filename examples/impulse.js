/**
    * @file impulse.js, jumps you charge and floors that throw you.
    *
    * Two things the engine does not have an opinion about, both written from the
    * game side with one method.
    *
    * Holding C winds up a jump and letting go spends it, which the built in jump
    * cannot do because it decides its own height the instant it starts. Zeroing
    * 'jumpSpeed' takes it out of the way and leaves the whole jump to this file.
    *
    * The grey tiles are springs. They push back from inside the collision they
    * caused: the contact says which tile was met and the impulse goes out before
    * the callback returns, which works because by then the body's velocity has
    * already been settled by the collider and is there to be changed.
    *
    * Both push with 'impulseAligned', which means across gravity and against it
    * rather than in x and y. Turn the world with G and the spring still throws you
    * off itself instead of upwards.
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
    * @type {object} what each character in the map means.
*/
const IDS = { '.': 0, '#': 1, o: 4 };

/**
    * Springs are ordinary solid tiles as far as the collider is concerned. What
    * makes them springs is this flag, which comes back on the contact.
    *
    * @type {object}
*/
const DEFINITIONS = { 4: { spring: true } };

const MAP = LEGEND.map(row => [...row].map(char => IDS[char]));

/**
    * @type {number} how hard a spring throws.
*/
const SPRING = 720;

/**
    * @type {number} the weakest a charged jump can be, and the strongest.
*/
const CHARGE_FLOOR = 260;
const CHARGE_CEILING = 760;

/**
    * @type {number} how long holding takes to go from one to the other.
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

/* The ordinary jump is taken out of the way: this character's only jump is the
   one this file gives it. */
const player = engine.spawn(2 * TILE_SIZE, 13 * TILE_SIZE, 20, 28, { jumpSpeed: 0 });

player.body.onCollision = contact => {
    if (contact.tile && contact.tile.spring && contact.face === 'bottom') {
        player.body.impulseAligned(0, SPRING);
    }
};

/**
    * @type {number} how long the jump has been wound up for, in seconds.
*/
let charge = 0;

/**
    * @type {number} which way gravity is pointing.
*/
let gravityAt = 0;

const keys = { left: 0, right: 0, charging: false };

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
        /* Letting go is the jump. Nothing in the engine knows this key exists. */
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
    * @returns {number} how hard the jump would be if let go of now.
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
    * @param {number} now when this frame began.
*/
function frame(now) {
    const elapsed = (now - previous) / 1000;
    previous = now;

    player.input.left = keys.left;
    player.input.right = keys.right;

    /* Winding up only counts while there is something to push off. */
    if (keys.charging && player.body.grounded) {
        charge = Math.min(CHARGE_TIME, charge + elapsed);
    }

    engine.advance(elapsed);
    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the springs as thicker bars, and the character squatting
    * lower the longer the jump has been wound up.
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
    * Shows the wind up as a bar, and what letting go would be worth.
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
