/**
    * @file dropthrough.js, going back down a tower of one way decks.
    *
    * You start at the top. Down, or S, lets go of whatever deck is under your
    * feet; everything else is the same tower as the one way example.
    *
    * Holding down does not move the character. It sets a timer on the body, and
    * while the timer runs the collider stops treating one way geometry as a floor,
    * for that body only. The timer needs to survive a single step: once the feet
    * are past the surface the collider works out on its own that the body is
    * through, and gravity does the rest.
    *
    * The bar in the panel is that timer, running out.
*/

import { TriquiWorld, TriquiEngine, DEFAULT_TUNING } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '###############',
    '#.............#',
    '#...=======...#',
    '#.............#',
    '#...=======...#',
    '#.............#',
    '#...=======...#',
    '#.............#',
    '#...=======...#',
    '#.............#',
    '#...=======...#',
    '#.............#',
    '#...=======...#',
    '#.............#',
    '###############',
];

const IDS = { '.': 0, '#': 1, '=': 2 };
const MAP = LEGEND.map(row => [...row].map(char => IDS[char]));
const DEFINITIONS = { 2: { oneWay: true } };

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE, definitions: DEFINITIONS });
const engine = new TriquiEngine(world);
const player = engine.spawn(7 * TILE_SIZE, 2 * TILE_SIZE - 28, 20, 28);

const keys = { left: 0, right: 0, down: 0, jump: false, jumpPressed: false };

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
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        keys.down = 1;
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
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        keys.down = 0;
    }
    if (event.code === 'Space' || event.code === 'KeyW') {
        keys.jump = false;
    }
});

addEventListener('blur', () => {
    Object.assign(keys, { left: 0, right: 0, down: 0, jump: false, jumpPressed: false });
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

/**
    * @type {number} how many decks have been dropped through.
*/
let dropped = 0;

let previous = performance.now();

/**
    * @param {number} now when this frame began.
*/
function frame(now) {
    const input = player.input;
    input.left = keys.left;
    input.right = keys.right;
    input.down = keys.down;
    input.jump = keys.jump;
    if (keys.jumpPressed) {
        input.jumpPressed = true;
    }
    keys.jumpPressed = false;

    engine.advance((now - previous) / 1000);
    previous = now;

    /* Letting go of a deck is leaving the ground while the timer is running. */
    if (player.body.justLeftGround && player.body.dropTimer > 0) {
        dropped++;
    }

    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the tower and the character.
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
            const x = col * TILE_SIZE;
            const y = row * TILE_SIZE;
            if (id === 1) {
                context.fillStyle = '#bbb';
                context.strokeStyle = '#555';
                context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                context.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
            }
            if (id === 2) {
                /* A deck being let go of is drawn hollow, to show which rule is
                   in force. */
                context.fillStyle = body.dropTimer > 0 ? '#ccc' : '#555';
                context.fillRect(x, y, TILE_SIZE, 4);
            }
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
    * Shows the drop timer as a bar of characters, and the tally.
*/
function report() {
    const body = player.body;
    const full = 12;
    const left = Math.round((body.dropTimer / DEFAULT_TUNING.dropThroughTime) * full);
    readout.innerHTML =
        '<div><span class="name">drop timer</span><span class="value">'
        + '['.concat('#'.repeat(left), '-'.repeat(full - left), ']')
        + '   ' + body.dropTimer.toFixed(3) + 's of '
        + DEFAULT_TUNING.dropThroughTime.toFixed(2) + '</span></div>'
        + '<div><span class="name">dropped</span><span class="value">'
        + dropped + ' decks</span></div>';
}

requestAnimationFrame(frame);
