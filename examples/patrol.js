/**
    * @file patrol.js, characters that are not you.
    *
    * There are four of them, and none has a keyboard: a walker that turns at walls,
    * a watcher that will not step off a ledge, a hopper that jumps the moment it
    * lands, and a follower that comes after you when it can see you.
    *
    * All four are the same thing the player is: a body, a controller and an input
    * object. What differs is who fills the input in. Each has a 'think', which the
    * engine calls once per physics step rather than once per frame, so their
    * reflexes do not depend on the refresh rate.
    *
    * What a mind reads is state, not events: 'grounded', 'touching', 'fallSpeed',
    * 'state', 'facing'. The frame's 'just' flags are cleared at the top of the
    * frame and would be empty by the time it ran. An edge that a mind needs, such
    * as the moment of landing here, is either kept as a line of its own memory or
    * taken from 'onCollision', which fires the instant it happens.
    *
    * Looking ahead is a cast: the same raycast2d the collider uses, asked a
    * question the collider never asks.
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
    * @type {number} how far the follower can see.
*/
const SIGHT = 300;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(2 * TILE_SIZE, 14 * TILE_SIZE - 28, 20, 28);

/**
    * Asks whether there is still ground just beyond a character's leading edge.
    *
    * One cast, straight down from a point past the toes. It is the oldest
    * question in the genre and the collider has no reason to ask it, so it is
    * asked here, of the world's own caster.
    *
    * @param {object} body   the character.
    * @param {number} facing which way it is going.
    * @returns {boolean} true when it can keep walking.
*/
function groundAhead(body, facing) {
    const x = facing > 0 ? body.x + body.width + 2 : body.x - 2;
    const y = body.y + body.height - 2;
    return Boolean(world.raycaster.cast(x, y, 0, 1, TILE_SIZE));
}

/**
    * Turns a character round when it meets a wall.
    *
    * @param {object} controller the character.
    * @returns {number} which way it should now be going.
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
    * @returns {object} a controller, standing on that tile.
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
    * @type {boolean} whether the hopper was in the air last step. A mind keeping
    *                 its own memory of an edge, because the frame's flags are not
    *                 its to read.
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
    * @type {boolean} whether the follower could see the player last step, kept for
    *                 the drawing.
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

    /* Jump when the way is blocked or the prey is above, and let go on the way
       down so the hop is only as big as it needs to be. */
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
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the line of sight when there is one, and everybody.
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

    if (seen) {
        const hunter = follower.body;
        const prey = player.body;
        context.strokeStyle = '#999';
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
    * Draws one character, filled if it is the player and hollow if it is not,
    * with a notch on the side it is facing.
    *
    * @param {object}  body    the body to draw.
    * @param {boolean} isYou   whether this one is the player.
*/
function paint(body, isYou) {
    const alpha = engine.alpha;
    const x = body.renderX(alpha);
    const y = body.renderY(alpha);

    context.fillStyle = isYou ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    context.fillRect(x, y, body.width, body.height);
    context.strokeRect(x + 0.75, y + 0.75, body.width - 1.5, body.height - 1.5);

    context.fillStyle = isYou ? '#fff' : '#000';
    context.fillRect(x + (body.facing > 0 ? body.width - 4 : 0), y + 5, 4, 4);
}

/**
    * One line per mind, saying which way it is going and what it is doing.
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
