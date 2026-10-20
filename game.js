/**
    * @file game.js, the smallest thing the engine can be asked to do.
    *
    * A tile level, a character that runs and jumps, and a drawing of both. The
    * engine holds the physics; everything in this file is the parts an engine has
    * no business owning: which keys mean what, what the level looks like and what
    * to put on the screen.
    *
    * It expects three elements in the page: a canvas with the id 'view', a
    * container with the id 'readout', and a button with the id 'toggle'.
*/

import { TriquiWorld, TriquiEngine } from './src/triqui.js';

/* ── level ──────────────────────────────────────────────────────────────── */

/**
    * @type {number} size of one cell, in pixels.
*/
const TILE_SIZE = 32;

/**
    * This is the level, written out. '#' is solid and '.' is empty, and the wall
    * around the outside is what keeps anything from leaving: the grid reports cells
    * beyond the MAP as empty, so a level that must hold has to say so itself.
    *
    * Every ledge in here can be climbed to from the floor, and left again,
    * holding a direction from the first frame of the jump. That is a property of
    * the numbers in the engine as much as of the shape drawn here: the jump
    * lifts the character a little over two tiles, so a ledge sits two rows up and
    * one or two columns to the side, never straight overhead.
    *
    * @type {string[]}
*/
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
    '#########################'
];

/**
    * @type {number[][]} the same level as tile identifiers, indexed as
    *                    MAP[row][column], which is what the grid reads.
*/
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

/**
    * @type {number} how big a character is. A little shorter than a cell, so that
    *                it fits through the two row gap a ledge above the floor leaves.
*/
const PLAYER_WIDTH = 20;
const PLAYER_HEIGHT = 28;

/**
    * Where the characters start. Add a line and there is another one: the engine
    * keeps a list and does not care how long it is.
    *
    * Both of them answer to the same keys, which is the point of starting them
    * apart. The same input from two different places stops being the same thing the
    * moment one of them meets a wall the other does not.
    *
    * @type {Array<{x: number, y: number}>}
*/
const SPAWNS = [
    { x: 40, y: 420 },
    { x: 200, y: 420 },
];

/**
    * The four ways gravity can point here, and how hard it pulls. Nothing in the
    * engine says down has to be down, so this is a list the demo cycles through
    * rather than a setting it had to ask for.
    *
    * @type {Array<{name: string, x: number, y: number}>}
*/
const GRAVITY_DIRECTIONS = [
    { name: 'down', x: 0, y: 1 },
    { name: 'left', x: -1, y: 0 },
    { name: 'up', x: 0, y: -1 },
    { name: 'right', x: 1, y: 0 },
];

/**
    * @type {number} how hard gravity pulls, in pixels per second squared.
*/
const GRAVITY_STRENGTH = 2000;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE, bodiesCollide: true });
const engine = new TriquiEngine(world);
const players = SPAWNS.map(spawn =>
    engine.spawn(spawn.x, spawn.y, PLAYER_WIDTH, PLAYER_HEIGHT));

/**
    * @type {number[]} how many times each character has landed. Counting it is
    *                  the short way of showing why an event is not a state:
    *                  'grounded' is true for hundreds of frames in a row, a
    *                  landing happens once.
*/
const landings = players.map(() => 0);

/**
    * @type {number} which of the four directions gravity is pointing.
*/
let gravityAt = 0;

/* ── input ──────────────────────────────────────────────────────────────── */

const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
const GRAVITY_KEY = 'KeyG';

/**
    * What the keyboard is saying. It is read here and copied into every character
    * once per frame: the engine gives each of them an input of its own, and a
    * second keyboard, a gamepad or something thinking for itself would write into
    * theirs instead of this.
    *
    * @type {{left: number, right: number, jump: boolean, jumpPressed: boolean}}
*/
const keys = { left: 0, right: 0, jump: false, jumpPressed: false };

