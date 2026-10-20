import assert from 'node:assert';
import test from 'node:test';
import { engineOf, run, jump, TILE, ROOM, ROOM_FLOOR as FLOOR } from './helpers.js';

const LEDGE = [
    '####################',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#.....###..........#',
    '#..................#',
    '#..................#',
    '####################',
];

test('a body falls and comes to rest exactly on the floor, and stays there', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, TILE, 20, 28);
    run(engine, 240);
    assert.strictEqual(it.body.y + it.body.height, FLOOR);
    assert.ok(it.body.grounded);
    const resting = it.body.y;
    run(engine, 240);
    assert.strictEqual(it.body.y, resting, 'no jitter');
});

test('running stops flush against either wall', () => {
    const engine = engineOf(ROOM);
    const right = engine.spawn(5 * TILE, FLOOR - 28, 20, 28);
    const left = engine.spawn(12 * TILE, FLOOR - 28, 20, 28);
    right.input.right = 1;
    left.input.left = 1;
    run(engine, 900);
    assert.strictEqual(right.body.x + right.body.width, 19 * TILE);
    assert.strictEqual(left.body.x, TILE);
    assert.ok(right.body.touching.right && left.body.touching.left);
});

test('a held jump clears two tiles, a tapped one less than half that', () => {
    const height = holdFor => {
        const engine = engineOf(ROOM);
        const it = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
        run(engine, 30);
        const start = it.body.y;
        let apex = start;
        jump(it);
        run(engine, 120, index => {
            if (index === holdFor) {
                it.input.jump = false;
            }
            apex = Math.min(apex, it.body.y);
        });
        return start - apex;
    };
    const held = height(1000);
    assert.ok(held > 2 * TILE && held < 3 * TILE, `held ${held.toFixed(1)}`);
    assert.ok(height(5) < held / 2);
});

test('there is no jump without ground', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, TILE, 20, 28);
    jump(it);
    run(engine, 10);
    assert.ok(it.body.velocityY > 0);
});

test('a head meets a ledge from below and the body falls back', () => {
    const engine = engineOf(LEDGE);
    const it = engine.spawn(6 * TILE, FLOOR - 28, 20, 28);
    jump(it);
    let highest = it.body.y;
    run(engine, 120, () => { highest = Math.min(highest, it.body.y); });
    assert.strictEqual(highest, 6 * TILE);
    assert.strictEqual(it.body.y + it.body.height, FLOOR);
});

test('the engine runs whole steps only, and alpha is what is left over', () => {
    const engine = engineOf(ROOM);
    engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    assert.strictEqual(engine.advance(engine.step / 2), 0);
    assert.ok(Math.abs(engine.alpha - 0.5) < 1e-9);
    assert.strictEqual(engine.advance(engine.step / 2), 1);
    assert.strictEqual(engine.advance(engine.step * 3), 3);
    assert.ok(engine.alpha >= 0 && engine.alpha < 1);
});

test('a body is drawn between its last two positions, and place does not smear', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, TILE, 20, 28);
    run(engine, 20);
    const { previousY, y } = it.body;
    assert.ok(y > previousY);
    assert.strictEqual(it.body.renderY(0.5), (previousY + y) / 2);
    assert.strictEqual(it.body.renderCenterX(1), it.body.x + 10);
    it.body.place(3 * TILE, 3 * TILE);
    assert.strictEqual(it.body.renderX(0), it.body.renderX(1));
});

test('landing is an event once, standing is a state for many frames', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, TILE, 20, 28);
    let landings = 0;
    let standing = 0;
    run(engine, 400, () => {
        landings += it.body.justLanded ? 1 : 0;
        standing += it.body.grounded ? 1 : 0;
    });
    assert.strictEqual(landings, 1);
    assert.ok(standing > 100);
});

test('an event survives a frame worth several steps', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    run(engine, 30);
    jump(it);
    engine.advance(engine.step * 4);
    assert.ok(it.body.justLeftGround);
});

test('the state is one word an animation can be picked from', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, TILE, 20, 28, { dashes: 1 });
    assert.strictEqual(it.state, 'falling');
    run(engine, 240);
    assert.strictEqual(it.state, 'standing');
    jump(it);
    run(engine, 4);
    assert.strictEqual(it.state, 'rising');
    run(engine, 200);
    it.input.dash = true;
    it.input.dashPressed = true;
    run(engine, 2);
    assert.strictEqual(it.state, 'dashing');
});

test('a body faces right until told otherwise', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    assert.strictEqual(it.body.facing, 1);
    it.input.left = 1;
    run(engine, 2);
    assert.strictEqual(it.body.facing, -1);
});

test('think is called once per step, never once per frame', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    let calls = 0;
    it.think = (self, step) => {
        calls++;
        assert.strictEqual(self, it);
        assert.strictEqual(step, engine.step);
    };
    engine.advance(engine.step * 3);
    engine.advance(engine.step / 4);
    assert.strictEqual(calls, 3);
});

test('many characters are stepped, each with its own input', () => {
    const engine = engineOf(ROOM);
    const crowd = [3, 9, 15].map(col => engine.spawn(col * TILE, TILE, 20, 28));
    run(engine, 240);
    for (const it of crowd) {
        assert.strictEqual(it.body.y + 28, FLOOR);
    }
    crowd.forEach(it => jump(it));
    run(engine, 1);
    for (const it of crowd) {
        assert.ok(it.body.velocityY < 0);
        assert.strictEqual(it.input.jumpPressed, false, 'each press is spent');
    }
});
