/**
    * @file levels.mjs, runs the reachability check on every level meant to be
    * climbed with the ordinary jump.
    *
    * The list is the set that passes today. A level added to it must pass; one
    * taken off it needs a reason in the example's header. See examples/AGENTS.md.
*/

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CLIMBABLE = [
    'game.js',
    'examples/minimal.js',
    'examples/tuning.js',
    'examples/chase.js',
    'examples/contacts.js',
    'examples/crush.js',
    'examples/dom.js',
    'examples/oneway.js',
    'examples/dropthrough.js',
    'examples/pickups.js',
];

const root = fileURLToPath(new URL('..', import.meta.url));
const reach = fileURLToPath(new URL('./reach.mjs', import.meta.url));
let failed = 0;

for (const file of CLIMBABLE) {
    const run = spawnSync(process.execPath, [reach, file], { cwd: root, encoding: 'utf8' });
    const verdict = run.stdout.trim().split('\n').pop();
    console.log((run.status === 0 ? 'ok    ' : 'FAIL  ') + file.padEnd(26) + verdict);
    if (run.status !== 0) {
        failed++;
        console.log(run.stdout.split('\n').filter(line => line.startsWith('  --'))
            .map(line => '      ' + line.trim()).join('\n'));
    }
}
process.exit(failed ? 1 : 0);
