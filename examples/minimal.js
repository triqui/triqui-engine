/**
    * @file minimal.js, the least you can write and still have a platformer.
    *
    * A map, a world, an engine, a body, and a loop that hands the engine time and
    * then draws. No abilities, no platforms, no sensors, nobody else in the room:
    * everything Triqui can do beyond this is an addition to this shape, not a
    * change to it.
    *
    * The one luxury is R, which turns on the casts the collider made on the last
    * step. Four out of each face that is leading, stopping the body at the nearest
    * of them. That is the whole of the collision, and it is worth seeing once.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '####################',
    '#..................#',
    '#..................#',
    '#.............###..#',
    '#..................#',
    '#.........###......#',
    '#..................#',
    '#.....###..........#',
    '#..................#',
    '#.###..............#',
    '#..................#',
    '####################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

/**
    * The editor's own colours, because a debug view is a thing you read.
    *
    * @type {object}
*/
const INK = {
    background: '#1e1e1e',
    grid: '#2a2a2b',
    tile: '#37373d',
    tileEdge: '#4a4a52',
    standing: '#4ec9b0',
    flying: '#dcdcaa',
    facing: '#1e1e1e',
    clear: '#569cd6',
    hit: '#f44747',
};

/**
    * @type {number} shortest a drawn ray may be. A step is a fraction of a pixel
    *                long, so a ray drawn true to length would be invisible.
*/
const MIN_RAY_LENGTH = 11;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(48, 292, 20, 28);

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
    if (event.code === 'KeyA') {
        player.input.left = 1;
    }
    if (event.code === 'KeyD') {
        player.input.right = 1;
    }
    if (event.code === 'KeyW' && !player.input.jump) {
        player.input.jump = true;
        player.input.jumpPressed = true;
    }
    if (event.code === 'KeyR' && !event.repeat) {
        engine.collider.recordRays = !engine.collider.recordRays;
    }
    mine(event);
});

addEventListener('keyup', event => {
    if (event.code === 'KeyA') {
        player.input.left = 0;
    }
    if (event.code === 'KeyD') {
        player.input.right = 0;
    }
    if (event.code === 'KeyW') {
        player.input.jump = false;
    }
});

/* A key held while the window loses focus never sends its keyup. */
addEventListener('blur', () => {
    Object.assign(player.input, { left: 0, right: 0, jump: false, jumpPressed: false });
});

const canvas = document.getElementById('view');
const context = canvas.getContext('2d');
const viewWidth = world.columns * TILE_SIZE;
const viewHeight = world.rows * TILE_SIZE;
const ratio = Math.min(window.devicePixelRatio || 1, 2);

canvas.width = viewWidth * ratio;
canvas.height = viewHeight * ratio;
canvas.style.aspectRatio = viewWidth + ' / ' + viewHeight;
context.scale(ratio, ratio);

let previous = performance.now();

/**
    * One frame: give the engine the time that has passed, then draw.
    *
    * @param {number} now when this frame began.
*/
function frame(now) {
    engine.advance((now - previous) / 1000);
    previous = now;

    const body = player.body;
    /* Drawn between the last two physics steps, or it moves in the jerks of the
       fixed step instead of the line it is really travelling. */
    const alpha = engine.alpha;
    const drawX = body.renderX(alpha);
    const drawY = body.renderY(alpha);

    context.fillStyle = INK.background;
    context.fillRect(0, 0, viewWidth, viewHeight);

    context.strokeStyle = INK.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let col = 1; col < world.columns; col++) {
        context.moveTo(col * TILE_SIZE + 0.5, 0);
        context.lineTo(col * TILE_SIZE + 0.5, viewHeight);
    }
    for (let row = 1; row < world.rows; row++) {
        context.moveTo(0, row * TILE_SIZE + 0.5);
        context.lineTo(viewWidth, row * TILE_SIZE + 0.5);
    }
    context.stroke();

    context.fillStyle = INK.tile;
    context.strokeStyle = INK.tileEdge;
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

    if (engine.collider.recordRays) {
        drawRays(drawX - body.x, drawY - body.y);
    }

    context.fillStyle = body.grounded ? INK.standing : INK.flying;
    context.fillRect(drawX, drawY, body.width, body.height);

    /* A notch on the side it is looking. The engine keeps the facing because a
       dash with no direction held has to go somewhere; here it just shows. */
    context.fillStyle = INK.facing;
    context.fillRect(drawX + (body.facing > 0 ? body.width - 5 : 0), drawY + 7, 5, 6);

    requestAnimationFrame(frame);
}

/**
    * Draws the casts of the last physics step, stretched to a readable minimum.
    *
    * They were cast from where the body is and are drawn from where the body is
    * drawn, a fraction of a step ahead, so that they stay attached to it.
    *
    * @param {number} offsetX distance between the body and its drawing.
    * @param {number} offsetY distance between the body and its drawing.
*/
function drawRays(offsetX, offsetY) {
    for (const ray of engine.collider.rays) {
        const length = Math.max(ray.length, MIN_RAY_LENGTH);
        const startX = ray.x + offsetX;
        const startY = ray.y + offsetY;
        const endX = startX + ray.dirX * length;
        const endY = startY + ray.dirY * length;

        context.strokeStyle = ray.hit ? INK.hit : INK.clear;
        context.lineWidth = 1;
        context.setLineDash(ray.hit ? [] : [3, 3]);
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
        context.setLineDash([]);

        if (ray.hit) {
            context.fillStyle = INK.hit;
            context.beginPath();
            context.arc(endX, endY, 2.5, 0, Math.PI * 2);
            context.fill();
        }
    }
}

requestAnimationFrame(frame);