addEventListener('keydown', event => {
    if (LEFT_KEYS.includes(event.code)) {
        keys.left = 1;
    }
    if (RIGHT_KEYS.includes(event.code)) {
        keys.right = 1;
    }
    if (JUMP_KEYS.includes(event.code)) {
        /*
            * The press is an edge, not a state: holding the key down must not
            * start a second jump on landing.
        */
        if (!keys.jump) {
            keys.jumpPressed = true;
        }
        keys.jump = true;
    }
    if (event.code === GRAVITY_KEY && !event.repeat) {
        gravityAt = (gravityAt + 1) % GRAVITY_DIRECTIONS.length;
        const where = GRAVITY_DIRECTIONS[gravityAt];
        engine.setGravity(where.x * GRAVITY_STRENGTH, where.y * GRAVITY_STRENGTH);
    }
    /* Only our keys, and never with a modifier held, so browser shortcuts such
       as Ctrl+D or F12 still reach the browser. */
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (!modified && (LEFT_KEYS.includes(event.code) || RIGHT_KEYS.includes(event.code)
        || JUMP_KEYS.includes(event.code))) {
        event.preventDefault();
    }
});

addEventListener('keyup', event => {
    if (LEFT_KEYS.includes(event.code)) {
        keys.left = 0;
    }
    if (RIGHT_KEYS.includes(event.code)) {
        keys.right = 0;
    }
    if (JUMP_KEYS.includes(event.code)) {
        keys.jump = false;
    }
});

/*
    * A key held while the window loses focus never sends its keyup, and the
    * character would walk off on its own.
*/
addEventListener('blur', () => {
    Object.assign(keys, { left: 0, right: 0, jump: false, jumpPressed: false });
});

const toggle = document.getElementById('toggle');

toggle.addEventListener('click', () => {
    const collider = engine.collider;
    collider.recordRays = !collider.recordRays;
    toggle.textContent = collider.recordRays ? 'hide rays' : 'show rays';
    toggle.blur();                      // or the space bar would press it again
});

/* ── drawing ────────────────────────────────────────────────────────────── */

/**
    * @type {number} shortest a drawn ray may be. A step is a fraction of a pixel
    *                long, so a ray drawn true to length would be invisible.
*/
const MIN_RAY_LENGTH = 11;

/**
    * @type {number} radius of the dot marking a contact.
*/
const CONTACT_DOT_RADIUS = 2.5;

/**
    * @type {number} highest device pixel ratio worth backing the canvas with.
*/
const MAX_PIXEL_RATIO = 2;

/**
    * @type {string} the number drawn inside a character, telling it from the rest.
*/
const PLAYER_LABEL_FONT = '10px ui-monospace, Menlo, Consolas, monospace';

const canvas = document.getElementById('view');
const context = canvas.getContext('2d');
const viewWidth = world.columns * TILE_SIZE;
const viewHeight = world.rows * TILE_SIZE;
const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

canvas.width = viewWidth * ratio;
canvas.height = viewHeight * ratio;
canvas.style.aspectRatio = viewWidth + ' / ' + viewHeight;
context.scale(ratio, ratio);

/**
    * Draws the level, the character, and the casts behind it if they are on.
*/
function draw() {
    /*
        * Physics stepped at its own pace and stopped somewhere short of now. This
        * is how far short, and it is what turns a character that ticks into one
        * that moves.
    */
    const alpha = engine.alpha;

    context.fillStyle = '#fff';
    context.fillRect(0, 0, viewWidth, viewHeight);

    context.strokeStyle = '#e8e8e8';
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

    context.fillStyle = '#bbb';
    context.strokeStyle = '#555';
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
        drawRays(alpha);
    }

    context.lineWidth = 1.5;
    context.font = PLAYER_LABEL_FONT;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    engine.bodies.forEach((body, index) => {
        const drawX = body.renderX(alpha);
        const drawY = body.renderY(alpha);

        context.fillStyle = body.grounded ? '#000' : '#fff';
        context.strokeStyle = '#000';
        context.fillRect(drawX, drawY, body.width, body.height);
        context.strokeRect(drawX + 0.75, drawY + 0.75, body.width - 1.5, body.height - 1.5);

        /* Filled or hollow says whether it is standing; the number says which
           one of them it is. */
        context.fillStyle = body.grounded ? '#fff' : '#000';
        context.fillText(String(index + 1),
                         drawX + body.width / 2, drawY + body.height / 2);
    });
}

