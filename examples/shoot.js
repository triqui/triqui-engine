/**
    * @file shoot.js, four kinds of shot that are the same shot.
    *
    * A projectile is not a body. It is a point, and once a step it asks raycast2d
    * one question: what lies between where I am and where I am about to be? The
    * answer comes back complete and sorted, with every wall, platform and character
    * on the segment listed nearest first, so nothing can be skipped at any speed,
    * and a shot sees everything in its path and not only the first of it.
    *
    * What happens at each of those is the game's to say. Every contact is
    * recorded, and 'onContact' is asked about each in turn; answer 'pass' and the
    * shot goes on, answer anything else and it stops there. The four modes below
    * differ in nothing but that answer, and in whether gravity pulls on them.
    *
    * Shots also shove what they reach, with the same 'impulse' a spring uses, and
    * the characters take that and carry on walking. The two systems know nothing
    * about each other and only meet in a callback.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#.................####..#',
    '#.......................#',
    '#.......................#',
    '#....=======............#',
    '#.......................#',
    '#.............######....#',
    '#.......................#',
    '#.......................#',
    '#...####................#',
    '#.......................#',
    '#.......................#',
    '#########################',
];
const IDS = { '.': 0, '#': 1, '=': 2 };
const MAP = LEGEND.map(row => [...row].map(char => IDS[char]));

/**
    * The four answers. Each is only what to do on reaching something, and how
    * long to fly, and whether to fall.
    *
    * @type {Array<{name: string, key: string, speed: number, life: number,
    *               gravity: number, decide: Function, about: string}>}
*/
const MODES = [
    {
        name: 'bullet', key: '1', speed: 900, life: 1.5, gravity: 0,
        decide: () => 'stop',
        about: 'stops at the first thing it reaches',
    },
    {
        name: 'piercing', key: '2', speed: 900, life: 1.5, gravity: 0,
        decide: contact => (contact.kind === 'body' ? 'pass' : 'stop'),
        about: 'goes through characters, stops at walls',
    },
    {
        name: 'ghost', key: '3', speed: 520, life: 1.2, gravity: 0,
        decide: () => 'pass',
        about: 'goes through everything and runs out',
    },
    {
        name: 'lob', key: '4', speed: 520, life: 3, gravity: 1400,
        decide: contact => (contact.kind === 'body' ? 'pass' : 'stop'),
        about: 'falls, goes through characters, lands on walls',
    },
];

const world = new TriquiWorld({
    map: MAP, tileSize: TILE_SIZE, definitions: { 2: { oneWay: true } },
});
const engine = new TriquiEngine(world);
const player = engine.spawn(2 * TILE_SIZE, 14 * TILE_SIZE - 28, 20, 28);
player.body.data = { name: 'you' };

/* ── the targets: walkers that turn at walls and at the ends of ledges ───── */

/**
    * @type {string[]} one colour each.
*/
const WALKER_INKS = ['#e0503f', '#e6962a', '#3fa8e0', '#9a5ce0', '#3fbf8a'];

/**
    * Asks whether there is still ground just beyond a character's toes.
    *
    * @param {object} body   the character.
    * @param {number} facing which way it is going.
    * @returns {boolean} true when it can keep walking.
*/
function groundAhead(body, facing) {
    const x = facing > 0 ? body.x + body.width + 2 : body.x - 2;
    return Boolean(world.raycaster.cast(x, body.y + body.height - 2, 0, 1, TILE_SIZE));
}

const walkers = [
    { col: 8, row: 14 }, { col: 15, row: 14 }, { col: 20, row: 14 },
    { col: 15, row: 8 }, { col: 19, row: 3 },
].map((spot, index) => {
    const controller = engine.spawn(spot.col * TILE_SIZE, spot.row * TILE_SIZE - 28,
        20, 28, { runSpeed: 70 });
    controller.body.data = { name: 'walker ' + (index + 1), ink: WALKER_INKS[index],
        hits: 0, flash: 0 };
    controller.think = self => {
        const body = self.body;
        let facing = body.touching.right ? -1 : body.touching.left ? 1 : body.facing;
        if (body.grounded && !groundAhead(body, facing)) {
            facing = -facing;
        }
        self.input.right = facing > 0 ? 1 : 0;
        self.input.left = facing < 0 ? 1 : 0;
    };
    return controller;
});

/* ── firing ─────────────────────────────────────────────────────────────── */

/**
    * @type {number} which of the four is loaded.
*/
let mode = 0;

/**
    * @type {object[]} what the last shot reached, for the panel.
*/
let lastContacts = [];

/**
    * @type {string} how the last shot ended.
*/
let lastEnd = 'nothing fired yet';

/**
    * @type {Array<{x: number, y: number, age: number}>} where shots stopped, kept
    *                                                    for a moment to be seen.
*/
const marks = [];

