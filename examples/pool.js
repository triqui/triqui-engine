/**
    * @file pool.js, reusing characters with 'remove' and 'add'.
    *
    * Enemies drop in from the top one at a time. An enemy that is shot or falls
    * through the gap is removed from the engine with 'remove' and stored in a
    * pool. New enemies are taken from the pool and re-added with 'add'. Six
    * enemies are created at load time and no more are ever created.
    *
    * 'add' keeps the character configuration (size, tuning, data, 'think') and
    * clears the engine state (contacts, events, touched faces, sensors, spent
    * jumps). It assigns a new identifier, so references to the old one resolve
    * to nothing.
    *
    * Two rules apply. Characters are removed after 'advance' returns, never
    * inside a callback during a step. Characters are positioned with 'place',
    * which also resets the previous position, so they are not interpolated from
    * their old location.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#....######.............#',
    '#.......................#',
    '#...............#####...#',
    '#.......................#',
    '#.......................#',
    '#.......######..........#',
    '#.......................#',
    '#.......................#',
    '#########...#############',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

/**
    * @type {number} number of enemies created.
*/
const POOL_SIZE = 6;

/**
    * @type {number} seconds between spawns, when the pool is not empty.
*/
const EVERY = 0.9;

/**
    * @type {string[]} one colour per enemy, so reused enemies can be recognised.
*/
const INKS = ['#dc3545', '#fd7e14', '#ffc107', '#198754', '#0dcaf0', '#6f42c1'];

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(3 * TILE_SIZE, 13 * TILE_SIZE - 28, 20, 28);

const viewWidth = world.columns * TILE_SIZE;
const viewHeight = world.rows * TILE_SIZE;

/* ── the pool ───────────────────────────────────────────────────────────── */

/**
    * @type {object[]} enemies in the pool.
*/
const shelf = [];

/**
    * @type {object[]} enemies in the engine.
*/
const inPlay = [];

/**
    * @type {Set<object>} enemies to return to the pool after 'advance'.
*/
const leaving = new Set();

const count = { built: 0, arrivals: 0, lastId: 0 };

/**
    * Enemy behaviour: walk and turn at walls.
    *
    * @param {object} self the character.
*/
function wander(self) {
    const body = self.body;
    const facing = body.touching.right ? -1 : body.touching.left ? 1 : body.facing;
    self.input.right = facing > 0 ? 1 : 0;
    self.input.left = facing < 0 ? 1 : 0;
}

/* Create every enemy once and move it straight to the pool. */
for (let index = 0; index < POOL_SIZE; index++) {
    const character = engine.spawn(0, 0, 20, 28, { runSpeed: 80 });
    character.body.data = { ink: INKS[index], lives: 0 };
    character.think = wander;
    engine.remove(character);
    shelf.push(character);
    count.built++;
}

/**
    * Takes an enemy from the pool and adds it at the top, in a random column.
*/
function sendOne() {
    const character = shelf.pop();
    if (!character) {
        return;
    }
    const col = 2 + Math.floor(Math.random() * (world.columns - 4));
    character.body.place(col * TILE_SIZE, -character.body.height);
    character.body.velocityX = 0;
    character.body.velocityY = 0;
    character.body.facing = Math.random() < 0.5 ? -1 : 1;

    engine.add(character);
    character.body.data.lives++;
    inPlay.push(character);
    count.arrivals++;
    count.lastId = character.body.id;
}

/**
    * Removes an enemy from the engine and returns it to the pool.
    *
    * @param {object} character the enemy.
*/
function retire(character) {
    engine.remove(character);
    inPlay.splice(inPlay.indexOf(character), 1);
    shelf.push(character);
}

/* ── shooting ───────────────────────────────────────────────────────────── */

/**
    * Fires in the player's facing direction. A hit enemy is only marked here,
    * because the callback runs during a step; it is removed after 'advance'.
*/
function fire() {
    const body = player.body;
    engine.fire(body.x + body.width / 2, body.y + 12, body.facing * 900, 0, {
        owner: body,
        life: 1.2,
        onContact: contact => {
            const hit = inPlay.find(character => character.body === contact.other);
            if (hit) {
                leaving.add(hit);
            }
            return 'stop';
        },
    });
}

