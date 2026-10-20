/**
    * @file tuning.js, the numbers, with your hands on them.
    *
    * Everything that decides how a character feels is a plain object on the
    * character itself, read fresh at the top of every step. So there is nothing to
    * rebuild and nothing to restart: the sliders write into 'player.tuning' and
    * the next step is already different.
    *
    * The room works like a ruler. It has four bars at two, three, four and five
    * tiles above the floor, and two gaps in the floor, two and three tiles wide.
    * The default character reaches the first bar and no further, which is a
    * statement about the numbers rather than about the engine. Change them and the
    * same room asks a different question. Two jumps in the air will take you to the
    * top of it; so will one jump of eight hundred, and so will halving the gravity.
    *
    * The figures under the sliders are worked out from the numbers rather than
    * measured: a jump reaches its speed squared over twice the gravity, and stays
    * up for twice its speed over the gravity, and in that time a run carries it
    * as far as its speed will. Watching those three move while you drag is the
    * quickest way to learn what any of them mean.
*/

import { TriquiWorld, TriquiEngine, DEFAULT_TUNING } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.............###.......#',
    '#.........###...........#',
    '#.....###...............#',
    '#.###...................#',
    '#.......................#',
    '#################..##...#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const SPAWN_X = 2 * TILE_SIZE;
const SPAWN_Y = 11 * TILE_SIZE - 28;

/**
    * The knobs, in the order they are worth turning. Everything here is a key of
    * the tuning object and nothing else knows about them.
    *
    * @type {Array<{key: string, label: string, min: number, max: number,
    *               step: number, unit: string}>}
*/
const KNOBS = [
    { key: 'runSpeed', label: 'run speed', min: 40, max: 520, step: 10, unit: 'px/s' },
    { key: 'runAcceleration', label: 'acceleration', min: 200, max: 6000, step: 100,
        unit: 'px/s²' },
    { key: 'groundFriction', label: 'ground friction', min: 0, max: 6000, step: 100,
        unit: 'px/s²' },
    { key: 'airFriction', label: 'air friction', min: 0, max: 3000, step: 50, unit: 'px/s²' },
    { key: 'gravityY', label: 'gravity', min: 300, max: 6000, step: 100, unit: 'px/s²' },
    { key: 'maxFallSpeed', label: 'terminal fall', min: 100, max: 2000, step: 50, unit: 'px/s' },
    { key: 'jumpSpeed', label: 'jump', min: 100, max: 1200, step: 20, unit: 'px/s' },
    { key: 'jumpCut', label: 'jump cut', min: 0, max: 800, step: 20, unit: 'px/s' },
    { key: 'coyoteTime', label: 'coyote time', min: 0, max: 0.4, step: 0.01, unit: 's' },
    { key: 'jumpBuffer', label: 'jump buffer', min: 0, max: 0.4, step: 0.01, unit: 's' },
    { key: 'airJumps', label: 'jumps in the air', min: 0, max: 3, step: 1, unit: '' },
    { key: 'wallSlideSpeed', label: 'wall slide', min: 0, max: 240, step: 10, unit: 'px/s' },
    { key: 'wallJumpAway', label: 'wall jump', min: 0, max: 520, step: 20, unit: 'px/s' },
    { key: 'dashes', label: 'dashes', min: 0, max: 3, step: 1, unit: '' },
];

/**
    * These are complete characters for the same room. Each is only a handful of the
    * numbers above set somewhere else.
    *
    * @type {Array<{name: string, tuning: object}>}
*/
const PRESETS = [
    { name: 'default', tuning: {} },
    {
        name: 'moon',
        tuning: { gravityY: 600, jumpSpeed: 360, maxFallSpeed: 320, airFriction: 250,
            runSpeed: 140, runAcceleration: 900 },
    },
    {
        name: 'ice',
        tuning: { groundFriction: 200, runAcceleration: 700, runSpeed: 280 },
    },
    {
        name: 'anvil',
        tuning: { gravityY: 4800, jumpSpeed: 820, jumpCut: 500, runSpeed: 170,
            maxFallSpeed: 1400, runAcceleration: 5000, groundFriction: 5200 },
    },
    {
        name: 'acrobat',
        tuning: { runSpeed: 280, airJumps: 2, dashes: 2, wallSlideSpeed: 90,
            wallJumpAway: 320, coyoteTime: 0.14, jumpBuffer: 0.16 },
    },
];

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(SPAWN_X, SPAWN_Y, 20, 28);

/* ── the panel ──────────────────────────────────────────────────────────── */

const controls = document.getElementById('controls');
const figures = document.getElementById('figures');

/**
    * @type {object} the slider elements, by tuning key.
*/
const sliders = {};

/**
    * @type {object} the elements showing each slider's value.
*/
const values = {};

