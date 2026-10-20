import assert from 'node:assert';
import test from 'node:test';
import { engineOf, run, jump, TILE, ROOM, ROOM_FLOOR as FLOOR } from './helpers.js';

const DECK_ROOM = [
    '###############',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#.............#',
    '#....=====....#',
    '#.............#',
    '###############',
];
const DECK = 6 * TILE;

/* ── contacts ───────────────────────────────────────────────────────────── */

test('a contact says what was hit, where, and how hard', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(7 * TILE, 5 * TILE, 20, 28);
    const seen = [];
    it.body.onCollision = contact => seen.push(contact);
    run(engine, 120);
    const landing = seen[0];
    assert.strictEqual(landing.face, 'bottom');
    assert.strictEqual(landing.tileId, 1);
    assert.deepStrictEqual([landing.cellX, landing.cellY], [7, 8]);
    assert.strictEqual(landing.normalY, -1);
    assert.strictEqual(landing.other, null);
    assert.ok(landing.speed > 100);
    assert.ok(it.body.contacts.length >= 1, 'and the frame keeps a list');
});

test('a contact brings the tile definition and the data hung on that cell', () => {
    const engine = engineOf(DECK_ROOM);
    engine.world.setDataAt(7, 6, 'that one');
    const it = engine.spawn(7 * TILE, 2 * TILE, 20, 28);
    let deck = null;
    it.body.onCollision = contact => {
        deck = deck ?? contact;
    };
    run(engine, 120);
    assert.strictEqual(deck.tile.oneWay, true);
    assert.strictEqual(deck.data, 'that one');
    assert.strictEqual(engine.world.dataAt(6, 6), null);
});

/* ── one way decks and dropping through ─────────────────────────────────── */

test('a one way deck is a floor from above and nothing from below or the side', () => {
    const engine = engineOf(DECK_ROOM);
    const above = engine.spawn(7 * TILE, 2 * TILE, 20, 28);
    const below = engine.spawn(2 * TILE, FLOOR - 28, 20, 28);
    run(engine, 120);
    assert.strictEqual(above.body.y + 28, DECK);

    below.body.place(7 * TILE, FLOOR - 28);
    jump(below);
    run(engine, 300);
    assert.strictEqual(below.body.y + 28, DECK, 'through it, then onto it');
});

test('holding down drops through a deck, and does nothing on honest ground', () => {
    const engine = engineOf(DECK_ROOM);
    const it = engine.spawn(7 * TILE, 2 * TILE, 20, 28);
    const ground = engine.spawn(2 * TILE, FLOOR - 28, 20, 28);
    run(engine, 120);
    it.input.down = 1;
    ground.input.down = 1;
    run(engine, 3);
    it.input.down = 0;
    run(engine, 200);
    assert.strictEqual(it.body.y + 28, FLOOR);
    assert.strictEqual(ground.body.y + 28, FLOOR);
});

/* ── moving platforms ───────────────────────────────────────────────────── */

test('a platform carries its passenger, who never slides on it', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(2 * TILE, 5 * TILE, 20, 28);
    const lift = engine.addPlatform(2 * TILE - 6, 7 * TILE, 64, 12, {
        points: [{ x: 10 * TILE, y: 7 * TILE }], speed: 90,
    });
    run(engine, 60);
    assert.strictEqual(it.body.riding, lift);
    const offset = it.body.x - lift.x;
    const startX = it.body.x;
    run(engine, 120);
    assert.ok(it.body.x > startX + 60);
    assert.ok(Math.abs(it.body.x - lift.x - offset) < 0.001);
});

test('a lift up and down takes its passenger both ways', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(2 * TILE, 5 * TILE, 20, 28);
    const lift = engine.addPlatform(2 * TILE - 6, 7 * TILE, 64, 12, {
        points: [{ x: 2 * TILE - 6, y: 5 * TILE }], speed: 120,
    });
    run(engine, 60);
    let highest = it.body.y;
    let lowest = it.body.y;
    run(engine, 400, () => {
        highest = Math.min(highest, it.body.y);
        lowest = Math.max(lowest, it.body.y);
    });
    assert.ok(lowest - highest > TILE);
    assert.ok(Math.abs(it.body.y + 28 - lift.y) < 2);
});

