/**
    * @file wrap.js, a room with no floor and no ceiling.
    *
    * Fall out of the bottom and you come back in at the top, in the same column
    * and at the same speed. That one rule turns falling from a mistake into a way
    * of getting somewhere: the ledge at the top left cannot be jumped to from
    * anywhere, and the only way onto it is to drop off the bottom above the right
    * column and ride the fall back round.
    *
    * Nothing in the engine knows about any of this, and nothing in it had to
    * change. The grid reports everything past its edges as empty, so a body that
    * leaves simply keeps falling; 'place' moves a body and the position it is
    * drawn from together, so the jump from the bottom of the screen to the top is
    * not smeared across everything in between; and a body coming back in from
    * outside meets the tiles on the way like any other.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;

/* The same room as the main demo, with its floor and its ceiling taken out, and
   one ledge added up in the corner that nothing can reach from below. */
const LEGEND = [
    '#.......................#',
    '#...####................#',
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
    '#.......................#',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(3 * TILE_SIZE, 11 * TILE_SIZE - 28, 20, 28);

const viewWidth = world.columns * TILE_SIZE;
const viewHeight = world.rows * TILE_SIZE;

/* The prize, on the ledge that only the fall can reach. */
const prize = engine.addSensor(5 * TILE_SIZE, TILE_SIZE - 20, 16, 16, 'prize');

/**
    * @type {number} times round.
*/
let laps = 0;

/**
    * @type {boolean} whether the prize has been taken.
*/
let won = false;

player.body.onSensor = (sensor, entering) => {
    if (entering && sensor === prize) {
        sensor.enabled = false;
        won = true;
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
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
        if (!keys.jump) {
            keys.jumpPressed = true;
        }
        keys.jump = true;
    }
    if (event.code === 'KeyR' && !event.repeat) {
        prize.enabled = true;
        won = false;
        laps = 0;
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
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
        keys.jump = false;
    }
});

addEventListener('blur', () => {
    Object.assign(keys, { left: 0, right: 0, jump: false, jumpPressed: false });
});

const canvas = document.getElementById('view');
const context = canvas.getContext('2d');
const readout = document.getElementById('readout');
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

    /*
        * This is the whole mechanic. The body is put back by exactly the height of
        * the room, so it keeps whatever fraction of a pixel it had fallen past the
        * edge and the wrap is not a step. It uses 'place' rather than an
        * assignment, because the position the character is drawn from has to come
        * with it. Otherwise for one frame it is drawn somewhere down the middle of
        * the screen, on its way.
    */
    const body = player.body;
    if (body.y > viewHeight) {
        body.place(body.x, body.y - viewHeight - body.height);
        laps++;
    }

    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the prize, and the character. When the character is close to
    * an edge it is drawn a second time on the far side, so that the wrap reads as
    * continuous rather than as a disappearance.
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

    /* The open edges, marked so the room does not look merely unfinished. */
    context.strokeStyle = '#ccc';
    context.setLineDash([6, 6]);
    context.beginPath();
    context.moveTo(TILE_SIZE, 0.5);
    context.lineTo(viewWidth - TILE_SIZE, 0.5);
    context.moveTo(TILE_SIZE, viewHeight - 0.5);
    context.lineTo(viewWidth - TILE_SIZE, viewHeight - 0.5);
    context.stroke();
    context.setLineDash([]);

    if (prize.enabled) {
        context.strokeStyle = '#000';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(prize.x + prize.width / 2, prize.y + prize.height / 2,
                    prize.width / 2 - 1, 0, Math.PI * 2);
        context.stroke();
    }

    const drawX = body.renderX(alpha);
    const drawY = body.renderY(alpha);
    paint(drawX, drawY);
    if (drawY + body.height > viewHeight) {
        paint(drawX, drawY - viewHeight - body.height);
    }
    if (drawY < 0) {
        paint(drawX, drawY + viewHeight + body.height);
    }
}

/**
    * Draws the character at a given spot.
    *
    * @param {number} x left edge.
    * @param {number} y top edge.
*/
function paint(x, y) {
    const body = player.body;
    context.fillStyle = body.grounded ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    context.fillRect(x, y, body.width, body.height);
    context.strokeRect(x + 0.75, y + 0.75, body.width - 1.5, body.height - 1.5);
}

/**
    * Says how far round and whether the corner has been taken.
*/
function report() {
    readout.innerHTML =
        '<div><span class="name">times round</span><span class="value">'
        + laps + '   (nothing to stand on at the bottom)</span></div>'
        + '<div><span class="name">prize</span><span class="value">'
        + (won ? 'taken - it was only ever reachable from above'
            : 'up in the corner, and no jump reaches it')
        + '   (R to reset)</span></div>';
}

requestAnimationFrame(frame);