/**
    * Draws the casts of the last physics step.
    *
    * A step is a fraction of a pixel long, so the lines are stretched to a
    * readable minimum. What is true of them is where they start, which way they
    * point and whether they found anything.
    *
    * One collider serves every character, so the rays of all of them arrive in
    * one list and each says which body cast it. That matters here: a ray is cast
    * from where its body is and drawn from where its body is drawn, a fraction of
    * a step ahead, and shifting them all by the same amount would leave one
    * character's rays floating beside the other.
    *
    * @param {number} alpha how far the frame is between the last two steps.
*/
function drawRays(alpha) {
    for (const ray of engine.collider.rays) {
        const body = ray.body;
        const length = Math.max(ray.length, MIN_RAY_LENGTH);
        const startX = ray.x + body.renderX(alpha) - body.x;
        const startY = ray.y + body.renderY(alpha) - body.y;
        const endX = startX + ray.dirX * length;
        const endY = startY + ray.dirY * length;

        context.strokeStyle = ray.hit ? '#000' : '#999';
        context.lineWidth = 1;
        context.setLineDash(ray.hit ? [] : [3, 3]);
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
        context.setLineDash([]);

        if (ray.hit) {
            context.fillStyle = '#000';
            context.beginPath();
            context.arc(endX, endY, CONTACT_DOT_RADIUS, 0, Math.PI * 2);
            context.fill();
        }
    }
}

/* ── readout ────────────────────────────────────────────────────────────── */

const readout = document.getElementById('readout');

/**
    * Writes a number in a fixed width, so the panel does not shift as the digits
    * change.
    *
    * @param {number} value  the number to write.
    * @param {number} places decimals to keep.
    * @returns {string} the number, right aligned in six columns.
*/
function figure(value, places) {
    return value.toFixed(places).padStart(6);
}

/**
    * Fills the panel above the canvas: a line of numbers for each character, and
    * a heading so the columns mean something.
*/
function report() {
    const heading = 'position'.padEnd(16) + 'velocity'.padEnd(15)
        + 'state'.padEnd(10) + 'landings';

    const lines = [
        ['gravity', GRAVITY_DIRECTIONS[gravityAt].name + '   (G turns it)'],
        ['', heading],
    ].concat(engine.bodies.map((body, index) => [
        'player ' + (index + 1),
        figure(body.x, 1) + ',' + figure(body.y, 1) + '  '
        + figure(body.velocityX, 0) + ',' + figure(body.velocityY, 0) + '  '
        + state(body).padEnd(10) + String(landings[index]).padStart(3),
    ]));

    readout.innerHTML = lines.map(line =>
        '<div><span class="name">' + line[0] + '</span>'
        + '<span class="value">' + line[1] + '</span></div>').join('');
}

/**
    * Says in one word what a character is doing, which is the sort of thing a
    * renderer would pick an animation from.
    *
    * @param {object} body the character's body.
    * @returns {string} 'standing', 'rising' or 'falling'.
*/
function state(body) {
    if (body.grounded) {
        return 'standing';
    }
    /* Rising means away from wherever gravity is pulling, not upwards. */
    const fall = body.velocityX * body.downX + body.velocityY * body.downY;
    return fall < 0 ? 'rising' : 'falling';
}

/* ── loop ───────────────────────────────────────────────────────────────── */

let previous = performance.now();

/**
    * One frame: pass the keyboard on, hand the engine the time that has passed,
    * then draw whatever it did with it.
    *
    * @param {number} now the time this frame began.
*/
function frame(now) {
    /*
        * One keyboard drives every character. The press is copied rather than
        * shared, because the engine spends each character's 'jumpPressed' on its
        * first step and clearing one must not clear the others.
    */
    for (const player of players) {
        player.input.left = keys.left;
        player.input.right = keys.right;
        player.input.jump = keys.jump;
        if (keys.jumpPressed) {
            player.input.jumpPressed = true;
        }
    }
    keys.jumpPressed = false;

    engine.advance((now - previous) / 1000);
    previous = now;

    players.forEach((player, index) => {
        if (player.body.justLanded) {
            landings[index]++;
        }
    });

    draw();
    report();
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
