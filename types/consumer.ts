/**
    * TypeScript consumer of Triqui with 'allowJs' and 'strict'. All types come
    * from the JSDoc in triqui.js.
    *
    * The first section must compile. Each line in the second section, under a
    * '@ts-expect-error' directive, must be a type error. If the types become too
    * loose to reject one of them, tsc reports an unused directive and the check
    * fails.
    *
    * Run with: npm run types
*/

import {
    TriquiWorld, TriquiEngine, DEFAULT_TUNING,
    type TriquiController, type TriquiBody, type TriquiTuning,
    type TriquiContact, type TriquiShotContact,
} from '../src/triqui.js';

const world = new TriquiWorld({ map: [[0, 0, 0], [1, 1, 1]], tileSize: 32 });
const engine = new TriquiEngine(world);

/* ── what must work ─────────────────────────────────────────────────────── */

const player: TriquiController = engine.spawn(0, 0, 20, 28, { runSpeed: 300, airJumps: 1 });
const body: TriquiBody = player.body;

player.tuning.runSpeed = 200;
player.tuning.gravityY = 700;
const tuning: TriquiTuning = { ...DEFAULT_TUNING, dashes: 2 };
const fall: number = DEFAULT_TUNING.maxFallSpeed;

const steps: number = engine.advance(1 / 60);
const moved: number = player.collider.moveX(body, 3);
const alpha: number = engine.alpha;
const drawX: number = body.renderX(alpha);
const state: string = player.state;

body.onCollision = (contact: TriquiContact) => {
    const face: string = contact.face;
    const speed: number = contact.speed;
    void face; void speed;
};
body.onSensor = (sensor, entering) => {
    const harmful: boolean = sensor.harmful;
    void harmful; void entering;
};
player.think = (self, step) => {
    self.input.right = step > 0 ? 1 : 0;
};
body.hurtbox = { top: 6, left: 3, right: 3 };
body.data = { sprite: 'hero' };

const lift = engine.addPlatform(0, 0, 64, 12, { points: [{ x: 64, y: 0 }], speed: 60 });
const coin = engine.addSensor(0, 0, 16, 16, 'coin');
coin.harmful = false;

const shot = engine.fire(0, 0, 900, 0, {
    owner: body,
    onContact: (contact: TriquiShotContact) => (contact.kind === 'body' ? 'pass' : 'stop'),
    onEnd: (projectile, reason) => {
        void projectile; void reason;
    },
});
const stoppedKind: string | undefined = shot.stoppedBy?.kind;

for (const actor of engine.actors) {
    const kind: string = actor.kind;
    const id: number = actor.id;
    void kind; void id;
}

engine.remove(player);
const back: boolean = engine.add(player);

export { tuning, fall, steps, moved, drawX, state, lift, stoppedKind, back };

/* ── what must not ──────────────────────────────────────────────────────── */

// @ts-expect-error a misspelt override
engine.spawn(0, 0, 20, 28, { runSped: 3 });

// @ts-expect-error a misspelt field on the live tuning
player.tuning.runSped = 200;

// @ts-expect-error the wrong kind of value
player.tuning.runSpeed = 'fast';

// @ts-expect-error a misspelt field on a contact
body.onCollision = contact => console.log(contact.fase);

// @ts-expect-error a misspelt input
player.think = self => { self.input.rigth = 1; };

// @ts-expect-error a projectile option of the wrong kind
engine.fire(0, 0, 1, 0, { life: 'long' });

// @ts-expect-error a platform option of the wrong kind
engine.addPlatform(0, 0, 10, 10, { speed: 'slow' });

// @ts-expect-error advance takes seconds as a number
engine.advance('16ms');
