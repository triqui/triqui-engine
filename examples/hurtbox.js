/**
    * @file hurtbox.js, a hurtbox smaller than the collision box.
    *
    * The white rectangle is the hurtbox; the blue outline is the body used for
    * walls and floors. The hurtbox is inset by a few pixels ('body.hurtbox'), so
    * projectiles that only touch the outline miss.
    *
    * H toggles the inset. Two turrets fire at head height, where the inset
    * matters, and one at chest height, which must be jumped in any case. The
    * readout counts grazes: shots that crossed the outline but missed the
    * hurtbox.
    *
    * Spikes on the floor are harmful sensors, tested against the hurtbox. Coins
    * are ordinary sensors, tested against the full body. Hazards are therefore
    * smaller than they look and pickups larger.
    *
    * After a hit the player is invulnerable for a short time. That is game code
    * in this file, a timer and a condition, not an engine feature.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.....####......####....#',
    '#.......................#',
    '#.......................#',
    '#..........#####........#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const FLOOR = 13 * TILE_SIZE;
const SPAWN_X = 3 * TILE_SIZE;
const SPAWN_Y = FLOOR - 28;

/**
    * Hurtbox inset from each edge, in pixels. The top inset is the largest,
    * because near misses happen mostly at head height.
    *
    * @type {{left: number, right: number, top: number, bottom: number}}
*/
const CLEMENCY = { left: 4, right: 4, top: 9, bottom: 2 };

/**
    * @type {{left: number, right: number, top: number, bottom: number}} zero
    *       inset.
*/
const NONE = { left: 0, right: 0, top: 0, bottom: 0 };

/**
    * @type {number} invulnerability time after a hit, in seconds.
*/
const RECOVERY = 0.8;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(SPAWN_X, SPAWN_Y, 20, 28);
player.body.hurtbox = { ...CLEMENCY };

/* ── what can hurt, and what can be had ─────────────────────────────────── */

const spikes = [];
for (let col = 10; col <= 14; col++) {
    const spike = engine.addSensor(col * TILE_SIZE, FLOOR - 10, TILE_SIZE, 10, 'spike');
    spike.harmful = true;
    spikes.push(spike);
}

const coins = [
    [7, 4], [17, 4], [13, 7], [5, 11], [20, 11],
].map(([col, row]) => engine.addSensor(col * TILE_SIZE + 8, row * TILE_SIZE + 8, 16, 16, 'coin'));

/* A walking enemy, checked with 'hurtOverlaps', so both insets apply. */
const walker = engine.spawn(6 * TILE_SIZE, SPAWN_Y, 20, 28, { runSpeed: 60 });
walker.body.hurtbox = { left: 3, right: 3, top: 4, bottom: 0 };
walker.think = self => {
    const body = self.body;
    const facing = body.touching.right ? -1 : body.touching.left ? 1 : body.facing;
    const turn = body.x > 9 * TILE_SIZE ? -1 : body.x < 2 * TILE_SIZE ? 1 : facing;
    self.input.right = turn > 0 ? 1 : 0;
    self.input.left = turn < 0 ? 1 : 0;
};

/**
    * Turrets: position, direction, interval and time of the first shot. The two
    * at head height test the inset.
    *
    * @type {Array<{x: number, y: number, dir: number, every: number, next: number,
    *               label: string}>}
*/
const TURRETS = [
    { x: TILE_SIZE, y: SPAWN_Y + 3, dir: 1, every: 1.3, next: 0.4, label: 'head' },
    { x: TILE_SIZE, y: SPAWN_Y + 16, dir: 1, every: 2.1, next: 1.2, label: 'chest' },
    { x: 24 * TILE_SIZE, y: SPAWN_Y + 4, dir: -1, every: 1.7, next: 0.9, label: 'head' },
];

/* ── keeping score ──────────────────────────────────────────────────────── */

const score = { hits: 0, grazes: 0, coins: 0 };

/**
    * @type {number} remaining invulnerability time, in seconds.
*/
let recovering = 0;

/**
    * @type {string} source of the last hit.
*/
let lastHit = 'nothing yet';

/**
    * Handles a hit on the player's hurtbox.
    *
    * @param {string} what source of the hit.
*/
function hurt(what) {
    if (recovering > 0) {
        return;
    }
    score.hits++;
    lastHit = what;
    recovering = RECOVERY;
}

player.body.onSensor = (sensor, entering) => {
    if (!entering) {
        return;
    }
    if (sensor.data === 'spike') {
        hurt('the spikes');
    }
    if (sensor.data === 'coin') {
        sensor.enabled = false;
        score.coins++;
    }
};

/**
    * Whether a segment intersects a rectangle. Used to detect grazes: shots that
    * crossed the body outline without hitting the hurtbox.
    *
    * @param {number} x0 start of the segment.
    * @param {number} y0 start of the segment.
    * @param {number} x1 end of the segment.
    * @param {number} y1 end of the segment.
    * @param {object} box the rectangle, as x, y, width, height.
    * @returns {boolean} true when they intersect.
*/
function crosses(x0, y0, x1, y1, box) {
    let near = 0;
    let far = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    for (const [start, delta, low, high] of [
        [x0, dx, box.x, box.x + box.width],
        [y0, dy, box.y, box.y + box.height],
    ]) {
        if (delta === 0) {
            if (start < low || start > high) {
                return false;
            }
            continue;
        }
        let enter = (low - start) / delta;
        let leave = (high - start) / delta;
        if (enter > leave) {
            [enter, leave] = [leave, enter];
        }
        near = Math.max(near, enter);
        far = Math.min(far, leave);
        if (near > far) {
            return false;
        }
    }
    return true;
}

