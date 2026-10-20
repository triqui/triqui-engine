/**
    * @file helpers.js, what every test file builds its rooms with.
*/

import { TriquiWorld, TriquiEngine } from '../src/triqui.js';

export const TILE = 32;

/**
    * Turns a legend into a map: '.' empty, '=' a one way deck, anything else
    * solid. One way decks come with their definition.
    *
    * @param {string[]} legend the rows.
    * @param {object}   [world] further options for the world.
    * @returns {TriquiWorld} the world.
*/
export function worldOf(legend, world = {}) {
    const map = legend.map(row => [...row].map(char => (char === '.' ? 0 : char === '=' ? 2 : 1)));
    return new TriquiWorld({
        map, tileSize: TILE, definitions: { 2: { oneWay: true } }, ...world,
    });
}

/**
    * @param {string[]} legend the rows.
    * @param {object}   [world] further options for the world.
    * @returns {TriquiEngine} an engine over it.
*/
export const engineOf = (legend, world) => new TriquiEngine(worldOf(legend, world));

/**
    * Runs whole physics steps, calling back after each.
    *
    * @param {TriquiEngine} engine the engine.
    * @param {number}       steps  how many.
    * @param {Function}     [each] called with the index after every step.
*/
export function run(engine, steps, each) {
    for (let index = 0; index < steps; index++) {
        engine.advance(engine.step);
        if (each) {
            each(index);
        }
    }
}

/**
    * Presses jump for one step and keeps it held.
    *
    * @param {object} controller the character.
*/
export function jump(controller) {
    controller.input.jump = true;
    controller.input.jumpPressed = true;
}

/* An empty room, walled all round, with the floor at row 8. */
export const ROOM = [
    '####################',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '####################',
];
export const ROOM_FLOOR = 8 * TILE;
