/**
    * @file crush.js, what happens when the level closes on you.
    *
    * A press coming down in the middle and a piston sweeping the right hand side.
    *
    * Neither of them kills on contact. A platform that reaches a character shoves
    * it the way it is going and just far enough to be clear: clip the press with
    * your head on the way up and it knocks you down, walk into the piston and it
    * sweeps you along in front of it. Being crushed is what is left when the shove
    * has nowhere to put you, either under the press with the floor below or in
    * front of the piston with the wall behind.
    *
    * That distinction is the whole point of the example. Something moving into you
    * is ordinary; having nowhere left to be is not.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

const TILE_SIZE = 32;
const LEGEND = [
    '#########################',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#.......................#',
    '#########################',
];
const MAP = LEGEND.map(row => [...row].map(char => (char === '#' ? 1 : 0)));

const SPAWN_X = 2 * TILE_SIZE;
const SPAWN_Y = 14 * TILE_SIZE - 28;

const world = new TriquiWorld({ map: MAP, tileSize: TILE_SIZE });
const engine = new TriquiEngine(world);
const player = engine.spawn(SPAWN_X, SPAWN_Y, 20, 28);

/*
    * The press stops eight pixels above the floor, which is less than the
    * character is tall: that is the entire difference between a hazard and a
    * doorway.
    *
    * Where it stops going up matters just as much, and less obviously. Send it
    * flush to the ceiling and its top face is a death trap too. Anybody riding it
    * is carried head first into the roof, the carry stops them there, the press
    * keeps coming, and they end up inside it. Riding a lift should not be the same
    * mistake as standing under a press, so it stops a character's height clear of
    * the ceiling and the top of it is simply a lift.
*/
const press = engine.addPlatform(10 * TILE_SIZE, 4 * TILE_SIZE, 160, 24, {
    points: [{ x: 10 * TILE_SIZE, y: 13 * TILE_SIZE }],
    speed: 150,
});

/* The piston sweeps you towards the wall and stops eight pixels short of it,
   which is narrower than the character. Walking into it is safe; being at the
   far end when it arrives is not. */
const piston = engine.addPlatform(20 * TILE_SIZE, 12 * TILE_SIZE, 24, 64, {
    points: [{ x: 23 * TILE_SIZE, y: 12 * TILE_SIZE }],
    speed: 110,
});

/**
    * @type {number} how many times the level has won.
*/
let losses = 0;

/**
    * @type {string} what got you last, for the panel.
*/
let lastCulprit = 'nothing yet';

/**
    * @type {number} frames left of the flash that marks a death.
*/
let flash = 0;

player.body.onCrushed = what => {
    losses++;
    flash = 12;
    lastCulprit = what === press ? 'the press' : what === piston ? 'the piston' : 'the level';

    /* place() rather than an assignment: it moves the remembered position too, so
       the character is not drawn smeared across the room on the way back. */
    player.body.place(SPAWN_X, SPAWN_Y);
    player.body.velocityX = 0;
    player.body.velocityY = 0;
};

const keys = { left: 0, right: 0, jump: false, jumpPressed: false };

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
    if (event.code === 'Space' || event.code === 'KeyW') {
        if (!keys.jump) {
            keys.jumpPressed = true;
        }
        keys.jump = true;
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
    if (event.code === 'Space' || event.code === 'KeyW') {
        keys.jump = false;
    }
});

addEventListener('blur', () => {
    Object.assign(keys, { left: 0, right: 0, jump: false, jumpPressed: false });
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
    * @param {number} now when this frame began.
*/
function frame(now) {
    const input = player.input;
    input.left = keys.left;
    input.right = keys.right;
    input.jump = keys.jump;
    if (keys.jumpPressed) {
        input.jumpPressed = true;
    }
    keys.jumpPressed = false;

    engine.advance((now - previous) / 1000);
    previous = now;
    flash = Math.max(0, flash - 1);

    draw();
    readout.innerHTML =
        '<div><span class="name">crushed</span><span class="value">'
        + losses + ' times, last by ' + lastCulprit + '</span></div>';
    requestAnimationFrame(frame);
}

/**
    * Draws the room, the machinery and the character.
*/
function draw() {
    const alpha = engine.alpha;

    context.fillStyle = flash > 0 ? '#eee' : '#fff';
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

    context.fillStyle = '#444';
    for (const platform of engine.platforms) {
        context.fillRect(platform.renderX(alpha), platform.renderY(alpha),
                         platform.width, platform.height);
    }

    const body = player.body;
    context.fillStyle = body.grounded ? '#000' : '#fff';
    context.strokeStyle = '#000';
    context.lineWidth = 1.5;
    context.fillRect(body.renderX(alpha), body.renderY(alpha), body.width, body.height);
    context.strokeRect(body.renderX(alpha) + 0.75, body.renderY(alpha) + 0.75,
                       body.width - 1.5, body.height - 1.5);
}

requestAnimationFrame(frame);
