/**
    * The rules in AGENTS.md that can be checked mechanically.
*/

import assert from 'node:assert';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DEFAULT_TUNING } from '../src/triqui.js';

const source = readFileSync(new URL('../src/triqui.js', import.meta.url), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('the engine touches nothing a renderer or a browser owns', () => {
    for (const name of ['document', 'window', 'requestAnimationFrame', 'performance',
        'setTimeout', 'setInterval', 'addEventListener', 'getContext']) {
        assert.ok(!new RegExp('\\b' + name + '\\b').test(code), `triqui.js uses ${name}`);
    }
});

test('the engine imports raycast.js and nothing else', () => {
    const imports = [...code.matchAll(/^\s*import\b[^;]*?from\s+['"]([^'"]+)['"]/gm)]
        .map(match => match[1]);
    assert.deepStrictEqual(imports, ['./raycast.js']);
});

test('every tuning value is documented in the TriquiTuning typedef, and only those', () => {
    const block = source.split('@typedef {object} TriquiTuning')[1].split('*/')[0];
    const typed = [...block.matchAll(/@property \{number\} (\w+)/g)].map(match => match[1]);
    assert.deepStrictEqual([...typed].sort(), Object.keys(DEFAULT_TUNING).sort());
    for (const [key, value] of Object.entries(DEFAULT_TUNING)) {
        assert.strictEqual(typeof value, 'number', key);
    }
});

test('abilities are off by default', () => {
    for (const key of ['airJumps', 'wallSlideSpeed', 'wallJumpAway', 'dashes']) {
        assert.strictEqual(DEFAULT_TUNING[key], 0, key);
    }
});

test('no JSDoc block is left stranded on top of another', () => {
    const lines = source.split('\n');
    const stranded = [];
    for (let index = 0; index < lines.length; index++) {
        if (!lines[index].trim().startsWith('/**')) {
            continue;
        }
        const start = index;
        while (!lines[index].trim().endsWith('*/')) {
            index++;
        }
        let next = index + 1;
        while (next < lines.length && !lines[next].trim()) {
            next++;
        }
        const isTypedef = lines.slice(start, index).some(line => line.includes('@typedef'));
        if (!isTypedef && lines[next]?.trim().startsWith('/**')) {
            stranded.push(start + 1);
        }
    }
    assert.deepStrictEqual(stranded, [], 'comments stranded at lines ' + stranded.join(', '));
});

test('no public annotation is a bare object or Function', () => {
    /* An options bag typed {object} is fine when its fields are listed as
       'options.name' params below it: TypeScript builds the shape from those. */
    const loose = source.split('\n')
        .map((line, index) => [index + 1, line])
        .filter(([, line]) => /@(type|param|returns)\s+\{\??(Function|object)\}/.test(line))
        .filter(([, line]) => !/@param\s+\{object\}\s+\[?options\]?(\s|$)/.test(line));
    /* Plain-object parameters inside @private methods are allowed; their
       callers are all in this file. Everything else must be typed. */
    const privateDocs = new Set();
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index++) {
        if (lines[index].trim().startsWith('/**')) {
            const start = index;
            while (!lines[index].trim().endsWith('*/')) {
                index++;
            }
            if (lines.slice(start, index + 1).some(line => line.includes('@private'))) {
                for (let inside = start; inside <= index; inside++) {
                    privateDocs.add(inside + 1);
                }
            }
        }
    }
    const offending = loose.filter(([number]) => !privateDocs.has(number));
    assert.deepStrictEqual(offending.map(([number, line]) => number + ': ' + line.trim()), []);
});

test('lines stay under 100 characters, apart from section separators', () => {
    const root = new URL('../', import.meta.url);
    const files = ['src/triqui.js', 'game.js']
        .concat(readdirSync(new URL('examples/', root)).filter(name => name.endsWith('.js'))
            .map(name => 'examples/' + name))
        .concat(readdirSync(new URL('tools/', root)).map(name => 'tools/' + name))
        .concat(readdirSync(new URL('tests/', root)).map(name => 'tests/' + name));
    const long = [];
    for (const file of files) {
        readFileSync(new URL(file, root), 'utf8').split('\n').forEach((line, index) => {
            if (line.length > 100 && !/[─═]/.test(line)) {
                long.push(`${file}:${index + 1} (${line.length})`);
            }
        });
    }
    assert.deepStrictEqual(long, []);
});