for (const knob of KNOBS) {
    const row = document.createElement('label');
    row.className = 'knob';

    const name = document.createElement('span');
    name.className = 'knob-name';
    name.textContent = knob.label;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = knob.min;
    slider.max = knob.max;
    slider.step = knob.step;
    slider.value = player.tuning[knob.key];

    const value = document.createElement('span');
    value.className = 'knob-value';

    slider.addEventListener('input', () => {
        /* This is all of it. The tuning is read at the top of every step, so the
           next one already runs on the new number. */
        player.tuning[knob.key] = Number(slider.value);
        refresh();
    });

    row.append(name, slider, value);
    controls.append(row);
    sliders[knob.key] = slider;
    values[knob.key] = value;
}

const buttons = document.getElementById('presets');

for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = preset.name;
    button.addEventListener('click', () => {
        Object.assign(player.tuning, DEFAULT_TUNING, preset.tuning);
        for (const knob of KNOBS) {
            sliders[knob.key].value = player.tuning[knob.key];
        }
        refresh();
        button.blur();
    });
    buttons.append(button);
}

const back = document.createElement('button');
back.type = 'button';
back.textContent = 'back to the start';
back.addEventListener('click', () => {
    player.body.place(SPAWN_X, SPAWN_Y);
    player.body.velocityX = 0;
    player.body.velocityY = 0;
    back.blur();
});
buttons.append(back);

/**
    * Writes the value beside each slider, and the three figures that say what the
    * numbers add up to.
*/
function refresh() {
    const tuning = player.tuning;
    for (const knob of KNOBS) {
        const amount = tuning[knob.key];
        values[knob.key].textContent =
            (knob.step < 1 ? amount.toFixed(2) : String(amount)) + ' ' + knob.unit;
    }

    const height = (tuning.jumpSpeed ** 2) / (2 * tuning.gravityY);
    const airtime = (2 * tuning.jumpSpeed) / tuning.gravityY;
    const reach = tuning.runSpeed * airtime;
    const stopping = (tuning.runSpeed ** 2) / (2 * Math.max(1, tuning.groundFriction));

    figures.innerHTML = [
        ['jump clears', (height / TILE_SIZE).toFixed(1) + ' tiles'],
        ['stays up for', airtime.toFixed(2) + ' s'],
        ['and carries', (reach / TILE_SIZE).toFixed(1) + ' tiles across'],
        ['stops within', (stopping / TILE_SIZE).toFixed(1) + ' tiles'],
    ].map(line => '<div><span class="figure-name">' + line[0] + '</span>'
        + '<span class="figure-value">' + line[1] + '</span></div>').join('');
}

refresh();

/* ── input ──────────────────────────────────────────────────────────────── */

const keys = { left: 0, right: 0, up: 0, down: 0,
    jump: false, jumpPressed: false, dash: false, dashPressed: false };

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
    if (event.code === 'ArrowUp') {
        keys.up = 1;
    }
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        keys.down = 1;
    }
    if (event.code === 'Space' || event.code === 'KeyW') {
        if (!keys.jump) {
            keys.jumpPressed = true;
        }
        keys.jump = true;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyX') {
        if (!keys.dash) {
            keys.dashPressed = true;
        }
        keys.dash = true;
    }
    if (event.target === document.body) {
        mine(event);
    }
});

addEventListener('keyup', event => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        keys.left = 0;
    }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        keys.right = 0;
    }
    if (event.code === 'ArrowUp') {
        keys.up = 0;
    }
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        keys.down = 0;
    }
    if (event.code === 'Space' || event.code === 'KeyW') {
        keys.jump = false;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyX') {
        keys.dash = false;
    }
});

addEventListener('blur', () => {
    Object.assign(keys, { left: 0, right: 0, up: 0, down: 0,
        jump: false, jumpPressed: false, dash: false, dashPressed: false });
});

/* ── drawing ────────────────────────────────────────────────────────────── */

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
    * @param {number} now when this frame began.
*/
function frame(now) {
    const input = player.input;
    input.left = keys.left;
    input.right = keys.right;
    input.up = keys.up;
    input.down = keys.down;
    input.jump = keys.jump;
    input.dash = keys.dash;
    if (keys.jumpPressed) {
        input.jumpPressed = true;
    }
    if (keys.dashPressed) {
        input.dashPressed = true;
    }
    keys.jumpPressed = false;
    keys.dashPressed = false;

    engine.advance((now - previous) / 1000);
    previous = now;

    /* Falling out of the world is possible with a low enough gravity and a wild
       enough jump; the room puts you back rather than losing you. */
    if (player.body.y > viewHeight + 200) {
        player.body.place(SPAWN_X, SPAWN_Y);
        player.body.velocityX = 0;
        player.body.velocityY = 0;
    }

    draw();
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the height of each bar written beside it, and the character.
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

    context.fillStyle = '#888';
    context.font = '11px ui-monospace, Menlo, Consolas, monospace';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    /* Each bar says how far above the floor it is, so the room reads as a ruler
       rather than as a level. */
    for (let index = 0; index < 4; index++) {
        const row = 9 - index;
        const col = 2 + index * 4;
        context.fillText((2 + index) + ' tiles up',
                         (col + 3.4) * TILE_SIZE, row * TILE_SIZE + 16);
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
}

requestAnimationFrame(frame);
