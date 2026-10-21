/**
    * @file patrol.js, non player characters driven by 'think'.
    *
    * Four enemies use four behaviours: a walker that turns at walls, a watcher
    * that turns at ledges, a hopper that jumps as soon as it lands, and a
    * follower that chases the player when it has line of sight.
    *
    * Each enemy is a body, a controller and an input object, like the player.
    * Its 'think' function writes the input. The engine calls 'think' once per
    * physics step, not once per frame, so behaviour does not depend on the
    * refresh rate.
    *
    * 'think' reads state ('grounded', 'touching', 'fallSpeed', 'state',
    * 'facing'), not events. The 'just' flags are per frame and are cleared
    * before the steps run. To detect a transition such as landing, 'think' keeps
    * its own previous value, or uses 'onCollision'.
    *
    * Ledge detection is a single downward cast with 'world.raycaster'.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#....########...........#',
    '#.......................#',
    '#.......................#',
    '#..............#######..#',
    '#.......................#',
    '#.......................#',
    '#...#######.............#',
    '#.......................#',
    '#.......................#',
    '#.................####..#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

/**
    * @type {number} follower sight distance, in pixels.
*/
const SIGHT = 300;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(2 * TILE_SIZE, 14 * TILE_SIZE - 28, 20, 28);

/**
    * Whether there is ground just past a character's leading edge.
    *
    * Casts one ray downwards from a point in front of the feet.
    *
    * @param {object} body   the character.
    * @param {number} facing direction of travel.
    * @returns {boolean} true when there is ground ahead.
*/
function groundAhead(body, facing) {
    const x = facing > 0 ? body.x + body.width + 2 : body.x - 2;
    const y = body.y + body.height - 2;
    return Boolean(world.raycaster.cast(x, y, 0, 1, TILE_SIZE));
}

/**
    * Reverses a character's direction when it touches a wall.
    *
    * @param {object} controller the character.
    * @returns {number} the new direction.
*/
function turnAtWalls(controller) {
    const body = controller.body;
    if (body.touching.right) {
        return -1;
    }
    if (body.touching.left) {
        return 1;
    }
    return body.facing;
}

/**
    * @param {number} col column of the tile to stand on.
    * @param {number} row row of that tile.
    * @param {object} [tuning] overrides for this character.
    * @returns {object} a controller, placed on that tile.
*/
function place(col, row, tuning) {
    return engine.spawn(col * TILE_SIZE, row * TILE_SIZE - 26, 18, 26, tuning);
}

/* ── the walker: turns at walls and nothing else ─────────────────────────── */

const walker = place(3, 14, { runSpeed: 90 });
walker.think = controller => {
    const facing = turnAtWalls(controller);
    controller.input.right = facing > 0 ? 1 : 0;
    controller.input.left = facing < 0 ? 1 : 0;
};

/* ── the watcher: also refuses to walk off the end ───────────────────────── */

const watcher = place(6, 9, { runSpeed: 80 });
watcher.think = controller => {
    const body = controller.body;
    let facing = turnAtWalls(controller);
    if (body.grounded && !groundAhead(body, facing)) {
        facing = -facing;
    }
    controller.input.right = facing > 0 ? 1 : 0;
    controller.input.left = facing < 0 ? 1 : 0;
};

/* ── the hopper: jumps the instant it lands ──────────────────────────────── */

const hopper = place(8, 3, { runSpeed: 70, jumpSpeed: 430 });

/**
    * @type {boolean} whether the hopper was airborne in the previous step. Used
    *                 to detect landing inside 'think', where the per frame flags
    *                 are not reliable.
*/
let hopperWasFlying = false;

hopper.think = controller => {
    const body = controller.body;
    let facing = turnAtWalls(controller);
    if (body.grounded && !groundAhead(body, facing)) {
        facing = -facing;
    }
    controller.input.right = facing > 0 ? 1 : 0;
    controller.input.left = facing < 0 ? 1 : 0;
    controller.input.jumpPressed = body.grounded && hopperWasFlying;
    controller.input.jump = body.fallSpeed < 0;
    hopperWasFlying = !body.grounded;
};

