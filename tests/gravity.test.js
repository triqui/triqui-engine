import assert from 'node:assert';
import test from 'node:test';
import { DEFAULT_TUNING } from '../src/triqui.js';
import { engineOf, run, jump, TILE, ROOM, ROOM_FLOOR as FLOOR } from './helpers.js';

test('gravity up puts the character on the ceiling, and that counts as standing', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, 4 * TILE, 20, 28);
    engine.setGravity(0, -2000);
    run(engine, 300);
    assert.strictEqual(it.body.y, TILE);
    assert.ok(it.body.grounded && it.body.touching.top);
});

test('gravity sideways: running is along the wall, the jump is away from it', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, 6 * TILE, 20, 28);
    engine.setGravity(2000, 0);
    run(engine, 300);
    assert.strictEqual(it.body.x + it.body.width, 19 * TILE);
    const restY = it.body.y;
    it.input.right = 1;
    run(engine, 30);
    assert.ok(it.body.y < restY, 'right now leads up the wall');
    it.input.right = 0;
    run(engine, 60);
    const wallX = it.body.x;
    jump(it);
    run(engine, 20);
    assert.ok(it.body.x < wallX - 20);
});

test('fallSpeed and alongSpeed are in the character frame', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, 2 * TILE, 20, 28);
    run(engine, 10);
    assert.strictEqual(it.body.fallSpeed, it.body.velocityY);
    it.setGravity(2000, 0);
    run(engine, 10);
    assert.ok(Math.abs(it.body.fallSpeed - it.body.velocityX) < 1e-9);
});

test('gravity belongs to each character', () => {
    const engine = engineOf(ROOM);
    const down = engine.spawn(5 * TILE, 4 * TILE, 20, 28);
    const up = engine.spawn(12 * TILE, 4 * TILE, 20, 28, { gravityY: -2000 });
    run(engine, 300);
    assert.strictEqual(down.body.y + 28, FLOOR);
    assert.strictEqual(up.body.y, TILE);
});

test('coyote time: a jump still works a moment after the ledge has gone', () => {
    const LEDGE = [
        '####################',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#.....######.......#',
        '#..................#',
        '#..................#',
        '####################',
    ];
    const attempt = wait => {
        const engine = engineOf(LEDGE);
        const it = engine.spawn(6 * TILE, 5 * TILE - 28, 20, 28);
        run(engine, 10);
        it.input.left = 1;
        while (it.body.grounded) {
            engine.advance(engine.step);
        }
        it.input.left = 0;
        run(engine, Math.round(wait / engine.step));
        jump(it);
        run(engine, 1);
        return it.body.velocityY < 0;
    };
    assert.strictEqual(attempt(DEFAULT_TUNING.coyoteTime * 0.5), true);
    assert.strictEqual(attempt(DEFAULT_TUNING.coyoteTime * 2), false);
});

test('jump buffer: a press just before landing fires on touchdown', () => {
    const attempt = before => {
        const probe = engineOf(ROOM);
        const dropped = probe.spawn(9 * TILE, 5 * TILE, 20, 28);
        let fall = 0;
        while (!dropped.body.grounded) {
            probe.advance(probe.step);
            fall++;
        }
        const engine = engineOf(ROOM);
        const it = engine.spawn(9 * TILE, 5 * TILE, 20, 28);
        it.input.jump = true;
        const pressAt = fall - Math.round(before / engine.step);
        for (let index = 0; index <= fall; index++) {
            if (index === pressAt) {
                it.input.jumpPressed = true;
            }
            engine.advance(engine.step);
        }
        return it.body.velocityY < 0;
    };
    assert.strictEqual(attempt(DEFAULT_TUNING.jumpBuffer * 0.5), true);
    assert.strictEqual(attempt(DEFAULT_TUNING.jumpBuffer * 3), false);
});

test('bodies pass through each other unless the world says otherwise', () => {
    for (const bodiesCollide of [false, true]) {
        const engine = engineOf(ROOM, { bodiesCollide });
        const lower = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
        const upper = engine.spawn(9 * TILE, TILE, 20, 28);
        run(engine, 240);
        if (bodiesCollide) {
            assert.strictEqual(upper.body.y + 28, lower.body.y, 'on its head');
        }
        else {
            assert.strictEqual(upper.body.y, lower.body.y, 'overlapping on the floor');
        }
    }
});

test('a body already overlapping another walks out of it', () => {
    const engine = engineOf(ROOM, { bodiesCollide: true });
    const still = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    const stuck = engine.spawn(9 * TILE + 4, FLOOR - 28, 20, 28);
    stuck.input.right = 1;
    run(engine, 120);
    assert.ok(stuck.body.x > still.body.x + 20);
});