/* ── input ──────────────────────────────────────────────────────────────── */

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

const keys = { left: 0, right: 0, jump: false, jumpPressed: false };

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
    if ((event.code === 'KeyK' || event.code === 'KeyJ') && !event.repeat) {
        fire();
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

/* ── the loop ───────────────────────────────────────────────────────────── */

const canvas = document.getElementById('view');
const context = canvas.getContext('2d');
const readout = document.getElementById('readout');
const ratio = Math.min(window.devicePixelRatio || 1, 2);

canvas.width = viewWidth * ratio;
canvas.height = viewHeight * ratio;
canvas.style.aspectRatio = viewWidth + ' / ' + viewHeight;
context.scale(ratio, ratio);

let previous = performance.now();
let untilNext = 0;

/**
    * @param {number} now frame timestamp.
*/
function frame(now) {
    const elapsed = Math.min((now - previous) / 1000, 0.25);
    previous = now;

    const input = player.input;
    input.left = keys.left;
    input.right = keys.right;
    input.jump = keys.jump;
    if (keys.jumpPressed) {
        input.jumpPressed = true;
    }
    keys.jumpPressed = false;

    untilNext -= elapsed;
    if (untilNext <= 0) {
        sendOne();
        untilNext = EVERY;
    }

    engine.advance(elapsed);

    /* 'advance' has returned, so characters can be removed. */
    for (const character of inPlay) {
        if (character.body.y > viewHeight) {
            leaving.add(character);
        }
    }
    for (const character of leaving) {
        retire(character);
    }
    leaving.clear();

    /* The player can also fall through the gap; respawn at the start. */
    if (player.body.y > viewHeight) {
        player.body.place(3 * TILE_SIZE, 13 * TILE_SIZE - 28);
        player.body.velocityX = 0;
        player.body.velocityY = 0;
    }

    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the active enemies, the shots, the player, and the pool
    * contents along the top.
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

    for (const character of inPlay) {
        const body = character.body;
        const x = body.renderX(alpha);
        const y = body.renderY(alpha);
        context.fillStyle = body.data.ink;
        context.fillRect(x, y, body.width, body.height);
        context.fillStyle = '#fff';
        context.fillRect(x + (body.facing > 0 ? body.width - 5 : 0), y + 7, 5, 6);
    }

    context.fillStyle = '#0d6efd';
    for (const shot of engine.projectiles) {
        context.beginPath();
        context.arc(shot.renderX(alpha), shot.renderY(alpha), 2.5, 0, Math.PI * 2);
        context.fill();
    }

    const you = player.body;
    const youX = you.renderX(alpha);
    const youY = you.renderY(alpha);
    context.fillStyle = you.grounded ? '#0d6efd' : '#fff';
    context.strokeStyle = '#0d6efd';
    context.lineWidth = 1.5;
    context.fillRect(youX, youY, you.width, you.height);
    context.strokeRect(youX + 0.75, youY + 0.75, you.width - 1.5, you.height - 1.5);
    context.fillStyle = you.grounded ? '#fff' : '#0d6efd';
    context.fillRect(youX + (you.facing > 0 ? you.width - 5 : 0), youY + 7, 5, 6);

    shelf.forEach((character, index) => {
        context.fillStyle = character.body.data.ink;
        context.fillRect(TILE_SIZE + 8 + index * 14, 8, 10, 14);
    });
}

/**
    * Writes the number of created enemies, which stays constant, and the pool
    * counts.
*/
function report() {
    readout.innerHTML = [
        ['built', count.built + '   and that is all there will ever be'],
        ['in the room', inPlay.length + '   on the shelf ' + shelf.length],
        ['arrivals', count.arrivals + '   last one given number ' + count.lastId],
        ['lives', inPlay.concat(shelf).map(character => character.body.data.lives)
            .join(' ') + '   (K shoots; the gap in the floor works too)'],
    ].map(line => '<div><span class="name">' + line[0] + '</span>'
        + '<span class="value">' + line[1] + '</span></div>').join('');
}

requestAnimationFrame(frame);