/* ── the follower: comes after you when it can see you ───────────────────── */

const follower = place(20, 12, { runSpeed: 120, jumpSpeed: 500 });

/**
    * @type {boolean} whether the follower could see the player in the last step,
    *                 for drawing.
*/
let seen = false;

follower.think = controller => {
    const body = controller.body;
    const prey = player.body;
    const toX = prey.x + prey.width / 2 - (body.x + body.width / 2);
    const toY = prey.y + prey.height / 2 - (body.y + body.height / 2);

    seen = Math.hypot(toX, toY) < SIGHT && world.raycaster.lineOfSight(
        body.x + body.width / 2, body.y + body.height / 2,
        prey.x + prey.width / 2, prey.y + prey.height / 2,
    );

    controller.input.left = 0;
    controller.input.right = 0;
    controller.input.jumpPressed = false;

    if (!seen) {
        controller.input.jump = false;
        return;
    }

    if (Math.abs(toX) > 6) {
        controller.input.right = toX > 0 ? 1 : 0;
        controller.input.left = toX < 0 ? 1 : 0;
    }

    /* Jump when blocked or when the player is above, and release on the way
       down for a short hop. */
    const blocked = body.touching.left || body.touching.right;
    if (body.grounded && (blocked || toY < -TILE_SIZE)) {
        controller.input.jumpPressed = true;
        controller.input.jump = true;
    }
    if (body.fallSpeed > 0) {
        controller.input.jump = false;
    }
};

const minds = [
    { controller: walker, name: 'walker' },
    { controller: watcher, name: 'watcher' },
    { controller: hopper, name: 'hopper' },
    { controller: follower, name: 'follower' },
];

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
    * Draws the room, the line of sight when present, and the characters.
*/
function draw() {
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

    if (seen) {
        const hunter = follower.body;
        const prey = player.body;
        context.strokeStyle = '#adb5bd';
        context.setLineDash([3, 4]);
        context.beginPath();
        context.moveTo(hunter.renderCenterX(alpha), hunter.renderCenterY(alpha));
        context.lineTo(prey.renderCenterX(alpha), prey.renderCenterY(alpha));
        context.stroke();
        context.setLineDash([]);
    }

    for (const mind of minds) {
        paint(mind.controller.body, false);
    }
    paint(player.body, true);
}

/**
    * Draws one character, filled for the player and hollow for enemies, with a
    * facing notch.
    *
    * @param {object}  body    the body to draw.
    * @param {boolean} isYou   whether this one is the player.
*/
function paint(body, isYou) {
    const alpha = engine.alpha;
    const x = body.renderX(alpha);
    const y = body.renderY(alpha);

    context.fillStyle = isYou ? '#0d6efd' : '#fff';
    context.strokeStyle = '#0d6efd';
    context.lineWidth = 1.5;
    context.fillRect(x, y, body.width, body.height);
    context.strokeRect(x + 0.75, y + 0.75, body.width - 1.5, body.height - 1.5);

    context.fillStyle = isYou ? '#fff' : '#0d6efd';
    context.fillRect(x + (body.facing > 0 ? body.width - 4 : 0), y + 5, 4, 4);
}

/**
    * Writes one line per enemy with its direction and state.
*/
function report() {
    readout.innerHTML = minds.map(mind => {
        const controller = mind.controller;
        const body = controller.body;
        return '<div><span class="name">' + mind.name + '</span><span class="value">'
            + (body.facing > 0 ? 'going right' : 'going left').padEnd(13)
            + controller.state.padEnd(10)
            + body.fallSpeed.toFixed(0).padStart(5) + ' px/s down'
            + (mind.name === 'follower' ? (seen ? '   has you' : '   lost you') : '')
            + '</span></div>';
    }).join('');
}

requestAnimationFrame(frame);