/**
    * Fires one turret's shot.
    *
    * @param {object} turret the turret that fires.
*/
function fireTurret(turret) {
    const shot = engine.fire(turret.x + (turret.dir > 0 ? 1 : -1), turret.y,
        turret.dir * 420, 0, {
            life: 3,
            onContact: contact => {
                if (contact.other === player.body) {
                    shot.hitYou = true;
                    hurt('a shot at ' + turret.label + ' height');
                }
                /* Shots pass through the walking enemy. */
                return contact.other === walker.body ? 'pass' : 'stop';
            },
        });
    shot.hitYou = false;
    shot.crossed = false;
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
    if (event.code === 'KeyH' && !event.repeat) {
        const forgiving = player.body.hurtWidth < player.body.width;
        player.body.hurtbox = forgiving ? { ...NONE } : { ...CLEMENCY };
    }
    if (event.code === 'KeyR' && !event.repeat) {
        Object.assign(score, { hits: 0, grazes: 0, coins: 0 });
        for (const coin of coins) {
            coin.enabled = true;
        }
        lastHit = 'nothing yet';
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

    for (const turret of TURRETS) {
        turret.next -= elapsed;
        if (turret.next <= 0) {
            fireTurret(turret);
            turret.next += turret.every;
        }
    }

    engine.advance(elapsed);
    recovering = Math.max(0, recovering - elapsed);

    /* Graze: the shot crossed the outline this frame without hitting the hurtbox.
       Each shot is counted once. */
    const body = player.body;
    const outline = { x: body.x, y: body.y, width: body.width, height: body.height };
    for (const shot of engine.projectiles) {
        if (!shot.crossed && !shot.hitYou
            && crosses(shot.previousX, shot.previousY, shot.x, shot.y, outline)) {
            shot.crossed = true;
            score.grazes++;
        }
    }

    if (body.hurtOverlaps(walker.body)) {
        hurt('the walker');
    }

    draw();
    report();
    requestAnimationFrame(frame);
}

/**
    * Draws the room, spikes, coins, turrets, shots, and the player's body and
    * hurtbox.
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

    context.fillStyle = '#dc3545';
    for (const spike of spikes) {
        for (let tooth = 0; tooth < 4; tooth++) {
            const left = spike.x + tooth * 8;
            context.beginPath();
            context.moveTo(left, spike.y + spike.height);
            context.lineTo(left + 4, spike.y);
            context.lineTo(left + 8, spike.y + spike.height);
            context.fill();
        }
    }

    context.strokeStyle = '#ffc107';
    context.lineWidth = 1.5;
    for (const coin of coins) {
        if (coin.enabled) {
            context.beginPath();
            context.arc(coin.x + 8, coin.y + 8, 7, 0, Math.PI * 2);
            context.stroke();
        }
    }

    context.fillStyle = '#6c757d';
    for (const turret of TURRETS) {
        context.fillRect(turret.dir > 0 ? turret.x - 4 : turret.x - 6, turret.y - 4, 10, 8);
    }

    for (const shot of engine.projectiles) {
        context.fillStyle = '#0d6efd';
        context.beginPath();
        context.arc(shot.renderX(alpha), shot.renderY(alpha), 2.5, 0, Math.PI * 2);
        context.fill();
    }

    person(walker.body, alpha, '#adb5bd');

    /* Blink while invulnerable. */
    if (recovering === 0 || Math.floor(recovering * 12) % 2 === 0) {
        person(player.body, alpha, '#0d6efd');
    }
}

/**
    * Draws a body as an outline, with its hurtbox filled in white.
    *
    * @param {object} body  the body.
    * @param {number} alpha how far the frame is between the last two steps.
    * @param {string} ink   outline colour.
*/
function person(body, alpha, ink) {
    const x = body.renderX(alpha);
    const y = body.renderY(alpha);
    context.fillStyle = ink;
    context.fillRect(x, y, body.width, body.height);

    context.fillStyle = '#fff';
    context.fillRect(x + (body.hurtbox.left ?? 0), y + (body.hurtbox.top ?? 0),
                     body.hurtWidth, body.hurtHeight);

    context.fillStyle = ink;
    context.fillRect(x + (body.facing > 0 ? body.width - 5 : 1), y + 12, 4, 4);
}

/**
    * Writes the inset state and the hit, graze and pickup counts.
*/
function report() {
    const body = player.body;
    const forgiving = body.hurtWidth < body.width;
    readout.innerHTML = [
        ['clemency', (forgiving
            ? 'on: ' + CLEMENCY.top + 'px off the top, ' + CLEMENCY.left + ' each side, '
              + CLEMENCY.bottom + ' off the feet'
            : 'off, the whole outline can be hurt')
            + '   (H switches it)'],
        ['hits', score.hits + '   last by ' + lastHit],
        ['grazes', score.grazes + '   shots that crossed your outline and missed'],
        ['coins', score.coins + ' of ' + coins.length + '   taken by the whole outline'
            + '   (R to reset)'],
    ].map(line => '<div><span class="name">' + line[0] + '</span>'
        + '<span class="value">' + line[1] + '</span></div>').join('');
}

requestAnimationFrame(frame);
