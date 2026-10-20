/**
    * @file reach.mjs, plays a level to find out whether every ledge connects.
    *
    * It reads the LEGEND out of a game file, finds every ledge (a run of tiles with
    * open air above), and from every foothold on each tries a run up, a direction
    * held from the first frame of the jump, and every length of press from a tap to
    * a full hold. Where the character lands builds a graph, and the graph answers
    * the only question a level has to: can every ledge be reached from the floor,
    * and left again.
    *
    * The direction is held from the first frame because that is how people play.
    * A route that only works by steering late is not counted.
    *
    * '.' is empty, '=' is a one way deck, anything else is solid. Levels that are
    * not meant to be climbed, such as a shaft for wall jumps, a drop or a room you
    * cross by gliding, will fail, and they should.
    *
    * Usage:
    *     node tools/reach.mjs game.js
    *     node tools/reach.mjs examples/minimal.js --tuning '{"jumpSpeed":640}'
*/

import { readFileSync } from 'node:fs';
import { TriquiWorld, TriquiEngine, DEFAULT_TUNING } from '../src/triqui.js';

const file = process.argv[2];
if (!file) {
    console.error('usage: node tools/reach.mjs <file with a LEGEND> [--tuning <json>]');
    process.exit(2);
}
const at = process.argv.indexOf('--tuning');
const tuning = { ...DEFAULT_TUNING, ...(at > 0 ? JSON.parse(process.argv[at + 1]) : {}) };

const source = readFileSync(file, 'utf8');
const start = source.indexOf('const LEGEND = [');
if (start < 0) {
    console.error(file + ' has no LEGEND');
    process.exit(2);
}
const LEGEND = Function('return ' + source.slice(start + 15, source.indexOf('];', start) + 1))();

const TILE = 32;
const WIDTH = 20;
const HEIGHT = 28;
const STEP = 1 / 120;
const MAP = LEGEND.map(row => [...row].map(char => (char === '.' ? 0 : char === '=' ? 2 : 1)));
const DEFINITIONS = { 2: { oneWay: true } };
const world = new TriquiWorld({ map: MAP, tileSize: TILE, definitions: DEFINITIONS });

/* ── the ledges ─────────────────────────────────────────────────────────── */

const ledges = [];
for (let row = 1; row < world.rows; row++) {
    let from = null;
    for (let col = 0; col <= world.columns; col++) {
        const standable = col < world.columns
            && world.tileAt(col, row) !== 0 && world.tileAt(col, row - 1) === 0;
        if (standable && from === null) {
            from = col;
        }
        if (!standable && from !== null) {
            ledges.push({ row, from, to: col - 1 });
            from = null;
        }
    }
}
const nameOf = ledge => `row ${ledge.row}, columns ${ledge.from}-${ledge.to}`;

/**
    * @param {object} body a standing body.
    * @returns {number} which ledge it stands on, or -1.
*/
function ledgeUnder(body) {
    if (!body.grounded) {
        return -1;
    }
    const row = Math.round((body.y + HEIGHT) / TILE);
    const left = Math.floor((body.x + 0.5) / TILE);
    const right = Math.floor((body.x + WIDTH - 0.5) / TILE);
    return ledges.findIndex(ledge => ledge.row === row && ledge.to >= left && ledge.from <= right);
}

/**
    * One jump: stand, run, press for so long, see where it ends.
    *
    * @returns {number} the ledge landed on, or -1.
*/
function attempt(x, y, speed, dir, hold) {
    const engine = new TriquiEngine(world, { step: STEP });
    const player = engine.spawn(x, y, WIDTH, HEIGHT, tuning);
    player.body.velocityX = speed;
    player.body.touching.bottom = true;
    player.input.left = dir < 0 ? 1 : 0;
    player.input.right = dir > 0 ? 1 : 0;
    player.input.jump = hold > 0;
    player.input.jumpPressed = hold > 0;

    let airborne = false;
    let result = -1;
    for (let index = 0; index < 360; index++) {
        if (index === hold) {
            player.input.jump = false;
        }
        engine.advance(STEP);
        if (!player.body.grounded) {
            airborne = true;
        }
        else if (airborne) {
            result = ledgeUnder(player.body);
            break;
        }
    }
    engine.remove(player);
    return result;
}

/**
    * @returns {boolean} whether a body would overlap something solid there.
*/
function occupied(x, y) {
    return [[x + 0.5, y + 0.5], [x + WIDTH - 0.5, y + 0.5],
            [x + 0.5, y + HEIGHT - 0.5], [x + WIDTH - 0.5, y + HEIGHT - 0.5]]
        .some(([px, py]) => world.tileAt(Math.floor(px / TILE), Math.floor(py / TILE)) === 1);
}

/* ── play it ────────────────────────────────────────────────────────────── */

const edges = ledges.map(() => new Set());
const SPEEDS = [-tuning.runSpeed, 0, tuning.runSpeed];
const HOLDS = [0, 6, 12, 20, 40, 300];

ledges.forEach((ledge, index) => {
    const y = ledge.row * TILE - HEIGHT;
    for (let x = ledge.from * TILE - WIDTH + 3; x <= (ledge.to + 1) * TILE - 3; x += 4) {
        if (occupied(x, y)) {
            continue;
        }
        for (const dir of [-1, 0, 1]) {
            for (const speed of SPEEDS) {
                for (const hold of HOLDS) {
                    const landed = attempt(x, y, speed, dir, hold);
                    if (landed >= 0 && landed !== index) {
                        edges[index].add(landed);
                    }
                }
            }
        }
    }
});

/**
    * @returns {Set<number>} everything reachable from one ledge.
*/
function visit(from, links) {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
        for (const next of links(queue.shift())) {
            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
        }
    }
    return seen;
}

/* The floor is the longest ledge on the lowest row that has one. */
const lowest = Math.max(...ledges.map(ledge => ledge.row));
const floor = ledges.reduce((best, ledge, index) =>
    (ledge.row === lowest && (best < 0
        || ledge.to - ledge.from > ledges[best].to - ledges[best].from) ? index : best), -1);
const up = visit(floor, index => edges[index]);
const down = visit(floor, index => ledges.map((_, other) => other)
    .filter(other => edges[other].has(index)));

console.log(`${file}: ${ledges.length} ledges, ${world.columns} by ${world.rows} tiles,`
    + ` jump ${tuning.jumpSpeed}, run ${tuning.runSpeed}\n`);
let broken = 0;
ledges.forEach((ledge, index) => {
    const notes = [];
    if (!up.has(index)) {
        notes.push('cannot be reached');
    }
    if (!down.has(index)) {
        notes.push('cannot be left');
    }
    if (notes.length) {
        broken++;
    }
    console.log((notes.length ? '  --  ' : '  ok  ') + nameOf(ledge).padEnd(26) + notes.join(', '));
});
console.log(broken
    ? `\n${broken} ledge(s) out of reach`
    : '\nevery ledge can be reached from the floor, and left again');
process.exit(broken ? 1 : 0);
