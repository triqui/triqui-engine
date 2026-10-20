/**
    * @file pickups.js, the question a ray cannot answer.
    *
    * Coins to collect and a pool to swim in, both made of sensors: rectangles that
    * notice and do not resist. A cast asks what is in front of something, which is
    * the right question for a wall and the wrong one for a coin, because being
    * inside a coin has no direction and no distance.
    *
    * What a sensor reports is not that you are inside it, which is true for as
    * long as it takes to walk across one, but the two moments that matter. The
    * pool is the argument for both: the way in is where the water takes hold, and
    * the way out is where it lets go. Without the second the character swims for
    * the rest of the game.
*/

import { TriquiWorld, TriquiEngine, DEFAULT_TUNING } from '../src/triqui.js';

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
    '#.###.........#######...#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(40, 420, 20, 28);

/**
    * Where the coins sit: a column and the row of the ledge they rest on.
    *
    * @type {Array<{col: number, row: number}>}
*/
const PLACES = [
    { col: 3, row: 12 }, { col: 7, row: 10 }, { col: 11, row: 8 },
    { col: 15, row: 6 }, { col: 19, row: 4 }, { col: 21, row: 2 },
    { col: 17, row: 12 }, { col: 19, row: 10 },
];

const coins = PLACES.map(place => engine.addSensor(
    place.col * TILE_SIZE + 8, place.row * TILE_SIZE - 24, 16, 16, 'coin',
));

/* The pool fills the bottom left of the room. */
const pool = engine.addSensor(TILE_SIZE, 13 * TILE_SIZE, 6 * TILE_SIZE, TILE_SIZE, 'water');

/**
    * @type {number} coins taken.
*/
let taken = 0;

/**
    * @type {string} what just happened, for the panel.
*/
let note = 'nothing yet';

player.body.onSensor = (sensor, entering) => {
    if (sensor.data === 'coin' && entering) {
        /* Switching it off is cheaper than removing it, and puts it back in one
           assignment when the game wants to. */
        sensor.enabled = false;
        taken++;
        note = 'took a coin';
        return;
    }

    if (sensor.data === 'water') {
        /* Tuning belongs to the character, not the world, so the water changes
           this one and nobody else. */
        player.tuning.gravityY = entering ? 700 : DEFAULT_TUNING.gravityY;
        player.tuning.maxFallSpeed = entering ? 180 : DEFAULT_TUNING.maxFallSpeed;
        player.tuning.jumpSpeed = entering ? 320 : DEFAULT_TUNING.jumpSpeed;
        player.tuning.runSpeed = entering ? 130 : DEFAULT_TUNING.runSpeed;
        note = entering ? 'in the water' : 'out of the water';
    }
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
        for (const coin of coins) {
            coin.enabled = true;
        }
        taken = 0;
        note = 'coins put back';
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
        '<div><span class="name">coins</span><span class="value">'
        + taken + ' of ' + coins.length + '   (R puts them back)</span></div>'
        + '<div><span class="name">last</span><span class="value">' + note + '</span></div>';
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the water, the coins still out and the character.
*/
function draw() {
    const body = player.body;
    const alpha = engine.alpha;

    context.fillStyle = '#fff';
    context.fillRect(0, 0, viewWidth, viewHeight);

    context.fillStyle = '#e8e8e8';
    context.fillRect(pool.x, pool.y, pool.width, pool.height);
    context.strokeStyle = '#999';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(pool.x, pool.y + 0.5);
    context.lineTo(pool.x + pool.width, pool.y + 0.5);
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

    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    for (const coin of coins) {
        if (!coin.enabled) {
            continue;
        }
        context.beginPath();
        context.arc(coin.x + coin.width / 2, coin.y + coin.height / 2,
                    coin.width / 2 - 1, 0, Math.PI * 2);
        context.stroke();
    }

    context.fillStyle = body.grounded ? '#000' : '#fff';
    context.fillRect(body.renderX(alpha), body.renderY(alpha), body.width, body.height);
    context.strokeRect(body.renderX(alpha) + 0.75, body.renderY(alpha) + 0.75,
                       body.width - 1.5, body.height - 1.5);
}

requestAnimationFrame(frame);
