/**
    * @file wrap.js, vertical screen wrap.
    *
    * A character that falls out of the bottom reappears at the top, in the same
    * column and with the same velocity. The ledge at the top left cannot be
    * reached by jumping; the only way onto it is to fall through the bottom in
    * the right column.
    *
    * The wrap is game code. The grid reports cells outside the map as empty, so
    * a body leaving the map keeps falling. 'place' moves the body without
    * interpolation, and a body re-entering the map collides with tiles
    * normally.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;

/* The demo room without floor and ceiling, plus a ledge in the top left corner
   that cannot be reached from below. */
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

/* Prize sensor, on the corner ledge. */
const prize = engine.addSensor(5 * TILE_SIZE, TILE_SIZE - 20, 16, 16, 'prize');

/**
    * @type {number} number of wraps.
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

    /*
        * Moves the body up by exactly the room height, keeping the sub pixel
        * offset past the edge. 'place' is used instead of assigning y, otherwise
        * the frame would be interpolated across the whole room.
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
    * Draws the room, the prize and the character. Near an edge the character is
    * drawn a second time on the opposite side, so the wrap is continuous.
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

    /* Markers for the open edges. */
    context.strokeStyle = '#ced4da';
    context.setLineDash([6, 6]);
    context.beginPath();
    context.moveTo(TILE_SIZE, 0.5);
    context.lineTo(viewWidth - TILE_SIZE, 0.5);
    context.moveTo(TILE_SIZE, viewHeight - 0.5);
    context.lineTo(viewWidth - TILE_SIZE, viewHeight - 0.5);
    context.stroke();
    context.setLineDash([]);

    if (prize.enabled) {
        context.strokeStyle = '#ffc107';
        context.lineWidth = 2;
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
    * Draws the character at the given position.
    *
    * @param {number} x left edge.
    * @param {number} y top edge.
*/
function paint(x, y) {
    const body = player.body;
    context.fillStyle = body.grounded ? '#0d6efd' : '#fff';
    context.strokeStyle = '#0d6efd';
    context.lineWidth = 1.5;
    context.fillRect(x, y, body.width, body.height);
    context.strokeRect(x + 0.75, y + 0.75, body.width - 1.5, body.height - 1.5);
}

/**
    * Writes the wrap count and whether the prize was taken.
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
