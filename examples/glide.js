/**
    * @file glide.js, gliding by changing tuning at runtime.
    *
    * Take the lift, walk to the end of the ledge, step off and hold J. The pad on
    * the far side is out of reach with a normal fall and within reach when
    * gliding.
    *
    * The engine has no glide feature. Tuning is a per character object read at
    * the start of every step, so gliding sets some of its values while the
    * button is held and restores them on release. Other characters are not
    * affected.
    *
    * Two variants are provided. Capping 'maxFallSpeed' gives a constant descent
    * rate after a short acceleration. Reducing gravity keeps the character
    * accelerating, more slowly, so the trajectory keeps getting steeper.
*/

import { TriquiWorld, TriquiEngine, DEFAULT_TUNING } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#..####.................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#................######.#',
    '#.......................#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

/**
    * The two glide variants. Each one changes a few tuning values while the
    * button is held.
    *
    * @type {Array<{name: string, key: string, about: string, apply: Function}>}
*/
const GLIDES = [
    {
        name: 'canopy',
        key: '1',
        about: 'a cap on falling: speeds up as usual, then holds',
        apply: tuning => {
            tuning.maxFallSpeed = 130;
        },
    },
    {
        name: 'leaf',
        key: '2',
        about: 'weaker gravity: keeps gathering speed, slowly',
        apply: tuning => {
            tuning.gravityY = 200;
        },
    },
];

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(2 * TILE_SIZE, 14 * TILE_SIZE - 28, 20, 28);

/* A lift takes the character up, so the level only tests the descent. */
engine.addPlatform(TILE_SIZE, 13 * TILE_SIZE, 64, 12, {
    points: [{ x: TILE_SIZE, y: 3 * TILE_SIZE }],
    speed: 90,
});

/**
    * @type {number} index of the selected variant.
*/
let glide = 0;

/**
    * @type {boolean} whether the button is held and the character is falling.
*/
let gliding = false;

/**
    * @type {{x: number, y: number}} start position of the current flight.
*/
let launched = { x: 0, y: 0 };

/**
    * @type {number} distance covered by the last flight.
*/
let carried = 0;

/**
    * @type {number} number of landings on the pad.
*/
let arrivals = 0;

/**
    * @type {Array<{x: number, y: number}>} positions of the current flight, for
    *                                       drawing the trail.
*/
const trail = [];

/**
    * Prevents the default action of a key handled by this page, unless a modifier
    * is held.
    *
    * @param {object} event the key event.
*/
function mine(event) {
    const ours = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
    if (!event.ctrlKey && !event.metaKey && !event.altKey && ours.includes(event.code)) {
        event.preventDefault();
    }
}

const keys = { left: 0, right: 0, jump: false, jumpPressed: false, glide: false };

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
    if (event.code === 'KeyJ' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        keys.glide = true;
    }
    const chosen = GLIDES.findIndex(kind => event.key === kind.key);
    if (chosen >= 0) {
        glide = chosen;
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
    if (event.code === 'KeyJ' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        keys.glide = false;
    }
});

addEventListener('blur', () => {
    Object.assign(keys, { left: 0, right: 0, jump: false, jumpPressed: false, glide: false });
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
    const body = player.body;
    const input = player.input;
    input.left = keys.left;
    input.right = keys.right;
    input.jump = keys.jump;
    if (keys.jumpPressed) {
        input.jumpPressed = true;
    }
    keys.jumpPressed = false;

    /*
        * Restore both values first, then apply the selected variant, so switching
        * variant in the air does not leave the other variant's values set.
    */
    gliding = keys.glide && !body.grounded && body.fallSpeed > 0;
    player.tuning.maxFallSpeed = DEFAULT_TUNING.maxFallSpeed;
    player.tuning.gravityY = DEFAULT_TUNING.gravityY;
    if (gliding) {
        GLIDES[glide].apply(player.tuning);
    }

    const wasFlying = !body.grounded;
    engine.advance((now - previous) / 1000);
    previous = now;

    if (!wasFlying && !body.grounded) {
        launched = { x: body.x, y: body.y };
        trail.length = 0;
    }
    if (!body.grounded) {
        carried = body.x - launched.x;
        if (trail.length === 0 || Math.hypot(body.x - trail[trail.length - 1].x,
            body.y - trail[trail.length - 1].y) > 6) {
            trail.push({ x: body.x + body.width / 2, y: body.y + body.height / 2 });
        }
    }
    if (body.justLanded && body.y + body.height === 11 * TILE_SIZE) {
        arrivals++;
    }

    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the lift, the flight trail and the character.
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

    context.fillStyle = '#777';
    for (const platform of engine.platforms) {
        context.fillRect(platform.renderX(alpha), platform.renderY(alpha),
                         platform.width, platform.height);
    }

    if (trail.length > 1) {
        context.strokeStyle = '#aaa';
        context.lineWidth = 1;
        context.setLineDash([2, 4]);
        context.beginPath();
        context.moveTo(trail[0].x, trail[0].y);
        for (const point of trail) {
            context.lineTo(point.x, point.y);
        }
        context.stroke();
        context.setLineDash([]);
    }

    const drawX = body.renderX(alpha);
    const drawY = body.renderY(alpha);
    context.fillStyle = body.grounded ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    context.fillRect(drawX, drawY, body.width, body.height);
    context.strokeRect(drawX + 0.75, drawY + 0.75, body.width - 1.5, body.height - 1.5);
    context.fillStyle = body.grounded ? '#fff' : '#000';
    context.fillRect(drawX + (body.facing > 0 ? body.width - 5 : 0), drawY + 7, 5, 6);

    /* Wings, drawn while gliding. */
    if (gliding) {
        context.strokeStyle = '#000';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(drawX - 9, drawY + 4);
        context.lineTo(drawX + body.width / 2, drawY + 11);
        context.lineTo(drawX + body.width + 9, drawY + 4);
        context.stroke();
    }
}

/**
    * Writes the selected variant, the fall speed and the last flight distance.
*/
function report() {
    const kind = GLIDES[glide];
    const body = player.body;
    readout.innerHTML = [
        ['glide', kind.key + ' ' + kind.name.padEnd(8) + kind.about],
        ['falling at', body.fallSpeed.toFixed(0).padStart(4) + ' px/s'
            + (gliding ? '   holding J' : '')],
        ['carried', (carried / TILE_SIZE).toFixed(1).padStart(5) + ' tiles across'],
        ['reached the pad', arrivals + ' times'],
    ].map(line => '<div><span class="name">' + line[0] + '</span>'
        + '<span class="value">' + line[1] + '</span></div>').join('');
}

requestAnimationFrame(frame);
