/**
    * @file minimal.js, the smallest complete setup.
    *
    * A map, a world, an engine, one character and a loop that advances the
    * engine and draws. It uses no abilities, platforms or sensors. Every other
    * example extends this structure.
    *
    * R shows the rays cast by the collider in the last step: four from each
    * leading face. The body stops at the nearest hit.
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
    * Colour palette, based on the Visual Studio Code dark theme.
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
    * @type {number} minimum drawn ray length. Rays cover a fraction of a pixel
    *                per step, so they are lengthened to be visible.
*/
const MIN_RAY_LENGTH = 11;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(48, 292, 20, 28);

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

/* Release all keys on blur: a key held while the window loses focus never
   sends keyup. */
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
    * Advances the engine by the elapsed time and draws.
    *
    * @param {number} now frame timestamp.
*/
function frame(now) {
    engine.advance((now - previous) / 1000);
    previous = now;

    const body = player.body;
    /* Interpolated position, so movement does not stutter at the step rate. */
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

    /* Facing notch, from 'body.facing'. */
    context.fillStyle = INK.facing;
    context.fillRect(drawX + (body.facing > 0 ? body.width - 5 : 0), drawY + 7, 5, 6);

    requestAnimationFrame(frame);
}

/**
    * Draws the casts of the last physics step, lengthened to a minimum length.
    *
    * Rays are offset by the difference between the body position and its
    * interpolated draw position, so they stay attached to the drawn body.
    *
    * @param {number} offsetX draw position minus body position.
    * @param {number} offsetY draw position minus body position.
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
