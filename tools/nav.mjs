/**
    * @file nav.mjs, keeps the row of links on every example page the same.
    *
    * Every page carries the full list of examples, in the order below. Adding an
    * example means adding it here and running this; nothing else edits the links.
    *
    * Usage:
    *     node tools/nav.mjs           rewrite the links on every page
    *     node tools/nav.mjs --check   fail if any page is out of date, or if an
    *                                  example exists that is not listed
*/

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/* The order a reader meets them in: the basics, then the showpieces, then one
   feature at a time. [file name without extension, label] */
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

const folder = fileURLToPath(new URL('../examples/', import.meta.url));
const nav = EXAMPLES.map(([file, label]) => `<a href="./${file}.html">${label}</a>`).join(' · ');
const link = '<a href="\\./[a-z]+\\.html">[^<]+</a>';
const pattern = new RegExp(`${link}(?: · ${link})*`);
const checking = process.argv.includes('--check');

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

for (const page of pages) {
    const path = join(folder, page);
    const html = readFileSync(path, 'utf8');
    if (!pattern.test(html)) {
        problems.push(`${page} has no row of example links`);
        continue;
    }
    const updated = html.replace(pattern, nav);
    if (updated !== html) {
        if (checking) {
            problems.push(`${page} has an out of date row of links`);
        }
        else {
            writeFileSync(path, updated);
            console.log('updated ' + page);
        }
    }
}

if (problems.length) {
    console.error(problems.join('\n'));
    console.error(checking ? '\nrun: node tools/nav.mjs' : '');
    process.exit(1);
}
console.log(checking ? `the links on all ${pages.length} pages are current` : 'done');
