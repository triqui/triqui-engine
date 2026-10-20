/**
    * @file hurtbox.js, clemency you can see.
    *
    * The white rectangle inside you is the part that can be hurt; the black
    * outline around it is the part that walls and floors see. They differ by a
    * few pixels, and those pixels are the whole difference between a shot that
    * grazes your hair and one that kills you.
    *
    * H switches it off, so the two can be felt side by side. Two turrets fire at
    * head height, where the forgiving margin decides everything, and one at chest
    * height, which has to be jumped whatever the margin. The panel counts grazes,
    * meaning shots that crossed your outline but missed your hurtbox, so the
    * forgiveness can be measured.
    *
    * It runs both ways. The spikes along the floor are harmful sensors, so they
    * are tested against the hurtbox and forgive a brush. The coins are ordinary
    * sensors, tested against the whole outline, so one taken by a pixel is taken.
    * Hazards narrower than they look, rewards wider: the same idea, pointed in two
    * directions.
    *
    * After a hit there is a moment when nothing can hurt you. That is clemency in
    * time rather than space, and it is a timer and an 'if' in this file. The engine
    * has no opinion about it.
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
    * The forgiving margins, in pixels in from each edge. More off the top than
    * the bottom: the head is where near misses happen, and a player never feels
    * that a shot at their feet should have missed.
    *
    * @type {{left: number, right: number, top: number, bottom: number}}
*/
const CLEMENCY = { left: 4, right: 4, top: 9, bottom: 2 };

/**
    * @type {{left: number, right: number, top: number, bottom: number}} none.
*/
const NONE = { left: 0, right: 0, top: 0, bottom: 0 };

/**
    * @type {number} seconds nothing can hurt you after something has.
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

/* A walker on the left, that reaches you through both hurtboxes at once. */
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
    * The turrets: where they fire from, which way, how often, and when first.
    * The two at head height are the ones clemency is for.
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
    * @type {number} seconds of recovery left after a hit.
*/
let recovering = 0;

/**
    * @type {string} what hit you last.
*/
let lastHit = 'nothing yet';

/**
    * Something has reached the part of you that can be hurt.
    *
    * @param {string} what what it was.
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
    * Whether a segment passes through a rectangle. It is used only to notice a shot
    * that crossed your outline and still missed, which is what a graze is.
    *
    * @param {number} x0 start of the segment.
    * @param {number} y0 start of the segment.
    * @param {number} x1 end of the segment.
    * @param {number} y1 end of the segment.
    * @param {object} box the rectangle, as x, y, width, height.
    * @returns {boolean} true when they meet.
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
    * @param {object} turret where from, and which way.
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
                /* Straight through the walker: this room is about you. */
                return contact.other === walker.body ? 'pass' : 'stop';
            },
        });
    shot.hitYou = false;
    shot.crossed = false;
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

    for (const turret of TURRETS) {
        turret.next -= elapsed;
        if (turret.next <= 0) {
            fireTurret(turret);
            turret.next += turret.every;
        }
    }

    engine.advance(elapsed);
    recovering = Math.max(0, recovering - elapsed);

    /* A graze: the shot crossed your outline this frame and never met the part of
       you that counts. Each shot is counted at most once. */
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
    * Draws the room, the spikes, the coins, the turrets and the shots, and the
    * two rectangles that are you.
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

    context.fillStyle = '#000';
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

    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    for (const coin of coins) {
        if (coin.enabled) {
            context.beginPath();
            context.arc(coin.x + 8, coin.y + 8, 7, 0, Math.PI * 2);
            context.stroke();
        }
    }

    context.fillStyle = '#555';
    for (const turret of TURRETS) {
        context.fillRect(turret.dir > 0 ? turret.x - 4 : turret.x - 6, turret.y - 4, 10, 8);
    }

    for (const shot of engine.projectiles) {
        context.fillStyle = '#000';
        context.beginPath();
        context.arc(shot.renderX(alpha), shot.renderY(alpha), 2.5, 0, Math.PI * 2);
        context.fill();
    }

    person(walker.body, alpha, '#888');

    /* Blinking while nothing can hurt you, as every game since 1985 has done. */
    if (recovering === 0 || Math.floor(recovering * 12) % 2 === 0) {
        person(player.body, alpha, '#000');
    }
}

/**
    * Draws a body as its outline, with its hurtbox filled in white inside it.
    *
    * @param {object} body  the body.
    * @param {number} alpha how far the frame is between the last two steps.
    * @param {string} ink   the outline's colour.
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
    * Says whether clemency is on, and counts what it did.
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