test('leaving or losing the platform ends the ride', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(2 * TILE, 5 * TILE, 20, 28);
    const lift = engine.addPlatform(2 * TILE - 6, 7 * TILE, 64, 12);
    run(engine, 60);
    assert.strictEqual(it.body.riding, lift);
    engine.removePlatform(lift);
    assert.strictEqual(it.body.riding, null);
    run(engine, 120);
    assert.strictEqual(it.body.y + 28, FLOOR);
});

test('walking behind a moving face keeps its pace instead of stuttering', () => {
    const engine = engineOf(ROOM);
    const piston = engine.addPlatform(6 * TILE, FLOOR - 64, 24, 64, {
        points: [{ x: 14 * TILE, y: FLOOR - 64 }], speed: 110, loop: 'once',
    });
    const it = engine.spawn(2 * TILE, FLOOR - 28, 20, 28);
    it.input.right = 1;
    let last = it.body.x;
    const steps = [];
    run(engine, 400, index => {
        if (index > 120 && piston.deltaX > 0 && it.body.touching.right) {
            steps.push(it.body.x - last);
        }
        last = it.body.x;
    });
    const pace = piston.speed * engine.step;
    const mean = steps.reduce((sum, step) => sum + step, 0) / steps.length;
    const wobble = Math.sqrt(steps.reduce((sum, step) => sum + (step - mean) ** 2, 0)
        / steps.length);
    assert.ok(steps.length > 50);
    assert.ok(Math.abs(mean - pace) < 0.01, `kept up at ${mean.toFixed(3)} of ${pace}`);
    assert.ok(wobble < 0.01, `wobble ${wobble.toFixed(3)}`);
});

/* ── sensors and crushing ───────────────────────────────────────────────── */

test('a sensor reports the way in and the way out, and stops nobody', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(2 * TILE, FLOOR - 28, 20, 28);
    const coin = engine.addSensor(8 * TILE, FLOOR - 40, 24, 40, 'coin');
    const seen = [];
    it.body.onSensor = (sensor, entering) => seen.push(entering);
    it.input.right = 1;
    run(engine, 500);
    assert.deepStrictEqual(seen, [true, false]);
    assert.strictEqual(it.body.x + 20, 19 * TILE);
    coin.enabled = false;
});

test('taking a sensor away tells whoever was in it', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(2 * TILE, FLOOR - 28, 20, 28);
    const zone = engine.addSensor(TILE, FLOOR - 40, 96, 40, 'zone');
    run(engine, 2);
    const left = [];
    it.body.onSensor = (sensor, entering) => !entering && left.push(sensor);
    engine.removeSensor(zone);
    assert.deepStrictEqual(left, [zone]);
});

test('a press clipping a jumper shoves them down instead of crushing them', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(4 * TILE, FLOOR - 28, 20, 28);
    engine.addPlatform(3 * TILE, TILE, 96, 24, {
        points: [{ x: 3 * TILE, y: 4 * TILE }], speed: 150, loop: 'once',
    });
    run(engine, 30);
    let caught = 0;
    it.body.onCrushed = () => caught++;
    jump(it);
    run(engine, 330);
    assert.strictEqual(caught, 0);
    assert.strictEqual(it.body.y + 28, FLOOR);
});

test('a press meeting somebody on the floor has nowhere to put them', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(4 * TILE, FLOOR - 28, 20, 28);
    const press = engine.addPlatform(3 * TILE, TILE, 96, 24, {
        points: [{ x: 3 * TILE, y: FLOOR - 20 }], speed: 200, loop: 'once',
    });
    let caught = null;
    it.body.onCrushed = what => { caught = what; };
    run(engine, 400);
    assert.strictEqual(caught, press);
});

test('a piston sweeps somebody across the room but pins them at the wall', () => {
    const sweep = toX => {
        const engine = engineOf(ROOM);
        const it = engine.spawn(8 * TILE, FLOOR - 28, 20, 28);
        engine.addPlatform(14 * TILE, FLOOR - 64, 24, 64, {
            points: [{ x: toX, y: FLOOR - 64 }], speed: 140, loop: 'once',
        });
        let caught = 0;
        it.body.onCrushed = () => caught++;
        run(engine, 600);
        return { caught, x: it.body.x };
    };
    const open = sweep(4 * TILE);
    assert.strictEqual(open.caught, 0);
    assert.ok(open.x < 4 * TILE);
    assert.strictEqual(sweep(TILE).caught, 1);
});
