import assert from 'node:assert';
import test from 'node:test';
import { engineOf, run, TILE } from './helpers.js';

const CORRIDOR = [
    '####################',
    '#..................#',
    '#..................#',
    '#.........===......#',
    '#..................#',
    '#..................#',
    '####################',
];
const FLOOR = 6 * TILE;

/**
    * @returns {object} an engine, a shooter and three characters in a row.
*/
function range() {
    const engine = engineOf(CORRIDOR);
    const shooter = engine.spawn(2 * TILE, FLOOR - 28, 20, 28);
    const row = [6, 9, 12].map(col => engine.spawn(col * TILE, FLOOR - 28, 20, 28));
    run(engine, 30);
    const fire = (options = {}, speed = 900) => engine.fire(
        shooter.body.x + 20, shooter.body.y + 14, speed, 0,
        { owner: shooter.body, ...options });
    return { engine, shooter, row, fire };
}

test('a shot stops at the first thing it meets, on its near face', () => {
    const it = range();
    const shot = it.fire();
    run(it.engine, 60);
    assert.strictEqual(shot.reason, 'stopped');
    assert.strictEqual(shot.stoppedBy.other, it.row[0].body);
    assert.strictEqual(shot.x, it.row[0].body.x);
});

test('passing characters records each once, nearest first, then the wall', () => {
    const it = range();
    const shot = it.fire({ onContact: contact => (contact.kind === 'body' ? 'pass' : 'stop') });
    run(it.engine, 120);
    assert.deepStrictEqual(shot.contacts.map(contact => contact.kind),
        ['body', 'body', 'body', 'tile']);
    assert.deepStrictEqual(shot.contacts.slice(0, 3).map(contact => contact.other),
        it.row.map(controller => controller.body));
});

test('a ghost passes everything, each wall once, and runs out', () => {
    const it = range();
    const ends = [];
    const shot = it.fire({ life: 1, onContact: () => 'pass', onEnd: (s, why) => ends.push(why) });
    run(it.engine, 180);
    assert.deepStrictEqual(ends, ['expired']);
    assert.deepStrictEqual(shot.contacts.map(contact => contact.kind),
        ['body', 'body', 'body', 'tile']);
    assert.strictEqual(it.engine.projectiles.length, 0);
});

test('no tunnelling, at five hundred pixels a step', () => {
    const it = range();
    const shot = it.fire({}, 60000);
    run(it.engine, 1);
    assert.strictEqual(shot.stoppedBy.other, it.row[0].body);
});

test('a shot never meets its owner, and flies over one way decks', () => {
    const it = range();
    const back = it.engine.fire(it.shooter.body.x + 10, it.shooter.body.y + 14, -900, 0,
        { owner: it.shooter.body });
    const up = it.engine.fire(10 * TILE + 16, 5 * TILE, 0, -900);
    run(it.engine, 60);
    assert.strictEqual(back.stoppedBy.kind, 'tile');
    assert.strictEqual(up.stoppedBy.cellY, 0);
});

test('a lob rises, falls and lands', () => {
    const it = range();
    const body = it.shooter.body;
    const shot = it.engine.fire(body.x + 20, body.y, 200, -500, {
        owner: body, gravityY: 2000,
        onContact: contact => (contact.kind === 'tile' ? 'stop' : 'pass'),
    });
    let highest = shot.y;
    run(it.engine, 240, () => { highest = Math.min(highest, shot.y); });
    assert.ok(highest < body.y - 40);
    assert.strictEqual(shot.stoppedBy.normalY, -1);
});

test('the data hung on a character comes back on the shot contact', () => {
    const it = range();
    it.row[0].body.data = { name: 'first' };
    const shot = it.fire();
    run(it.engine, 60);
    assert.deepStrictEqual(shot.stoppedBy.data, { name: 'first' });
});

test('a forgiving hurtbox lets a grazing shot past, and can change mid game', () => {
    const it = range();
    const target = it.row[0].body;
    const graze = () => {
        const shot = it.engine.fire(TILE + 2, target.y + 3, 900, 0, {
            onContact: contact => (contact.other === it.shooter.body ? 'pass' : 'stop'),
        });
        run(it.engine, 80);
        return shot.stoppedBy.other;
    };
    assert.strictEqual(graze(), target);
    target.hurtbox = { top: 6 };
    run(it.engine, 1);
    assert.notStrictEqual(graze(), target);
});
