/**
    * @file oneway.js, decks you can only meet from one side.
    *
    * A tower of them, stacked straight up. Ordinary floors could not be arranged
    * like this, because two rows of clearance is barely more than the character is
    * tall, and every jump would bang its head on the one above. These are not there
    * at all from below, so you go straight up through each and land on top of it.
    *
    * A tile is one way because its definition says so. The collider stops a body
    * on one only when the body is coming at it feet first and is still outside
    * it, and that single rule covers being jumped through, being walked into from
    * the side, and being stood on.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

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

/**
    * The one flag that makes a floor one way. It arrives on the contact as well,
    * so a game can tell a deck from honest ground without asking twice.
    *
    * @type {object}
*/
const DEFINITIONS = { 2: { oneWay: true } };

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE, definitions: DEFINITIONS });
const engine = new TriquiEngine(world);
const player = engine.spawn(7 * TILE_SIZE, 14 * TILE_SIZE - 28, 20, 28);

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

/**
    * @type {number} the highest deck reached, counting from the floor.
*/
let best = 0;

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

    const body = player.body;
    if (body.grounded) {
        best = Math.max(best, Math.round((14 * TILE_SIZE - (body.y + body.height)) / 64));
    }

    draw();
    readout.innerHTML = '<div><span class="name">deck</span><span class="value">'
        + (body.grounded ? 'standing on ' : 'in the air, best ')
        + best + ' of 6</span></div>';
    requestAnimationFrame(frame);
}

/**
    * Draws the tower. The decks are drawn as thin bars rather than full cells, to
    * say by their shape that they are floors and not blocks.
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
                context.fillStyle = '#555';
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

requestAnimationFrame(frame);
