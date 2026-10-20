/**
    * @file chase.js, characters that are not driven by a keyboard.
    *
    * A controller reads an input object and does not care who filled it in. Here
    * three of them are filled in by a few lines of arithmetic instead: look for
    * the player, and if the level is not in the way, lean that way and jump when
    * something stops you.
    *
    * Looking is a question about geometry, so it goes straight to raycast2d
    * through the world's own caster. The engine never had to grow a vision
    * system: it was already there, underneath.
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
    '#.###.........#######...#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

/**
    * @type {number} how far a hunter can see, in pixels.
*/
const SIGHT = 320;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(40, 420, 20, 28);

/**
    * The hunters. Slower than the player and a little floatier, so being chased
    * is a nuisance rather than a death sentence.
    *
    * @type {object[]}
*/
const hunters = [
    engine.spawn(20 * TILE_SIZE, 420, 18, 24, { runSpeed: 130, jumpSpeed: 520 }),
    engine.spawn(15 * TILE_SIZE, 12 * TILE_SIZE - 24, 18, 24, { runSpeed: 150 }),
    engine.spawn(20 * TILE_SIZE, 10 * TILE_SIZE - 24, 18, 24, { runSpeed: 110 }),
];

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

/**
    * @param {object} body the body to measure.
    * @returns {number} the middle of it.
*/
const centerX = body => body.x + body.width / 2;

/**
    * @param {object} body the body to measure.
    * @returns {number} the middle of it.
*/
const centerY = body => body.y + body.height / 2;

/**
    * Writes one hunter's input for this frame.
    *
    * Seeing is a clear line to the player and nothing more. Wanting to move is
    * the sign of the distance. Jumping is what you do when the ground stops
    * being an answer: a wall in front, or nothing under you and the player above.
    *
    * @param {object} hunter  the controller to fill in.
    * @returns {boolean} whether it could see the player at all.
*/
function think(hunter) {
    const body = hunter.body;
    const prey = player.body;
    const input = hunter.input;

    const toX = centerX(prey) - centerX(body);
    const toY = centerY(prey) - centerY(body);
    const clear = Math.hypot(toX, toY) < SIGHT
        && world.raycaster.lineOfSight(centerX(body), centerY(body),
                                       centerX(prey), centerY(prey));

    input.left = 0;
    input.right = 0;
    input.jumpPressed = false;

    if (!clear) {
        input.jump = false;
        return false;
    }

    if (toX > 4) {
        input.right = 1;
    }
    if (toX < -4) {
        input.left = 1;
    }

    const stuck = body.touching.left || body.touching.right;
    const wantsUp = toY < -TILE_SIZE;
    if (body.grounded && (stuck || wantsUp)) {
        input.jumpPressed = true;
        input.jump = true;
    }
    if (body.velocityY > 0) {
        input.jump = false;                 // let go on the way down, for a short hop
    }
    return true;
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

/**
    * @type {boolean[]} whether each hunter could see the player this frame, kept
    *                   for the drawing.
*/
const seeing = hunters.map(() => false);

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

    hunters.forEach((hunter, index) => {
        seeing[index] = think(hunter);
    });

    engine.advance((now - previous) / 1000);
    previous = now;

    draw();
    requestAnimationFrame(frame);
}

/**
    * Draws the level, the lines of sight that found something, and everybody.
*/
function draw() {
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

    const prey = player.body;
    context.strokeStyle = '#999';
    context.setLineDash([3, 4]);
    context.lineWidth = 1;
    hunters.forEach((hunter, index) => {
        if (!seeing[index]) {
            return;
        }
        const body = hunter.body;
        context.beginPath();
        context.moveTo(centerX(body) - body.x + body.renderX(alpha),
                       centerY(body) - body.y + body.renderY(alpha));
        context.lineTo(centerX(prey) - prey.x + prey.renderX(alpha),
                       centerY(prey) - prey.y + prey.renderY(alpha));
        context.stroke();
    });
    context.setLineDash([]);

    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    for (const hunter of hunters) {
        const body = hunter.body;
        context.fillStyle = '#fff';
        context.fillRect(body.renderX(alpha), body.renderY(alpha), body.width, body.height);
        context.strokeRect(body.renderX(alpha) + 0.75, body.renderY(alpha) + 0.75,
                           body.width - 1.5, body.height - 1.5);
    }

    context.fillStyle = '#000';
    context.fillRect(prey.renderX(alpha), prey.renderY(alpha), prey.width, prey.height);

    readout.innerHTML = '<div><span class="name">hunting</span><span class="value">'
        + seeing.filter(Boolean).length + ' of ' + hunters.length
        + ' can see you</span></div>';
}

requestAnimationFrame(frame);
