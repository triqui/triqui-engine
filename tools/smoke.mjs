/**
    * @file smoke.mjs, runs every example in Node, with no browser.
    *
    * Each one gets a stand-in DOM, made of elements that accept anything, a 2D
    * context that swallows every call and a requestAnimationFrame that queues, and
    * is driven for a few hundred frames. It catches what a syntax check cannot: a
    * missing element, a misspelled engine call, anything that throws inside the
    * loop. It cannot tell whether an example looks right; that needs a browser.
    *
    * Usage:
    *     node tools/smoke.mjs                   every example and the demo
    *     node tools/smoke.mjs examples/dash.js  just that one
*/

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const FRAMES = 400;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const target = process.argv[2];

if (!target) {
    const files = readdirSync(join(root, 'examples'))
        .filter(name => name.endsWith('.js'))
        .map(name => join(root, 'examples', name))
        .concat(join(root, 'game.js'));

    let failed = 0;
    for (const file of files) {
        /* One process each: every example sets up its own globals. */
        const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), file],
            { encoding: 'utf8' });
        const name = relative(root, file);
        if (run.status === 0) {
            console.log('ok    ' + name);
        }
        else {
            failed++;
            console.log('FAIL  ' + name);
            console.log((run.stderr || run.stdout).trim().split('\n').slice(0, 6)
                .map(line => '      ' + line).join('\n'));
        }
    }
    console.log(`\n${files.length - failed} of ${files.length} ran ${FRAMES} frames cleanly`);
    process.exit(failed ? 1 : 0);
}

/* ── one example ────────────────────────────────────────────────────────── */

const queue = [];
const styleOf = () => new Proxy({}, {
    get: (store, key) => store[key] ?? '',
    set: (store, key, value) => (store[key] = value, true),
});
const context = new Proxy({}, {
    get: (store, key) => (key in store ? store[key] : () => {}),
    set: (store, key, value) => (store[key] = value, true),
});
const element = () => ({
    style: styleOf(), dataset: {}, className: '', textContent: '', innerHTML: '',
    width: 800, height: 480, min: 0, max: 0, step: 0, value: 0, type: '',
    addEventListener() {}, removeEventListener() {}, appendChild() {}, append() {},
    remove() {}, setAttribute() {}, blur() {}, focus() {}, getContext: () => context,
});
const elements = {};

globalThis.document = {
    getElementById: id => (elements[id] ??= element()),
    createElement: () => element(),
    body: element(),
};
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = callback => queue.push(callback);

/* Examples log on purpose; that is not what is being tested here. */
console.log = () => {};

await import(pathToFileURL(resolve(target)).href);

let clock = 0;
for (let frame = 0; frame < FRAMES; frame++) {
    const next = queue.shift();
    if (!next) {
        throw new Error(`the loop stopped after ${frame} frames`);
    }
    clock += 1000 / 60;
    next(clock);
}
