/**
    * @file pool.js, the same six characters, over and over.
    *
    * They drop in from the top one at a time. Shoot one, or let it fall through
    * the gap in the floor, and it is not destroyed: it is taken out of the engine
    * with 'remove' and put on a shelf. The next time one is needed, the shelf is
    * tried first, and 'add' puts it back. Six are built when the page loads and
    * the panel will say six for as long as you leave it open.
    *
    * 'add' is what makes that work. It keeps everything that belongs to the
    * character, such as its size, tuning, data and the mind in 'think', and clears
    * everything that was the engine's record of its last life: contacts, events,
    * what it was touching or standing in, how many jumps it had left. And it hands
    * out a new number each time, so anything still holding the old one finds
    * nothing rather than a different character wearing the same name.
    *
    * There are two habits worth copying. Characters go back on the shelf after
    * 'advance' returns, never from inside a callback while the engine is in the
    * middle of a step. And they come off it with 'place', which moves the position
    * they are drawn from as well, so they do not slide in from wherever they were
    * last.
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
    * @type {number} how many are ever built.
*/
const POOL_SIZE = 6;

/**
    * @type {number} seconds between arrivals, when there is one to send.
*/
const EVERY = 0.9;

/**
    * @type {string[]} one colour each, so a character can be recognised coming
    *                   back for another life.
*/
const INKS = ['#e0503f', '#e6962a', '#d6c21f', '#3fbf8a', '#3fa8e0', '#9a5ce0'];

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(3 * TILE_SIZE, 13 * TILE_SIZE - 28, 20, 28);

const viewWidth = world.columns * TILE_SIZE;
const viewHeight = world.rows * TILE_SIZE;

/* ── the pool ───────────────────────────────────────────────────────────── */

/**
    * @type {object[]} characters waiting on the shelf.
*/
const shelf = [];

/**
    * @type {object[]} characters in the room.
*/
const inPlay = [];

/**
    * @type {Set<object>} characters to go back on the shelf once the step is over.
*/
const leaving = new Set();

const count = { built: 0, arrivals: 0, lastId: 0 };

/**
    * The mind every one of them shares: walk, and turn at a wall.
    *
    * @param {object} self the character.
*/
function wander(self) {
    const body = self.body;
    const facing = body.touching.right ? -1 : body.touching.left ? 1 : body.facing;
    self.input.right = facing > 0 ? 1 : 0;
    self.input.left = facing < 0 ? 1 : 0;
}

/* All of them are built once and put straight back on the shelf. */
for (let index = 0; index < POOL_SIZE; index++) {
    const character = engine.spawn(0, 0, 20, 28, { runSpeed: 80 });
    character.body.data = { ink: INKS[index], lives: 0 };
    character.think = wander;
    engine.remove(character);
    shelf.push(character);
    count.built++;
}

/**
    * Takes one off the shelf and drops it in from the top, at a random column.
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
    * Puts one back on the shelf.
    *
    * @param {object} character the one leaving.
*/
function retire(character) {
    engine.remove(character);
    inPlay.splice(inPlay.indexOf(character), 1);
    shelf.push(character);
}

/* ── shooting ───────────────────────────────────────────────────────────── */

/**
    * Fires the way the player is facing. A character hit is only marked here;
    * the engine is in the middle of a step, and it goes back on the shelf once
    * that step is over.
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
    * Swallows a key press, but only when it is one of ours and nothing is being
    * held with it.
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
    * @param {number} now when this frame began.
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

    /* The step is over: now the world can be rearranged. */
    for (const character of inPlay) {
        if (character.body.y > viewHeight) {
            leaving.add(character);
        }
    }
    for (const character of leaving) {
        retire(character);
    }
    leaving.clear();

    /* The player can fall through the gap too; bring them back to the start. */
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
    * Draws the room, the characters in play, the shots, the player, and the shelf
    * along the top, where the waiting characters are shown in their own colours.
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

    for (const character of inPlay) {
        const body = character.body;
        const x = body.renderX(alpha);
        const y = body.renderY(alpha);
        context.fillStyle = body.data.ink;
        context.fillRect(x, y, body.width, body.height);
        context.fillStyle = '#fff';
        context.fillRect(x + (body.facing > 0 ? body.width - 5 : 0), y + 7, 5, 6);
    }

    context.fillStyle = '#000';
    for (const shot of engine.projectiles) {
        context.beginPath();
        context.arc(shot.renderX(alpha), shot.renderY(alpha), 2.5, 0, Math.PI * 2);
        context.fill();
    }

    const you = player.body;
    const youX = you.renderX(alpha);
    const youY = you.renderY(alpha);
    context.fillStyle = you.grounded ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    context.fillRect(youX, youY, you.width, you.height);
    context.strokeRect(youX + 0.75, youY + 0.75, you.width - 1.5, you.height - 1.5);
    context.fillStyle = you.grounded ? '#fff' : '#000';
    context.fillRect(youX + (you.facing > 0 ? you.width - 5 : 0), youY + 7, 5, 6);

    shelf.forEach((character, index) => {
        context.fillStyle = character.body.data.ink;
        context.fillRect(TILE_SIZE + 8 + index * 14, 8, 10, 14);
    });
}

/**
    * The count that matters is the first one, and it does not move.
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
