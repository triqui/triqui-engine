/**
    * @file raycast-intact.mjs, verifies that raycast.js is unmodified.
    *
    * raycast.js is a verbatim copy of triqui/raycast2d and is never edited in
    * this repository. Its SHA-256 checksum is pinned below. A mismatch means the
    * file was edited, or replaced with a new upstream release; in the latter case
    * update the checksum in the same commit.
*/

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* raycast2d 1.0.0, https://github.com/triqui/raycast2d/blob/main/src/raycast.js */
const PINNED = '6b0d8399fa50d7eb6c8b66d58ef27bd824636312c4579a389997362991fc36b5';

const file = fileURLToPath(new URL('../src/raycast.js', import.meta.url));
const actual = createHash('sha256').update(readFileSync(file)).digest('hex');

if (actual !== PINNED) {
    console.error('raycast.js has changed.');
    console.error('  pinned  ' + PINNED);
    console.error('  actual  ' + actual);
    console.error('It must stay identical to triqui/raycast2d. See AGENTS.md.');
    process.exit(1);
}
console.log('raycast.js matches raycast2d 1.0.0');
