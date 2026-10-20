import assert from 'node:assert';
import test from 'node:test';
import { DEFAULT_TUNING } from '../src/triqui.js';
import { engineOf, run, jump, TILE, ROOM, ROOM_FLOOR as FLOOR } from './helpers.js';

const SHAFT = [
    '###############',
    '#.............#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#.............#',
    '###############',
];

test('abilities are off until a character is given them', () => {
    for (const key of ['airJumps', 'wallSlideSpeed', 'wallJumpAway', 'dashes']) {
        assert.strictEqual(DEFAULT_TUNING[key], 0, key);
    }
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    run(engine, 20);
    it.input.dash = true;
    it.input.dashPressed = true;
    run(engine, 1);
    assert.strictEqual(it.dashing, 0);
});

test('two air jumps make a triple jump, and the ground hands them back', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(3 * TILE, FLOOR - 28, 20, 28, { airJumps: 2 });
    run(engine, 20);
    for (let index = 0; index < 3; index++) {
        jump(it);
        run(engine, 20);
    }
    assert.strictEqual(it.jumpsLeft, 0);
    jump(it);
    const before = it.body.velocityY;
    run(engine, 1);
    assert.ok(it.body.velocityY > before, 'a fourth does nothing');
    run(engine, 300);
    assert.strictEqual(it.jumpsLeft, 2);
});

test('hugging a wall caps the fall only while steering into it', () => {
    const fastest = held => {
        const engine = engineOf(SHAFT);
        const it = engine.spawn(5 * TILE - 20, 2 * TILE, 20, 28, { wallSlideSpeed: 90 });
        it.input.right = held ? 1 : 0;
        let top = 0;
        run(engine, 90, () => {
            if (!it.body.grounded) {
                top = Math.max(top, it.body.velocityY);
            }
        });
        return top;
    };
    assert.ok(fastest(true) <= 90.001);
    assert.ok(fastest(false) > 200);
});

test('wall jumps climb a shaft that cannot be climbed without them', () => {
    const climb = tuning => {
        const engine = engineOf(SHAFT);
        const it = engine.spawn(6 * TILE + 6, FLOOR - 28, 20, 28, tuning);
        let towards = 1;
        let since = 99;
        let highest = it.body.y;
        run(engine, 900, () => {
            it.input.right = towards > 0 ? 1 : 0;
            it.input.left = towards < 0 ? 1 : 0;
            since++;
            it.input.jump = since < 16;
            if ((it.sliding || it.body.grounded) && since > 8) {
                jump(it);
                if (it.sliding) {
                    towards = -towards;
                }
                since = 0;
            }
            highest = Math.min(highest, it.body.y);
        });
        return FLOOR - 28 - highest;
    };
    assert.ok(climb({ wallSlideSpeed: 90, wallJumpAway: 300, wallJumpUp: 520 }) > 5 * TILE);
    assert.ok(climb({}) < 3 * TILE);
});

test('a dash goes where it is aimed, ignores gravity, and ends at running speed', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(3 * TILE, 3 * TILE, 20, 28, { dashes: 2 });
    run(engine, 10);
    const height = it.body.y;
    it.input.right = 1;
    it.input.dash = true;
    it.input.dashPressed = true;
    run(engine, 1);
    assert.ok(Math.abs(it.body.velocityX - DEFAULT_TUNING.dashSpeed) < 1);
    run(engine, 12);
    assert.ok(Math.abs(it.body.y - height) < 1, 'level while it lasts');
    run(engine, 10);
    assert.strictEqual(it.dashing, 0);
    assert.ok(Math.abs(it.body.velocityX) <= DEFAULT_TUNING.runSpeed + 0.001);
    assert.strictEqual(it.dashesLeft, 1);
});

test('the dash cooldown holds a second dash back', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(3 * TILE, TILE, 20, 28, { dashes: 3, dashCooldown: 0.2 });
    it.input.right = 1;
    it.input.dashPressed = true;
    run(engine, 17);
    it.input.dashPressed = true;
    run(engine, 1);
    assert.strictEqual(it.dashesLeft, 2, 'too soon');
    run(engine, 20);
    it.input.dashPressed = true;
    run(engine, 1);
    assert.strictEqual(it.dashesLeft, 1);
});

test('an impulse launch is not cut short by a button nobody pressed', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    run(engine, 20);
    const start = it.body.y;
    it.body.impulseAligned(0, 600);
    let apex = start;
    run(engine, 200, () => { apex = Math.min(apex, it.body.y); });
    const expected = 600 * 600 / (2 * DEFAULT_TUNING.gravityY);
    assert.ok(Math.abs(start - apex - expected) < 3);
    assert.strictEqual(it.body.launched, false, 'forgotten once falling');
});

test('an aligned impulse means away from the ground, wherever that is', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, 4 * TILE, 20, 28);
    it.setGravity(2000, 0);
    run(engine, 200);
    it.body.velocityX = 0;
    it.body.velocityY = 0;
    it.body.impulseAligned(0, 400);
    assert.ok(Math.abs(it.body.velocityX + 400) < 1e-9);
});

test('a spring can push back from inside the collision that caused it', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    let bounces = 0;
    it.body.onCollision = contact => {
        if (contact.face === 'bottom') {
            bounces++;
            it.body.impulseAligned(0, 520);
        }
    };
    let highest = it.body.y;
    run(engine, 300, () => { highest = Math.min(highest, it.body.y); });
    assert.ok(bounces >= 2);
    assert.ok(FLOOR - 28 - highest > 60);
});

test('the tuning is read every step, so a glide takes effect at once', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, TILE, 20, 28);
    run(engine, 30);
    it.tuning.maxFallSpeed = 90;
    run(engine, 1);
    assert.ok(it.body.fallSpeed <= 90.001);
});
