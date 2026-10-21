/**
    * @file nav.mjs, generates the example selector on every page.
    *
    * Every example page, and the demo page, contains a select element listing
    * the demo and all examples, in the order below, with the current page
    * selected. It is written between the '<!-- examples -->' and
    * '<!-- /examples -->' markers. To add an example, add it to the list and run
    * this script. The selector is not edited by hand.
    *
    * Usage:
    *     node tools/nav.mjs           rewrite the selector on every page
    *     node tools/nav.mjs --check   fail if any page is out of date, or if an
    *                                  example exists that is not listed
*/

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/* Reading order: basics, larger examples, then one feature per example.
   [file name without extension, label] */
export const EXAMPLES = [
    ['minimal', 'minimal'],
    ['tuning', 'tuning'],
    ['shoot', 'shoot'],
    ['glide', 'glide'],
    ['hurtbox', 'hurtbox'],
    ['pool', 'pool'],
    ['feel', 'feel'],
    ['chase', 'chase'],
    ['patrol', 'patrol'],
    ['dom', 'dom'],
    ['contacts', 'contacts'],
    ['platforms', 'platforms'],
    ['oneway', 'one way'],
    ['dropthrough', 'drop through'],
    ['crush', 'crush'],
    ['pickups', 'pickups'],
    ['gravity', 'gravity'],
    ['wallslide', 'wall slide'],
    ['walljump', 'wall jump'],
    ['airjump', 'air jumps'],
    ['dash', 'dash'],
    ['impulse', 'impulse'],
    ['wrap', 'wrap'],
];

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = join(root, 'examples');
const MARKERS = /<!-- examples -->[\s\S]*?<!-- \/examples -->/;
const checking = process.argv.includes('--check');

/**
    * Builds the selector for one page.
    *
    * @param {string}  current file name of the page, without extension, or
    *                          'index' for the demo.
    * @param {boolean} atRoot  whether the page is in the repository root.
    * @returns {string} the markup, including the markers.
*/
function selector(current, atRoot) {
    const prefix = atRoot ? './examples/' : './';
    const demo = atRoot ? './index.html' : '../index.html';
    const options = [[demo, 'demo', current === 'index']]
        .concat(EXAMPLES.map(([file, label]) => [prefix + file + '.html', label, file === current]))
        .map(([href, label, selected]) =>
            `<option value="${href}"${selected ? ' selected' : ''}>${label}</option>`);
    return '<!-- examples --><select class="form-select form-select-sm w-auto" '
        + 'aria-label="Examples" onchange="location.href = this.value">'
        + options.join('') + '</select><!-- /examples -->';
}

const pages = readdirSync(folder).filter(name => name.endsWith('.html')).sort();
const listed = new Set(EXAMPLES.map(([file]) => file + '.html'));
const problems = [];

for (const page of pages) {
    if (!listed.has(page)) {
        problems.push(`${page} exists but is not listed in tools/nav.mjs`);
    }
}
for (const name of listed) {
    if (!pages.includes(name)) {
        problems.push(`${name} is listed in tools/nav.mjs but does not exist`);
    }
}

const targets = pages.map(page => [join(folder, page), page.replace('.html', ''), false])
    .concat([[join(root, 'index.html'), 'index', true]]);

for (const [path, name, atRoot] of targets) {
    const html = readFileSync(path, 'utf8');
    const label = atRoot ? 'index.html' : name + '.html';
    if (!MARKERS.test(html)) {
        problems.push(`${label} has no example selector`);
        continue;
    }
    const updated = html.replace(MARKERS, selector(name, atRoot));
    if (updated !== html) {
        if (checking) {
            problems.push(`${label} has an out of date example selector`);
        }
        else {
            writeFileSync(path, updated);
            console.log('updated ' + label);
        }
    }
}

if (problems.length) {
    console.error(problems.join('\n'));
    console.error(checking ? '\nrun: node tools/nav.mjs' : '');
    process.exit(1);
}
console.log(checking ? `the selector on all ${targets.length} pages is current` : 'done');