/**
    * Fires the loaded kind of shot the way the character is facing.
*/
function fire() {
    const body = player.body;
    const kind = MODES[mode];
    const aimX = body.facing;
    const aimY = kind.gravity > 0 ? -0.9 : 0;
    const length = Math.hypot(aimX, aimY);

    engine.fire(
        body.x + body.width / 2, body.y + 12,
        (aimX / length) * kind.speed, (aimY / length) * kind.speed,
        {
            owner: body,
            life: kind.life,
            gravityY: kind.gravity,
            onContact: contact => {
                /* Whatever was reached gets a shove along the shot, whether the
                   shot stops there or not. */
                if (contact.kind === 'body') {
                    const shot = contact.projectile;
                    const pushX = Math.sign(shot.velocityX) || 1;
                    contact.other.impulse(pushX * 240, -160);
                    contact.data.hits++;
                    contact.data.flash = 0.25;
                }
                return kind.decide(contact);
            },
            onEnd: (projectile, reason) => {
                lastContacts = projectile.contacts;
                lastEnd = reason;
                if (reason === 'stopped') {
                    marks.push({ x: projectile.x, y: projectile.y, age: 0 });
                }
            },
        },
    );
}

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
    const chosen = MODES.findIndex(kind => event.key === kind.key);
    if (chosen >= 0) {
        mode = chosen;
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

/* ── drawing ────────────────────────────────────────────────────────────── */

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
    const elapsed = (now - previous) / 1000;
    previous = now;

    const input = player.input;
    input.left = keys.left;
    input.right = keys.right;
    input.jump = keys.jump;
    if (keys.jumpPressed) {
        input.jumpPressed = true;
    }
    keys.jumpPressed = false;

    engine.advance(elapsed);

    for (const walker of walkers) {
        walker.body.data.flash = Math.max(0, walker.body.data.flash - elapsed);
    }
    for (const mark of marks) {
        mark.age += elapsed;
    }
    while (marks.length && marks[0].age > 0.6) {
        marks.shift();
    }

    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the walkers, the shots in flight with a short tail, and the
    * places shots have recently stopped.
*/
function draw() {
    const alpha = engine.alpha;

    context.fillStyle = '#fff';
    context.fillRect(0, 0, viewWidth, viewHeight);

    context.lineWidth = 1;
    for (let row = 0; row < world.rows; row++) {
        for (let col = 0; col < world.columns; col++) {
            const id = world.tileAt(col, row);
            const x = col * TILE_SIZE;
            const y = row * TILE_SIZE;
            if (id === 1) {
                context.fillStyle = '#bbb';
                context.strokeStyle = '#555';
                context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                context.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
            }
            if (id === 2) {
                context.fillStyle = '#555';
                context.fillRect(x, y, TILE_SIZE, 4);
            }
        }
    }

    for (const walker of walkers) {
        const body = walker.body;
        const x = body.renderX(alpha);
        const y = body.renderY(alpha);
        context.fillStyle = body.data.flash > 0 ? '#000' : body.data.ink;
        context.fillRect(x, y, body.width, body.height);
        context.fillStyle = '#fff';
        context.fillRect(x + (body.facing > 0 ? body.width - 5 : 0), y + 7, 5, 6);
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

    /* A projectile is a point; the tail is where it was a step ago, which is
       also exactly the segment it just swept. */
    context.strokeStyle = '#000';
    context.lineWidth = 2;
    for (const shot of engine.projectiles) {
        context.beginPath();
        context.moveTo(shot.previousX, shot.previousY);
        context.lineTo(shot.renderX(alpha), shot.renderY(alpha));
        context.stroke();
        context.fillStyle = '#000';
        context.beginPath();
        context.arc(shot.renderX(alpha), shot.renderY(alpha), 2.5, 0, Math.PI * 2);
        context.fill();
    }

    for (const mark of marks) {
        const fade = 1 - mark.age / 0.6;
        context.strokeStyle = 'rgba(0, 0, 0, ' + fade.toFixed(2) + ')';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(mark.x, mark.y, 4 + mark.age * 20, 0, Math.PI * 2);
        context.stroke();
    }
}

/**
    * Says what is loaded, and what the last shot reached, in the order it
    * reached them.
*/
function report() {
    const kind = MODES[mode];
    const trail = lastContacts.length
        ? lastContacts.map(contact => (contact.kind === 'tile'
            ? 'wall ' + contact.cellX + ',' + contact.cellY
            : contact.data.name)).join('  >  ')
        : '-';

    readout.innerHTML = [
        ['loaded', kind.key + ' ' + kind.name.padEnd(10) + kind.about],
        ['last shot', trail],
        ['ended', lastEnd],
        ['hits taken', walkers.map(walker => walker.body.data.hits).join('  ')],
    ].map(line => '<div><span class="name">' + line[0] + '</span>'
        + '<span class="value">' + line[1] + '</span></div>').join('');
}

requestAnimationFrame(frame);
