/**
    * @file levels.mjs, runs the reachability check on every level designed for
    * the default jump.
    *
    * Every level in the list must pass. Removing a level from the list requires
    * a reason in the example header. See examples/AGENTS.md.
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
