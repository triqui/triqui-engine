import assert from 'node:assert';
import test from 'node:test';
import { engineOf, run, TILE, ROOM, ROOM_FLOOR as FLOOR } from './helpers.js';

test('everything with a position is on one list, with a kind and a number', () => {
    const engine = engineOf(ROOM);
    const player = engine.spawn(2 * TILE, FLOOR - 28, 20, 28);
    const lift = engine.addPlatform(5 * TILE, 3 * TILE, 64, 12);
    const coin = engine.addSensor(7 * TILE, 5 * TILE, 16, 16, 'coin');
    assert.deepStrictEqual(engine.actors, [player.body, lift, coin]);
    assert.deepStrictEqual(engine.actors.map(actor => actor.kind), ['body', 'platform', 'sensor']);
    assert.strictEqual(engine.actor(lift.id), lift);
    engine.removePlatform(lift);
    assert.strictEqual(engine.actor(lift.id), null);
    assert.strictEqual(player.body.controller, player);
});

test('harmful sensors see the hurtbox, the rest see the whole outline', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    run(engine, 5);
    it.body.hurtbox = { left: 4, right: 4, top: 6, bottom: 2 };
    const strip = harmful => {
        const sensor = engine.addSensor(it.body.x + 18, it.body.y, 10, 28, harmful);
        sensor.harmful = harmful;
        return sensor;
    };
    const spike = strip(true);
    const coin = strip(false);
    run(engine, 2);
    assert.ok(it.body.inside.has(coin));
    assert.ok(!it.body.inside.has(spike));
});

test('two bodies reach each other through their hurtboxes', () => {
    const engine = engineOf(ROOM);
    const one = engine.spawn(9 * TILE, FLOOR - 28, 20, 28);
    const two = engine.spawn(9 * TILE + 16, FLOOR - 28, 20, 28);
    assert.ok(one.body.hurtOverlaps(two.body));
    one.body.hurtbox = { right: 3 };
    two.body.hurtbox = { left: 3 };
    assert.ok(!one.body.hurtOverlaps(two.body));
});

test('add puts a removed character back, keeping what is the character', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(5 * TILE, FLOOR - 28, 20, 28, { runSpeed: 90, airJumps: 2 });
    const mind = () => {};
    it.think = mind;
    it.body.data = 'kept';
    run(engine, 20);
    it.input.right = 1;
    it.jumpsLeft = 0;
    it.body.justLanded = true;
    const oldId = it.body.id;

    engine.remove(it);
    it.body.place(8 * TILE, 2 * TILE);
    assert.strictEqual(engine.add(it), true);
    assert.strictEqual(engine.add(it), false, 'not twice');

    assert.strictEqual(it.tuning.runSpeed, 90);
    assert.strictEqual(it.think, mind);
    assert.strictEqual(it.body.data, 'kept');
    assert.strictEqual(it.body.x, 8 * TILE);
    assert.strictEqual(it.jumpsLeft, 2);
    assert.strictEqual(it.input.right, 0);
    assert.strictEqual(it.body.justLanded, false);
    assert.notStrictEqual(it.body.id, oldId);
    assert.strictEqual(engine.actor(oldId), null);
});

test('put back inside a sensor, it is told it entered', () => {
    const engine = engineOf(ROOM);
    const it = engine.spawn(5 * TILE, FLOOR - 28, 20, 28);
    engine.addSensor(4 * TILE, FLOOR - 64, 96, 64, 'zone');
    let entries = 0;
    it.body.onSensor = (sensor, entering) => { entries += entering ? 1 : 0; };
    run(engine, 2);
    engine.remove(it);
    engine.add(it);
    run(engine, 2);
    assert.strictEqual(entries, 2);
});

test('put back after shots were fired, it can be shot', () => {
    const engine = engineOf(ROOM);
    const shooter = engine.spawn(2 * TILE, FLOOR - 28, 20, 28);
    const target = engine.spawn(10 * TILE, FLOOR - 28, 20, 28);
    run(engine, 20);
    engine.fire(shooter.body.x + 20, shooter.body.y + 14, 900, 0, { owner: shooter.body });
    run(engine, 60);
    engine.remove(target);
    engine.add(target);
    run(engine, 2);
    const shot = engine.fire(shooter.body.x + 20, shooter.body.y + 14, 900, 0,
        { owner: shooter.body });
    run(engine, 60);
    assert.strictEqual(shot.stoppedBy.other, target.body);
});

test('a pool of four serves a thousand arrivals and builds nothing more', () => {
    const engine = engineOf(ROOM);
    const shelf = [];
    let built = 0;
    for (let wave = 0; wave < 250; wave++) {
        const live = [];
        for (let index = 0; index < 4; index++) {
            const it = shelf.pop() ?? (built++, engine.spawn(0, 0, 20, 28));
            if (!engine.bodies.includes(it.body)) {
                engine.add(it);
            }
            it.body.place(TILE + index * 3 * TILE, TILE);
            live.push(it);
        }
        run(engine, 3);
        for (const it of live) {
            engine.remove(it);
            shelf.push(it);
        }
    }
    assert.strictEqual(built, 4);
    assert.strictEqual(engine.actors.length, 0);
});
