/**
    * @file triqui.js, a platformer character engine built on ray casting.
    *
    * Geometry queries, such as finding what a ray hits, are delegated to
    * raycast2d. This file implements everything built on top of them: bodies with
    * velocity, collision resolution against the level, a tunable run and jump, and
    * a fixed time step.
    *
    * Geometry and character logic are kept separate. Ray casting is pure geometry
    * and can be tested in isolation, while character behaviour (speeds, jump
    * height, what counts as standing) is game specific tuning. Keeping the two
    * apart makes either one easier to change.
    *
    * The engine does not render, read input or own a canvas.
    *
    * Slopes are not supported, by design. All surfaces are axis aligned, which
    * allows a move to be resolved as two independent axes, a contact to be
    * identified by the face it occurred on, and gravity to be rotated in quarter
    * turns without special cases. A sloped surface has a normal that is not
    * aligned to an axis and requires its own resolution: speed along the surface,
    * snapping to the ground on a crest, and an angle based definition of standing.
    * That would be a second collider alongside this one.
    *
    * Ramps are built as staircases of tiles. Smoothing them only requires a step
    * up rule in the controller and no change to collision resolution.
    *
    * The dependency is imported by relative path so that the two files can sit
    * side by side with no bundler configuration. When raycast2d is installed from
    * npm instead, change the import below to 'raycast2d'.
    *
    * @example
    * import { TriquiWorld, TriquiEngine } from './triqui.js';
    *
    * const world = new TriquiWorld({ map, tileSize: 32 });
    * const engine = new TriquiEngine(world);
    * const player = engine.spawn(40, 420, 20, 28);
    *
    * player.input.right = 1;
    * engine.advance(1 / 60);
    * console.log(player.body.x, player.body.grounded);
    *
    * @author Emanuele Feronato
    * @version 0.1.0
    * @license MIT
*/

import { Raycaster, TileGrid, ShapeSet, RayHit, Filters } from './raycast.js';

/**
    * @type {number} size of one cell when a world is not told otherwise.
*/
const DEFAULT_TILE_SIZE = 32;

/**
    * @type {number} distance inside the body edge at which rays start, so that a
    *                body resting on a surface does not cast from inside it.
*/
const DEFAULT_SKIN = 0.5;

/**
    * @type {number} rays along each vertical face of a body. The spacing between
    *                rays must be smaller than the smallest obstacle the body must
    *                not pass through, which for a tile level means smaller than a
    *                cell.
*/
const DEFAULT_RAYS_X = 4;

/**
    * @type {number} rays along each horizontal face of a body.
*/
const DEFAULT_RAYS_Y = 4;

/**
    * @type {number} length of one physics step, in seconds.
*/
const DEFAULT_STEP = 1 / 120;

/**
    * @type {number} maximum frame duration processed, in seconds. Time beyond it
    *                is discarded, so a tab resumed from the background does not
    *                run thousands of catch-up steps.
*/
const DEFAULT_MAX_FRAME = 0.25;

/**
    * @type {number} cell reference raycast2d reports for a hit that is not a
    *                tile.
*/
const NO_CELL = -1;

/* ═══════════════════════════════════════════════════════════════════════════
 * World
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
    * A tile level together with the ray caster that queries it.
    *
    * This class is a thin wrapper. The grid and the caster are raycast2d objects
    * and remain accessible, so additional raycast2d features (extra shape sources,
    * vision cones, line of sight tests) are used through them directly.
*/
export class TriquiWorld {

    /**
        * @param {object}     options
        * @param {number[][]} options.map             tile identifiers, as map[row][column];
        *                                             0 is empty, any other value is solid.
        * @param {number}     [options.tileSize]   size of one cell.
        * @param {Object<number, object>} [options.definitions]
        *        '{ [tileId]: definition }', passed to the grid. A definition of
        *        '{ solid: false }' creates a tile that rays pass through.
        * @param {Array}      [options.sources]       additional raycast2d sources queried
        *                                             after the grid, in the given order.
        * @param {boolean}    [options.bodiesCollide] whether bodies collide with each other
        *                                             as well as with the level. Disabled by
        *                                             default, so single character levels
        *                                             do not maintain a spatial hash.
    */
    constructor({
        map, tileSize = DEFAULT_TILE_SIZE, definitions = null, sources = [],
        bodiesCollide = false,
    }) {
        /**
            * @type {TileGrid} the level, as raycast2d sees it.
        */
        this.grid = new TileGrid({ map, tileSize, definitions });
        /**
            * Moving rectangles that rays can hit: always the platforms, and the
            * bodies when 'bodiesCollide' is enabled. They are stored as a raycast2d
            * source instead of a separate collision test, so standing on a platform
            * or on another character uses the same casts as standing on the floor.
            *
            * @type {ShapeSet}
        */
        this.shapes = new ShapeSet({ cellSize: tileSize * 2 });
        /**
            * @type {boolean} whether bodies are geometry to each other.
        */
        this.bodiesCollide = bodiesCollide;
        /**
            * @type {Raycaster} the caster every query goes through.
        */
        this.raycaster = new Raycaster([this.grid, this.shapes, ...sources]);
        /**
            * @type {number} size of one cell.
        */
        this.tileSize = tileSize;
        /**
            * @type {object} entry passed to the visitor of
            *                {@link TriquiWorld#overlapping}, reused between calls.
            *                @private
        */
        this.entry = { tileId: 0, cellX: NO_CELL, cellY: NO_CELL, tile: null, other: null };
        /**
            * Game data attached to individual cells, keyed by cell. Tile
            * definitions apply to every tile with the same identifier; this map
            * applies to a single cell. The map is only read when it is not empty.
            *
            * @type {Map<number, *>} @private
        */
        this.tileData = new Map();
    }

    /**
        * @returns {number} how many columns the map has.
    */
    get columns() {
        return this.grid.columnCount;
    }

    /**
        * @returns {number} how many rows the map has.
    */
    get rows() {
        return this.grid.rowCount;
    }

    /**
        * Reads a cell. Cells outside the map read as empty, as configured on the
        * grid, so a level that must contain its characters needs a solid border.
        *
        * @param {number} cellX column.
        * @param {number} cellY row.
        * @returns {number} the tile identifier.
    */
    tileAt(cellX, cellY) {
        return this.grid.readTile(cellX, cellY);
    }

    /**
        * Reads the data attached to a cell.
        *
        * @param {number} cellX column.
        * @param {number} cellY row.
        * @returns {*} the attached value, or null.
    */
    dataAt(cellX, cellY) {
        if (this.tileData.size === 0) {
            return null;
        }
        return this.tileData.get(cellY * this.columns + cellX) ?? null;
    }

    /**
        * Attaches data to a cell, for example a sprite for that tile or the state
        * of a door. Passing null removes it.
        *
        * @param {number} cellX column.
        * @param {number} cellY row.
        * @param {*}      value the value to attach.
        * @returns {TriquiWorld} this world, for chaining.
    */
    setDataAt(cellX, cellY, value) {
        const key = cellY * this.columns + cellX;
        if (value === null || value === undefined) {
            this.tileData.delete(key);
        }
        else {
            this.tileData.set(key, value);
        }
        return this;
    }

    /**
        * Visits every tile and shape that overlaps a rectangle.
        *
        * Ray casts cannot answer overlap queries: a cast reports what lies ahead
        * of a point, which suits walls but not pickups, where the question is
        * whether a box is inside another. The test is therefore a plain box
        * comparison done here, keeping raycast2d limited to rays.
        *
        * The entry passed to the visitor is reused between calls and must not be
        * stored.
        *
        * @param {number}   x      left edge of the box to test.
        * @param {number}   y      top edge.
        * @param {number}   width  width of the box.
        * @param {number}   height height of the box.
        * @param {(entry: {tileId: number, cellX: number, cellY: number,
        *          tile: ?object, other: *}) => (boolean|void)} visit
        *        called for each overlap; returning false stops the search.
    */
    overlapping(x, y, width, height, visit) {
        const size = this.tileSize;
        const right = x + width;
        const bottom = y + height;
        const entry = this.entry;

        const lastCol = Math.ceil(right / size) - 1;
        const lastRow = Math.ceil(bottom / size) - 1;
        for (let row = Math.floor(y / size); row <= lastRow; row++) {
            for (let col = Math.floor(x / size); col <= lastCol; col++) {
                const tileId = this.grid.readTile(col, row);
                if (tileId === 0) {
                    continue;
                }
                entry.tileId = tileId;
                entry.cellX = col;
                entry.cellY = row;
                entry.tile = this.grid.readDefinition(tileId);
                entry.other = null;
                if (visit(entry) === false) {
                    return;
                }
            }
        }

        /*
            * Linear scan over the shapes. The raycast2d spatial hash is indexed
            * for rays, not boxes, and a linear scan is faster for a few platforms.
            * Hundreds of shapes would need a dedicated index.
        */
        for (const collider of this.shapes.colliders) {
            if (collider.x >= right || collider.x + collider.width <= x
                || collider.y >= bottom || collider.y + collider.height <= y) {
                continue;
            }
            entry.tileId = 0;
            entry.cellX = NO_CELL;
            entry.cellY = NO_CELL;
            entry.tile = null;
            entry.other = collider.userData;
            if (visit(entry) === false) {
                return;
            }
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Body
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
    * An axis aligned rectangle that stores its position before the current step.
    *
    * Physics runs at a fixed step while the display refreshes at its own rate.
    * Renderers draw each rectangle between its previous and current position,
    * using {@link TriquiEngine#alpha}. Bodies and platforms both need this, so it
    * is implemented here.
*/
export class TriquiRectangle {

    /**
        * @param {number} x      left edge.
        * @param {number} y      top edge.
        * @param {number} width  width, in world units.
        * @param {number} height height, in world units.
    */
    constructor(x, y, width, height) {
        /**
            * @type {number} left edge.
        */
        this.x = x;
        /**
            * @type {number} top edge.
        */
        this.y = y;
        /**
            * @type {number} width, in world units.
        */
        this.width = width;
        /**
            * @type {number} height, in world units.
        */
        this.height = height;
        /**
            * @type {number} left edge before the current step.
        */
        this.previousX = x;
        /**
            * @type {number} top edge before the current step.
        */
        this.previousY = y;
        /**
            * @type {?{x: number, y: number, width: number, height: number}} this
            *       rectangle's entry in the world's shape set, when it collides
            *       with anything. Managed by the engine.
        */
        this.shape = null;
        /**
            * @type {number} unique identifier, assigned when the rectangle is added
            *                and never reused within the same engine.
        */
        this.id = 0;
        /**
            * @type {string} 'body', 'platform', 'sensor' or 'projectile', so the
            *                type can be checked without instanceof.
        */
        this.kind = '';
        /**
            * Game data attached to this rectangle, such as a sprite or a game
            * object. Initialised to null and never read by the engine.
            *
            * It is included in every contact involving this rectangle, so a
            * collision handler can identify what was hit.
            *
            * @type {*}
        */
        this.data = null;
    }

    /**
        * Sets the position without interpolation.
        *
        * Use it for respawns and teleports. Assigning x and y directly leaves the
        * previous position unchanged, so the next frame is interpolated across
        * the whole distance.
        *
        * @param {number} x left edge.
        * @param {number} y top edge.
    */
    place(x, y) {
        this.x = x;
        this.y = y;
        this.previousX = x;
        this.previousY = y;
    }

    /**
        * @param {number} alpha how far the frame is between the last two steps,
        *                       from {@link TriquiEngine#alpha}.
        * @returns {number} the left edge, interpolated.
    */
    renderX(alpha) {
        return this.previousX + (this.x - this.previousX) * alpha;
    }

    /**
        * @param {number} alpha how far the frame is between the last two steps.
        * @returns {number} the top edge, interpolated.
    */
    renderY(alpha) {
        return this.previousY + (this.y - this.previousY) * alpha;
    }

    /**
        * Interpolated horizontal centre, for renderers that anchor sprites at the
        * centre instead of the top left corner, such as Phaser.
        *
        * @param {number} alpha how far the frame is between the last two steps.
        * @returns {number} the horizontal centre, interpolated.
    */
    renderCenterX(alpha) {
        return this.renderX(alpha) + this.width / 2;
    }

    /**
        * @param {number} alpha how far the frame is between the last two steps.
        * @returns {number} the vertical middle, interpolated.
    */
    renderCenterY(alpha) {
        return this.renderY(alpha) + this.height / 2;
    }
}

/**
    * An axis aligned rectangle with a velocity and the contacts of its last move.
    * It contains no movement rules: the collider moves it and a controller sets
    * its velocity.
    *
    * It also stores the position and contacts from before the current step. The
    * physics does not use them; they exist for rendering and events. The draw
    * position is interpolated between the two positions (see
    * {@link TriquiBody#renderX}), and events such as a landing are computed by
    * comparing the two sets of contacts.
*/
export class TriquiBody extends TriquiRectangle {

    /**
        * @param {number} x      left edge.
        * @param {number} y      top edge.
        * @param {number} width  width, in world units.
        * @param {number} height height, in world units.
    */
    constructor(x, y, width, height) {
        super(x, y, width, height);
        /**
            * @type {number} velocity, in world units per second.
        */
        this.velocityX = 0;
        /**
            * @type {number} velocity, in world units per second.
        */
        this.velocityY = 0;
        /**
            * @type {{left: boolean, right: boolean, top: boolean, bottom: boolean}}
            *       faces that were blocked during the last move.
        */
        this.touching = { left: false, right: false, top: false, bottom: false };
        /**
            * Horizontal component of the unit gravity direction. Updated by the
            * controller. It is stored on the body because the grounded test
            * depends on it and renderers use that test too.
            *
            * @type {number}
        */
        this.downX = 0;
        /**
            * @type {number} vertical component of the unit gravity direction.
        */
        this.downY = 1;
        /**
            * @type {number} facing direction perpendicular to gravity: 1 for the
            *                direction right maps to, -1 for the opposite. Used by
            *                dashes with no direction held and by renderers.
        */
        this.facing = 1;
        /**
            * @type {?TriquiController} controller driving this body, set by the
            *                           engine. Lets a renderer iterating the
            *                           actors read the controller state.
        */
        this.controller = null;
        /**
            * @type {?{x: number, y: number, width: number, height: number}} this
            *       body's hurtbox in the projectile target set. Managed by the
            *       engine, and only created once a projectile has been fired.
        */
        this.targetShape = null;
        /**
            * Inset of the hurtbox from each edge of the body. Defaults to zero on
            * every side, so the hurtbox matches the body.
            *
            * Walls and floors always use the full body. The hurtbox is used by
            * projectiles, harmful sensors and {@link TriquiBody#hurtOverlaps}. A small
            * inset makes near misses count as misses.
            *
            * Sides refer to the screen, not to the character, because the
            * rectangle does not rotate with gravity. A game that rotates gravity
            * and wants the inset to follow must update these values itself.
            *
            * @type {{left?: number, right?: number, top?: number, bottom?: number}}
        */
        this.hurtbox = { left: 0, right: 0, top: 0, bottom: 0 };
        /**
            * @type {boolean} the current upward motion comes from an impulse, not a
            *                 jump, so releasing the jump button must not cut it.
            *                 Cleared by the controller once the body falls again.
        */
        this.launched = false;
        /**
            * @type {{left: boolean, right: boolean, top: boolean, bottom: boolean}}
            *       blocked faces before the current step.
        */
        this.previouslyTouching = { left: false, right: false, top: false, bottom: false };
        /**
            * Contacts made during the current frame, in order. At most two per
            * step, one per axis. Cleared at the start of each frame.
            *
            * @type {TriquiContact[]}
        */
        this.contacts = [];
        /**
            * Called when a contact is resolved, with the same object that is added
            * to {@link TriquiBody#contacts}. Use the list for once per frame
            * processing and the callback for an immediate response.
            *
            * @type {((contact: TriquiContact) => void) | null}
        */
        this.onCollision = null;
        /**
            * @type {?TriquiPlatform} platform the body is standing on, or null.
            *                         Set during contact resolution and used in
            *                         the next step to carry the body.
        */
        this.riding = null;
        /**
            * @type {number} remaining seconds during which one way platforms do not
            *                block the body. Decremented by the controller.
        */
        this.dropTimer = 0;
        /**
            * Sensors the body currently overlaps. Kept across steps so entering and
            * leaving can be detected.
            *
            * @type {Set<TriquiSensor>}
        */
        this.inside = new Set();
        /**
            * @type {TriquiSensor[]} sensors entered during this frame.
        */
        this.justEntered = [];
        /**
            * @type {TriquiSensor[]} sensors left during this frame.
        */
        this.justLeft = [];
        /**
            * Called when the body enters or leaves a sensor.
            *
            * @type {((sensor: TriquiSensor, entering: boolean) => void) | null}
        */
        this.onSensor = null;
        /**
            * @type {boolean} the body overlaps solid geometry. The collider never
            *                 causes this, so something else moved into the body.
        */
        this.crushed = false;
        /**
            * @type {*} what the body is caught in: a platform, a tile definition or
            *           a tile identifier. Null when not crushed.
        */
        this.crushedBy = null;
        /**
            * @type {boolean} the body was crushed during this frame.
        */
        this.justCrushed = false;
        /**
            * Called when the body becomes crushed. Without a handler the body
            * simply stays stuck.
            *
            * @type {((culprit: *) => void) | null}
        */
        this.onCrushed = null;
        /**
            * @type {boolean} the body met the ground during this frame.
        */
        this.justLanded = false;
        /**
            * @type {boolean} the body left the ground during this frame, by jumping
            *                 or by walking off an edge.
        */
        this.justLeftGround = false;
        /**
            * @type {boolean} the body met a ceiling during this frame.
        */
        this.justHitCeiling = false;
        /**
            * @type {boolean} the body met a wall during this frame.
        */
        this.justHitWall = false;
    }

    /**
        * Adds velocity, in world units per second.
        *
        * Assigning the velocity directly also works, because the controller reads
        * it at the start of every step, but an impulse adds to the current motion,
        * which is the usual intent for springs, knockback and charged jumps.
        *
        * It also flags the upward motion as external, so the controller does not
        * cut it when the jump button is not held.
        *
        * @param {number} x horizontal, positive to the right.
        * @param {number} y vertical, positive downwards.
        * @returns {TriquiBody} this body, for chaining.
    */
    impulse(x, y) {
        this.velocityX += x;
        this.velocityY += y;
        this.launched = true;
        return this;
    }

    /**
        * Adds velocity relative to gravity instead of the world axes: along the
        * run axis and against gravity.
        *
        * Prefer this over {@link TriquiBody#impulse} for springs and jumps. When
        * gravity is rotated, "up" on screen and "away from the ground" differ, and
        * this method always uses the latter.
        *
        * @param {number} along along the run axis, positive in the direction right
        *                       maps to.
        * @param {number} away  against gravity, positive away from the ground.
        * @returns {TriquiBody} this body, for chaining.
    */
    impulseAligned(along, away) {
        return this.impulse(
            along * this.downY - away * this.downX,
            -along * this.downX - away * this.downY,
        );
    }

    /**
        * Whether the faces pointing in a given direction are blocked.
        *
        * Contacts are stored per face because the collider works per axis, while
        * most queries are expressed as directions. For a diagonal direction every
        * face with a matching component is checked, so a gravity pointing down
        * and left reports both the floor and the left wall.
        *
        * @param {number}  dirX       direction to test.
        * @param {number}  dirY       direction to test.
        * @param {{left: boolean, right: boolean, top: boolean, bottom: boolean}}
        *        [contacts] contact set to read, the current one by default.
        * @returns {boolean} true when a face in that direction is blocked.
    */
    touchingTowards(dirX, dirY, contacts = this.touching) {
        return Boolean(
            (dirY > 0 && contacts.bottom) || (dirY < 0 && contacts.top)
            || (dirX > 0 && contacts.right) || (dirX < 0 && contacts.left),
        );
    }

    /**
        * @returns {boolean} whether the body is standing on something, relative
        *                    to its gravity.
    */
    get grounded() {
        return this.touchingTowards(this.downX, this.downY);
    }

    /**
        * @returns {number} left edge of the hurtbox.
    */
    get hurtX() {
        return this.x + (this.hurtbox.left ?? 0);
    }

    /**
        * @returns {number} top edge of the hurtbox.
    */
    get hurtY() {
        return this.y + (this.hurtbox.top ?? 0);
    }

    /**
        * @returns {number} width of the hurtbox.
    */
    get hurtWidth() {
        return Math.max(0, this.width - (this.hurtbox.left ?? 0) - (this.hurtbox.right ?? 0));
    }

    /**
        * @returns {number} height of the hurtbox.
    */
    get hurtHeight() {
        return Math.max(0, this.height - (this.hurtbox.top ?? 0) - (this.hurtbox.bottom ?? 0));
    }

    /**
        * Whether the hurtboxes of this body and another overlap.
        *
        * Both insets apply, so the margins of the two bodies add up. To use only
        * one margin, give the other body a zero inset.
        *
        * @param {TriquiBody} other the other body.
        * @returns {boolean} true when the hurtboxes overlap.
    */
    hurtOverlaps(other) {
        return this.hurtX < other.hurtX + other.hurtWidth
            && this.hurtX + this.hurtWidth > other.hurtX
            && this.hurtY < other.hurtY + other.hurtHeight
            && this.hurtY + this.hurtHeight > other.hurtY;
    }

    /**
        * Speed along gravity: positive when falling, negative when rising, zero
        * at the apex of a jump.
        *
        * Velocity is stored in world axes for the collider and renderers.
        * Gameplay queries are usually relative to gravity, and with rotated
        * gravity they do not map to 'velocityY' and 'velocityX'.
        *
        * @returns {number} speed along gravity, in world units per second.
    */
    get fallSpeed() {
        return this.velocityX * this.downX + this.velocityY * this.downY;
    }

    /**
        * @returns {number} speed along the run axis, positive in the direction
        *                   right maps to.
    */
    get alongSpeed() {
        return this.velocityX * this.downY - this.velocityY * this.downX;
    }

    /**
        * Clears the engine state: contacts, events, touched faces, platform,
        * sensors and crush state. Position, velocity, size, facing, hurtbox, data
        * and callbacks are kept.
        *
        * @returns {TriquiBody} this body, for chaining.
    */
    reset() {
        for (const faces of [this.touching, this.previouslyTouching]) {
            faces.left = false;
            faces.right = false;
            faces.top = false;
            faces.bottom = false;
        }
        this.clearEvents();
        this.inside.clear();
        this.crushed = false;
        this.crushedBy = null;
        this.riding = null;
        this.dropTimer = 0;
        this.launched = false;
        return this;
    }

    /**
        * Clears the events and contacts of the previous frame. Called by the
        * engine once per frame, not once per step, so a frame that runs several
        * steps reports the events of all of them.
    */
    clearEvents() {
        this.justLanded = false;
        this.justLeftGround = false;
        this.justHitCeiling = false;
        this.justHitWall = false;
        this.justCrushed = false;
        this.contacts.length = 0;
        this.justEntered.length = 0;
        this.justLeft.length = 0;
    }

    /**
        * Stores the position and contacts before the body moves.
    */
    beginStep() {
        this.previousX = this.x;
        this.previousY = this.y;
        this.previouslyTouching.left = this.touching.left;
        this.previouslyTouching.right = this.touching.right;
        this.previouslyTouching.top = this.touching.top;
        this.previouslyTouching.bottom = this.touching.bottom;
    }

    /**
        * Derives events from the previous and current contacts. Flags stay set
        * until the frame ends, so events from several steps in one frame
        * accumulate.
    */
    endStep() {
        const now = this.touching;
        const before = this.previouslyTouching;
        const downX = this.downX;
        const downY = this.downY;
        /* The run axis is the gravity direction rotated by a quarter turn. */
        const alongX = downY;
        const alongY = -downX;

        const standing = this.touchingTowards(downX, downY, now);
        const stood = this.touchingTowards(downX, downY, before);
        if (standing && !stood) {
            this.justLanded = true;
        }
        if (!standing && stood) {
            this.justLeftGround = true;
        }

        if (this.touchingTowards(-downX, -downY, now)
            && !this.touchingTowards(-downX, -downY, before)) {
            this.justHitCeiling = true;
        }

        const walled = this.touchingTowards(alongX, alongY, now)
            || this.touchingTowards(-alongX, -alongY, now);
        const wasWalled = this.touchingTowards(alongX, alongY, before)
            || this.touchingTowards(-alongX, -alongY, before);
        if (walled && !wasWalled) {
            this.justHitWall = true;
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Platform
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
    * A rectangle that follows a route and carries the bodies standing on it.
    *
    * A platform is geometry, not a character: it is not pushed, does not fall and
    * always reaches its next point. Riders are carried by the engine, which moves
    * them through the collider by the platform's displacement, so a rider carried
    * into a wall stops at the wall.
*/
export class TriquiPlatform extends TriquiRectangle {

    /**
        * @param {number} x                      left edge, at the start.
        * @param {number} y                      top edge, at the start.
        * @param {number} width                  width, in world units.
        * @param {number} height                 height, in world units.
        * @param {object} [options]
        * @param {Array<{x: number, y: number}>} [options.points] route points, as
        *                                        top left corners. The starting
        *                                        position is always the first point.
        * @param {number}  [options.speed=60]    travel speed, in world units per
        *                                        second.
        * @param {string}  [options.loop]        'pingPong' to travel back and
        *                                        forth, 'cycle' to return to the
        *                                        first point, 'once' to stop at the
        *                                        last.
        * @param {boolean} [options.oneWay]      whether bodies can pass through it
        *                                        from below.
    */
    constructor(x, y, width, height, {
        points = [], speed = 60, loop = 'pingPong', oneWay = false,
    } = {}) {
        super(x, y, width, height);
        /**
            * @type {Array<{x: number, y: number}>} route points, starting position
            *                                      first.
        */
        this.points = points.length && points[0].x === x && points[0].y === y
            ? points.slice()
            : [{ x, y }, ...points];
        /**
            * @type {number} travel speed, in world units per second.
        */
        this.speed = speed;
        /**
            * @type {string} behaviour at the end of the route.
        */
        this.loop = loop;
        /**
            * @type {boolean} whether bodies can pass through it from below.
        */
        this.oneWay = oneWay;
        /**
            * @type {number} horizontal displacement in the last step, applied to
            *                riders.
        */
        this.deltaX = 0;
        /**
            * @type {number} vertical displacement in the last step.
        */
        this.deltaY = 0;
        /**
            * @type {number} horizontal velocity, in world units per second. Same
            *                as the displacement, in body velocity units, so the
            *                two can be compared.
        */
        this.velocityX = 0;
        /**
            * @type {number} vertical velocity, in world units per second.
        */
        this.velocityY = 0;
        /**
            * @type {number} index of the target point. @private
        */
        this.target = this.points.length > 1 ? 1 : 0;
        /**
            * @type {number} 1 moving forward along the route, -1 moving back.
            *                @private
        */
        this.way = 1;
    }

    /**
        * Moves the platform along its route for one step.
        *
        * @param {number} seconds step duration.
    */
    step(seconds) {
        this.previousX = this.x;
        this.previousY = this.y;
        this.deltaX = 0;
        this.deltaY = 0;
        this.velocityX = 0;
        this.velocityY = 0;

        if (this.points.length < 2 || this.speed <= 0) {
            return;
        }

        let budget = this.speed * seconds;
        /* Prevents an infinite loop on a route with two identical points. */
        for (let guard = 0; budget > 0 && guard < this.points.length + 2; guard++) {
            const stop = this.points[this.target];
            const toX = stop.x - this.x;
            const toY = stop.y - this.y;
            const left = Math.hypot(toX, toY);

            if (left > budget) {
                this.x += (toX / left) * budget;
                this.y += (toY / left) * budget;
                break;
            }
            this.x = stop.x;
            this.y = stop.y;
            budget -= left;
            if (!this.chooseNextStop()) {
                break;
            }
        }

        this.deltaX = this.x - this.previousX;
        this.deltaY = this.y - this.previousY;
        this.velocityX = this.deltaX / seconds;
        this.velocityY = this.deltaY / seconds;
    }

    /**
        * Selects the next target point after the current one is reached.
        *
        * @returns {boolean} false when the route has ended and the platform stops.
        * @private
    */
    chooseNextStop() {
        const last = this.points.length - 1;
        if (this.loop === 'cycle') {
            this.target = (this.target + 1) % this.points.length;
            return true;
        }
        if (this.loop === 'once' && this.target === last) {
            return false;
        }
        this.target += this.way;
        if (this.target > last) {
            this.target = last - 1;
            this.way = -1;
        }
        else if (this.target < 0) {
            this.target = 1;
            this.way = 1;
        }
        return true;
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Collider
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
    * Moves bodies through a world without letting them overlap solid geometry.
    *
    * For each move, rays are cast from the leading face, evenly spaced along it,
    * and the body advances up to the nearest hit. The two axes are resolved one
    * after the other. This lets a body slide along a wall instead of sticking to
    * it, and keeps horizontal speed intact on landing.
    *
    * Rays start slightly inside the body (the skin). Otherwise a body resting on
    * the floor would cast from the floor surface and always get a hit at
    * distance zero.
*/
export class TriquiCollider {

    /**
        * @param {TriquiWorld} world             world to move through.
        * @param {object}      [options]
        * @param {number}      [options.skin]    distance inside the edge where rays start.
        * @param {number}      [options.raysX] rays along the vertical faces; their spacing
        *                                        must be smaller than the smallest obstacle
        *                                        the body must not pass through.
        * @param {number}      [options.raysY] rays along the horizontal faces.
    */
    constructor(world, {
        skin = DEFAULT_SKIN, raysX = DEFAULT_RAYS_X, raysY = DEFAULT_RAYS_Y,
    } = {}) {
        /**
            * @type {TriquiWorld} world this collider moves bodies through.
        */
        this.world = world;
        /**
            * @type {Raycaster} caster used for every query, taken from the world.
        */
        this.raycaster = world.raycaster;
        /**
            * @type {number} distance inside the edge where rays start.
        */
        this.skin = skin;
        /**
            * @type {number} rays along the vertical faces.
        */
        this.raysX = raysX;
        /**
            * @type {number} rays along the horizontal faces.
        */
        this.raysY = raysY;
        /**
            * @type {boolean} whether to record every cast, for debug drawing.
        */
        this.recordRays = false;
        /**
            * @type {Array<{body: TriquiBody, x: number, y: number, dirX: number,
            *               dirY: number, length: number, hit: boolean, tileId: number}>}
            *       casts of the last move, when 'recordRays' is enabled.
        */
        this.rays = [];
        /**
            * @type {RayHit} hit object reused by every cast, to avoid allocations.
            *                @private
        */
        this.target = new RayHit();
        /**
            * @type {?TriquiBody} body currently being moved, used to exclude its
            *                     own rectangle from the casts. @private
        */
        this.moving = null;
        /**
            * Nearest hit of the move being resolved, copied out of the shared
            * RayHit because the next cast overwrites it.
            *
            * @type {object} @private
        */
        this.kept = {
            normalX: 0, normalY: 0, tileId: 0, cellX: NO_CELL, cellY: NO_CELL, payload: null,
        };
        /**
            * Options object passed to every cast. Created once to avoid allocating
            * eight objects per body per step.
            *
            * @type {object} @private
        */
        this.castOptions = {
            target: this.target,
            filter: candidate => this.blocks(candidate),
        };
    }

    /**
        * Filter that decides whether a ray hit blocks the moving body.
        *
        * @param {object} candidate the hit candidate, from raycast2d.
        * @returns {boolean} true when it blocks.
        * @private
    */
    blocks(candidate) {
        const payload = candidate.userData;
        const body = this.moving;

        if (payload instanceof TriquiBody) {
            /*
                * A body never blocks itself, and a body it already overlaps does
                * not block it either, so overlapping bodies can separate.
            */
            return payload !== body && !candidate.startedInside;
        }

        if (payload && payload.oneWay) {
            /*
                * One way geometry only blocks from above. It blocks a body moving
                * towards it feet first whose ray starts outside the surface. A hit
                * closer than the skin means the ray started past the surface, so
                * the body is already through.
                *
                * The drop through timer disables this check entirely.
            */
            if (body.dropTimer > 0) {
                return false;
            }
            const feetFirst = candidate.directionX * body.downX
                + candidate.directionY * body.downY;
            return feetFirst > 0 && candidate.distance >= this.skin;
        }

        return Filters.blocking(candidate);
    }

    /**
        * Copies the current nearest hit. The RayHit is shared by every cast, so
        * after the last cast it holds that cast's result.
        *
        * @param {RayHit} hit the hit to copy.
        * @private
    */
    keep(hit) {
        this.kept.normalX = hit.normalX;
        this.kept.normalY = hit.normalY;
        this.kept.tileId = hit.tileId;
        this.kept.cellX = hit.cellX;
        this.kept.cellY = hit.cellY;
        this.kept.payload = hit.userData;
    }

    /**
        * Records that a body has landed on a platform, so the engine carries it in
        * the next step.
        *
        * This runs before the velocity is updated and before callbacks fire,
        * because both depend on it: a rider does not inherit the platform speed,
        * and collision callbacks may read the platform.
        *
        * @param {TriquiBody} body who landed.
        * @param {number}     dirX direction of travel.
        * @param {number}     dirY direction of travel.
        * @private
    */
    claimRide(body, dirX, dirY) {
        const surface = this.kept.payload;
        if (surface instanceof TriquiPlatform
            && dirX * body.downX + dirY * body.downY > 0) {
            body.riding = surface;
        }
    }

    /**
        * Velocity, along one axis, of what the body has just hit.
        *
        * Hitting a static wall sets the speed on that axis to zero. Hitting a
        * moving object sets it to the object's speed instead, so a character
        * following a moving piston matches its speed instead of stopping and
        * restarting every step.
        *
        * Bodies standing on a platform are excluded: the platform already carries
        * them, and inheriting its speed would move them twice.
        *
        * @param {TriquiBody} body  body that made the contact.
        * @param {string}     axis  'velocityX' or 'velocityY'.
        * @returns {number} the resulting speed.
        * @private
    */
    surfaceSpeed(body, axis) {
        const surface = this.kept.payload;
        if (surface instanceof TriquiPlatform && body.riding !== surface) {
            return surface[axis];
        }
        return 0;
    }

    /**
        * Records a contact and calls the body's 'onCollision' handler.
        *
        * The collider has the tile, cell, surface normal and other rectangle at
        * this point; they are lost once the move is resolved. Most collision
        * handling (hazards, pickups, surface dependent sounds, landing damage)
        * needs that information, not just the fact that the body was blocked.
        *
        * The body velocity is already updated when the handler runs, so the
        * handler can override it. A spring tile, for example, applies an impulse
        * from here. The impact speed is in the contact's 'speed' field.
        *
        * @param {TriquiBody} body   body that was blocked.
        * @param {string}     face   blocked face.
        * @param {number}     dirX   direction of travel.
        * @param {number}     dirY   direction of travel.
        * @param {number}     speed  speed along the axis before the contact.
        * @private
    */
    report(body, face, dirX, dirY, speed) {
        const kept = this.kept;
        const payload = kept.payload;
        const other = payload instanceof TriquiBody || payload instanceof TriquiPlatform
            ? payload
            : null;

        const contact = {
            body,
            face,
            other,
            tile: other ? null : payload,
            tileId: other ? 0 : kept.tileId,
            cellX: other ? NO_CELL : kept.cellX,
            cellY: other ? NO_CELL : kept.cellY,
            /* Game data of whatever was hit: the rectangle's data or the cell's data. */
            data: other ? other.data : this.world.dataAt(kept.cellX, kept.cellY),
            normalX: kept.normalX,
            normalY: kept.normalY,
            directionX: dirX,
            directionY: dirY,
            /* Impact speed relative to what was hit, not to the ground, so landing on a
               platform moving the same way is soft. */
            speed: Math.abs(speed - (other instanceof TriquiPlatform
                ? (dirX !== 0 ? other.velocityX : other.velocityY)
                : 0)),
        };

        body.contacts.push(contact);
        if (body.onCollision) {
            body.onCollision(contact);
        }
    }

    /**
        * Moves a body horizontally, stopping at the first obstacle.
        *
        * @param {TriquiBody} body   the body to move.
        * @param {number}     amount signed distance.
        * @returns {number} the distance actually moved.
    */
    moveX(body, amount) {
        body.touching.left = false;
        body.touching.right = false;
        if (amount === 0) {
            return 0;
        }
        this.moving = body;

        const skin = this.skin;
        const direction = Math.sign(amount);
        const reach = Math.abs(amount) + skin;
        const face = direction > 0 ? body.x + body.width - skin : body.x + skin;
        const first = body.y + skin;
        const last = body.y + body.height - skin;
        let nearest = reach;

        for (let index = 0; index < this.raysX; index++) {
            const originY = first + (last - first) * (index / (this.raysX - 1));
            const hit = this.raycaster.cast(
                face, originY, direction, 0, reach, this.castOptions,
            );
            if (this.recordRays) {
                this.record(body, face, originY, direction, 0, hit, reach);
            }
            if (hit && hit.distance < nearest) {
                nearest = hit.distance;
                this.keep(hit);
            }
        }

        const moved = direction * Math.max(0, nearest - skin);
        body.x += moved;

        if (nearest < reach) {
            const speed = body.velocityX;
            if (direction > 0) {
                body.touching.right = true;
            }
            else {
                body.touching.left = true;
            }
            this.claimRide(body, direction, 0);
            body.velocityX = this.surfaceSpeed(body, 'velocityX');
            this.report(body, direction > 0 ? 'right' : 'left', direction, 0, speed);
        }
        return moved;
    }

    /**
        * Moves a body vertically, stopping at the first obstacle.
        *
        * @param {TriquiBody} body   the body to move.
        * @param {number}     amount signed distance.
        * @returns {number} the distance actually moved.
    */
    moveY(body, amount) {
        body.touching.top = false;
        body.touching.bottom = false;
        if (amount === 0) {
            return 0;
        }
        this.moving = body;

        const skin = this.skin;
        const direction = Math.sign(amount);
        const reach = Math.abs(amount) + skin;
        const face = direction > 0 ? body.y + body.height - skin : body.y + skin;
        const first = body.x + skin;
        const last = body.x + body.width - skin;
        let nearest = reach;

        for (let index = 0; index < this.raysY; index++) {
            const originX = first + (last - first) * (index / (this.raysY - 1));
            const hit = this.raycaster.cast(
                originX, face, 0, direction, reach, this.castOptions,
            );
            if (this.recordRays) {
                this.record(body, originX, face, 0, direction, hit, reach);
            }
            if (hit && hit.distance < nearest) {
                nearest = hit.distance;
                this.keep(hit);
            }
        }

        const moved = direction * Math.max(0, nearest - skin);
        body.y += moved;

        if (nearest < reach) {
            const speed = body.velocityY;
            if (direction > 0) {
                body.touching.bottom = true;
            }
            else {
                body.touching.top = true;
            }
            this.claimRide(body, 0, direction);
            body.velocityY = this.surfaceSpeed(body, 'velocityY');
            this.report(body, direction > 0 ? 'bottom' : 'top', 0, direction, speed);
        }
        return moved;
    }

    /**
        * Records a cast for debug drawing. The hit object is reused by the next
        * cast, so only primitive values are copied.
        *
        * @param {TriquiBody} body    body that cast the ray. One collider serves
        *                               every body, so this is needed to tell their
        *                               rays apart.
        * @param {number}  originX ray origin.
        * @param {number}  originY ray origin.
        * @param {number}  dirX    ray direction.
        * @param {number}  dirY    ray direction.
        * @param {?RayHit} hit     the hit, if any.
        * @param {number}  reach   maximum ray length.
        * @private
    */
    record(body, originX, originY, dirX, dirY, hit, reach) {
        this.rays.push({
            body,
            x: originX,
            y: originY,
            dirX,
            dirY,
            length: hit ? hit.distance : reach,
            hit: Boolean(hit),
            tileId: hit ? hit.tileId : 0,
        });
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Sensor
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
    * A rectangle that detects overlaps without blocking movement.
    *
    * Typical uses are pickups, doors, checkpoints, water and kill zones. Sensors
    * are not part of the shape set, so rays pass through them, and they are
    * tested with box overlaps. They report transitions, entering and leaving,
    * rather than the overlap itself.
*/
export class TriquiSensor extends TriquiRectangle {

    /**
        * @param {number} x      left edge.
        * @param {number} y      top edge.
        * @param {number} width  width, in world units.
        * @param {number} height height, in world units.
        * @param {*}      [data] game data used to identify it.
    */
    constructor(x, y, width, height, data = null) {
        super(x, y, width, height);
        /**
            * @type {*} game data used to identify it. The same field every
            *           rectangle has, set through the constructor.
        */
        this.data = data;
        /**
            * @type {boolean} whether the sensor is active. Disabling a collected
            *                 pickup is cheaper than removing and re-adding it.
        */
        this.enabled = true;
        /**
            * Whether the sensor is a hazard. Harmful sensors are tested against the
            * body's hurtbox, so they ignore near misses. Other sensors are tested
            * against the full body, so a pickup touched by a single pixel still
            * counts.
            *
            * @type {boolean}
        */
        this.harmful = false;
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Projectile
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
    * A point that moves in a straight or ballistic line and reports everything it
    * passes through.
    *
    * A projectile is not a body. Each step it casts the segment from its current
    * position to its next one, and raycast2d returns every hit along it, sorted
    * by distance. It therefore cannot tunnel at any speed, and it sees every wall,
    * platform and character on the segment, not only the first.
    *
    * The response to each hit is left to the game. Every contact is recorded and
    * passed to 'onContact' in order: returning 'pass' continues through it, any
    * other value stops the projectile there. A bullet stops at the first hit, a
    * piercing shot passes characters and stops at walls, a ghost shot passes
    * everything. All of them are the same class with a different 'onContact'.
*/
export class TriquiProjectile extends TriquiRectangle {

    /**
        * @param {number} x         start position.
        * @param {number} y         start position.
        * @param {number} velocityX velocity, in world units per second.
        * @param {number} velocityY velocity, in world units per second.
        * @param {object} [options]
        * @param {number} [options.gravityX=0] acceleration, in world units per
        *                                      second squared. Zero for a bullet.
        * @param {number} [options.gravityY=0] vertical acceleration.
        * @param {number} [options.life=3]     lifetime, in seconds.
        * @param {?TriquiBody} [options.owner] body the projectile never hits,
        *                                      normally the one that fired it.
        * @param {((contact: TriquiShotContact) => (string|void)) | null}
        *        [options.onContact] called for each hit, in order; return 'pass'
        *        to continue through it.
        * @param {((projectile: TriquiProjectile, reason: string) => void) | null}
        *        [options.onEnd] called once when it stops or expires, with
        *        'stopped' or 'expired'.
    */
    constructor(x, y, velocityX, velocityY, {
        gravityX = 0, gravityY = 0, life = 3, owner = null,
        onContact = null, onEnd = null,
    } = {}) {
        super(x, y, 0, 0);
        /**
            * @type {number} velocity, in world units per second.
        */
        this.velocityX = velocityX;
        /**
            * @type {number} velocity, in world units per second.
        */
        this.velocityY = velocityY;
        /**
            * @type {number} acceleration, in world units per second squared.
        */
        this.gravityX = gravityX;
        /**
            * @type {number} acceleration, in world units per second squared.
        */
        this.gravityY = gravityY;
        /**
            * @type {number} lifetime, in seconds.
        */
        this.life = life;
        /**
            * @type {number} elapsed time, in seconds.
        */
        this.age = 0;
        /**
            * @type {?TriquiBody} body that fired it, which it never hits.
        */
        this.owner = owner;
        /**
            * @type {((contact: TriquiShotContact) => (string|void)) | null} called
            *       for each contact, in order; return 'pass' to continue through.
        */
        this.onContact = onContact;
        /**
            * @type {((projectile: TriquiProjectile, reason: string) => void) | null}
            *       called once when the projectile ends.
        */
        this.onEnd = onEnd;
        /**
            * @type {boolean} whether it is still moving.
        */
        this.alive = true;
        /**
            * @type {string} why it ended: 'stopped', 'expired' or 'removed'. Empty
            *                while it is still moving.
        */
        this.reason = '';
        /**
            * @type {TriquiShotContact[]} every hit over its lifetime, in order,
            *                             including the ones it passed through.
        */
        this.contacts = [];
        /**
            * @type {?TriquiShotContact} the contact it stopped at, if any.
        */
        this.stoppedBy = null;
        /**
            * @type {Set<object>} bodies and platforms already reported, so passing
            *                     through a character produces one contact, not
            *                     one per step spent inside it. @private
        */
        this.met = new Set();
        /**
            * @type {Set<number>} the same for tiles, by cell. A projectile passing
            *                     through a tile spends several steps inside it.
            *                     @private
        */
        this.metCells = new Set();
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Controller
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
    * Movement parameters of a character. Every character has its own copy, read
    * at the start of each of its steps, so values can be changed at runtime and
    * take effect on the next step.
    *
    * Speeds are in world units per second, accelerations and gravity in world
    * units per second squared, durations in seconds. The abilities at the end
    * are disabled when zero.
    *
    * @typedef {object} TriquiTuning
    * @property {number} gravityX        horizontal gravity. Together with gravityY
    *                                    it defines the down direction.
    * @property {number} gravityY        vertical gravity.
    * @property {number} maxFallSpeed    maximum speed along gravity.
    * @property {number} runSpeed        maximum speed along the run axis.
    * @property {number} runAcceleration acceleration towards runSpeed.
    * @property {number} groundFriction  deceleration on the ground.
    * @property {number} airFriction     deceleration in the air.
    * @property {number} jumpSpeed       initial speed of a jump from the ground.
    * @property {number} jumpCut         rising speed a jump is reduced to when the
    *                                    button is released.
    * @property {number} coyoteTime      time a jump is still allowed after
    *                                    leaving the ground.
    * @property {number} jumpBuffer      time a jump press is kept before
    *                                    landing.
    * @property {number} dropThroughTime time one way platforms stop blocking
    *                                    after pressing down.
    * @property {number} airJumps        number of jumps allowed in the air.
    * @property {number} airJumpSpeed    initial speed of an air jump.
    * @property {number} wallSlideSpeed  maximum fall speed against a wall; zero
    *                                    disables wall sliding.
    * @property {number} wallJumpAway    wall jump speed away from the wall; zero
    *                                    disables wall jumps.
    * @property {number} wallJumpUp      wall jump speed against gravity.
    * @property {number} wallJumpLock    time steering is ignored after a wall
    *                                    jump.
    * @property {number} wallGrace       time a wall jump is still allowed after
    *                                    leaving the wall.
    * @property {number} dashes          dashes available before landing again.
    * @property {number} dashSpeed       dash speed.
    * @property {number} dashTime        dash duration.
    * @property {number} dashCooldown    minimum time between two dashes.
*/

/**
    * A contact between a body and something that blocked it. Passed to
    * 'onCollision' and stored in 'body.contacts' for the frame.
    *
    * @typedef {object} TriquiContact
    * @property {TriquiBody}  body       the body that was blocked.
    * @property {string}      face       the blocked face of the body: 'left',
    *                                    'right', 'top' or 'bottom'.
    * @property {?(TriquiBody|TriquiPlatform)} other the body or platform hit,
    *                                    or null for the level.
    * @property {?object}     tile       the tile definition, for tile hits.
    * @property {number}      tileId     the tile identifier, or 0.
    * @property {number}      cellX      the tile column, or -1.
    * @property {number}      cellY      the tile row, or -1.
    * @property {*}           data       game data of what was hit.
    * @property {number}      normalX    surface normal.
    * @property {number}      normalY    surface normal.
    * @property {number}      directionX direction of travel.
    * @property {number}      directionY direction of travel.
    * @property {number}      speed      impact speed: the speed difference along
    *                                    the contact axis.
*/

/**
    * A hit along a projectile's path. Passed to its 'onContact' and stored in
    * 'projectile.contacts'.
    *
    * @typedef {object} TriquiShotContact
    * @property {TriquiProjectile} projectile the projectile.
    * @property {string}      kind       'tile', 'body' or 'platform'.
    * @property {?TriquiRectangle} other  the body or platform hit, or null.
    * @property {?object}     tile       the tile definition, for tile hits.
    * @property {number}      tileId     the tile identifier, or 0.
    * @property {number}      cellX      the tile column, or -1.
    * @property {number}      cellY      the tile row, or -1.
    * @property {*}           data       game data of what was hit.
    * @property {number}      x          hit position.
    * @property {number}      y          hit position.
    * @property {number}      normalX    surface normal.
    * @property {number}      normalY    surface normal.
    * @property {number}      distance   distance along this step's segment.
*/

/**
    * Default movement parameters. Changing a value here affects characters
    * spawned afterwards; pass overrides to 'spawn' to change a single character.
    *
    * @type {TriquiTuning}
*/
export const DEFAULT_TUNING = {
    /**
        * Gravity is a vector. Its direction defines down for the character, and
        * everything else is derived from it: which contacts count as ground, the
        * jump direction and the run axis. Rotating gravity rotates the whole
        * character behaviour.
    */
    gravityX: 0,
    gravityY: 2000,
    maxFallSpeed: 900,
    runSpeed: 220,
    runAcceleration: 2000,
    groundFriction: 2600,
    airFriction: 600,
    jumpSpeed: 560,
    /**
        * Rising speed a jump is reduced to when the button is released. This is
        * what makes a short press produce a lower jump.
    */
    jumpCut: 180,
    /**
        * Time after walking off a ledge during which a jump is still allowed. It
        * compensates for presses that arrive a few frames late.
    */
    coyoteTime: 0.1,
    /**
        * Time a jump press is kept before landing, so a press that arrives a few
        * frames early triggers a jump on touchdown. The counterpart of coyote
        * time.
    */
    jumpBuffer: 0.12,
    /**
        * Time one way platforms stop blocking after pressing down. It only needs
        * to cover the first step of the fall: once the feet are below the
        * surface, the collider no longer treats it as ground.
    */
    dropThroughTime: 0.1,

    /* ── abilities, disabled by default ────────────────────────────────── */

    /**
        * Number of jumps allowed in the air. Zero disables air jumps.
    */
    airJumps: 0,
    /**
        * @type {number} initial speed of an air jump. Usually slightly lower than
        *                jumpSpeed.
    */
    airJumpSpeed: 500,

    /**
        * Maximum fall speed while pushing against a wall. Zero disables wall
        * sliding.
    */
    wallSlideSpeed: 0,
    /**
        * Wall jump speed away from the wall. Zero disables wall jumps.
    */
    wallJumpAway: 0,
    /**
        * @type {number} wall jump speed against gravity.
    */
    wallJumpUp: 520,
    /**
        * Time steering is ignored after a wall jump. Without it, the player is
        * usually still holding towards the wall and moves straight back to it.
    */
    wallJumpLock: 0.12,
    /**
        * Time a wall jump is still allowed after leaving a wall. Coyote time for
        * walls.
    */
    wallGrace: 0.08,

    /**
        * Dashes available before landing again. Zero disables dashing.
    */
    dashes: 0,
    /**
        * @type {number} dash speed.
    */
    dashSpeed: 520,
    /**
        * @type {number} dash duration, in seconds.
    */
    dashTime: 0.14,
    /**
        * @type {number} minimum time between the start of two dashes, even when
        *                dashes are available.
    */
    dashCooldown: 0.2,
};

/**
    * Converts input into running and jumping.
    *
    * All movement is relative to gravity. Left and right move along the run axis
    * and jumps go against gravity, so when gravity is rotated the character
    * rotates with it: it walks on the wall it was falling past and jumps away
    * from it.
    *
    * The controller exposes an 'input' object. Keyboard code, gamepad code or an
    * AI writes into it; the controller does not distinguish between them.
*/
export class TriquiController {

    /**
        * @param {TriquiBody}     body      the body to drive.
        * @param {TriquiCollider} collider  the collider that moves it.
        * @param {Partial<TriquiTuning>} [tuning] overrides of {@link DEFAULT_TUNING}.
    */
    constructor(body, collider, tuning = {}) {
        /**
            * @type {TriquiBody} the driven body.
        */
        this.body = body;
        /**
            * @type {TriquiCollider} the collider that moves it.
        */
        this.collider = collider;
        /**
            * @type {TriquiTuning} this character's parameters: a copy of the
            *                     defaults with the overrides applied. Can be
            *                     changed at any time.
        */
        this.tuning = { ...DEFAULT_TUNING, ...tuning };
        /**
            * @type {{left: number, right: number, up: number, down: number,
            *         jump: boolean, jumpPressed: boolean, dash: boolean,
            *         dashPressed: boolean}}
            *       input state. 'jump' and 'dash' are the held states,
            *       'jumpPressed' and 'dashPressed' are set on the frame the button
            *       goes down and cleared by the engine. 'down' drops through the
            *       one way platform under the feet.
        */
        this.input = {
            left: 0, right: 0, up: 0, down: 0,
            jump: false, jumpPressed: false, dash: false, dashPressed: false,
        };
        /**
            * @type {number} seconds since the body last stood on something.
            *                Infinity after a jump uses it.
        */
        this.sinceGrounded = Infinity;
        /**
            * @type {number} seconds since the jump button was pressed. Infinity
            *                after a jump uses it.
        */
        this.sincePressed = Infinity;
        /**
            * @type {number} seconds since a wall last touched the body. Coyote
            *                time for walls.
        */
        this.sinceWall = Infinity;
        /**
            * @type {number} side of the last wall along the run axis: 1 in the
            *                direction right maps to, -1 opposite, 0 for none.
        */
        this.wallSide = 0;
        /**
            * @type {boolean} whether the body is sliding down a wall.
        */
        this.sliding = false;
        /**
            * @type {number} air jumps left. A character starts with the full
            *                amount, so one spawned in the air can use them
            *                without landing first.
        */
        this.jumpsLeft = this.tuning.airJumps;
        /**
            * @type {number} dashes left.
        */
        this.dashesLeft = this.tuning.dashes;
        /**
            * @type {number} remaining dash time, in seconds. Zero when not dashing.
        */
        this.dashing = 0;
        /**
            * @type {number} seconds since the last dash started.
        */
        this.sinceDash = Infinity;
        /**
            * @type {number} dash direction along the run axis. @private
        */
        this.dashAlong = 0;
        /**
            * @type {number} dash direction along gravity. @private
        */
        this.dashFall = 0;
        /**
            * @type {number} remaining time steering is ignored after a wall jump,
            *                in seconds.
        */
        this.lockedFor = 0;
        /**
            * Called by the engine at the start of every step, before the character
            * moves, with this controller and the step duration. Use it to write the
            * input of non player characters.
            *
            * Keyboard input can be read once per frame, but AI logic should run
            * once per step: a frame can contain several steps or none, and logic
            * that runs per frame would react differently at different refresh
            * rates.
            *
            * Read state, not events: 'grounded', 'touching', 'fallSpeed', 'state'
            * and 'facing', as of the previous step. The 'just' flags and the
            * contact list are per frame and cleared at its start, so they miss
            * events from the current frame. To react to an event, use
            * 'onCollision', which fires immediately, or keep state in the AI.
            *
            * @type {((controller: TriquiController, step: number) => void) | null}
        */
        this.think = null;
    }

    /**
        * Clears the engine state of this character and keeps its configuration.
        *
        * Clears the ground, wall and jump button timers, the spent air jumps and
        * dashes, and the input, and calls {@link TriquiBody#reset}. Tuning,
        * 'think', callbacks, size, position and velocity are kept.
        * {@link TriquiEngine#add} calls it; call it directly to restart a character
        * in place.
        *
        * @returns {TriquiController} this controller, for chaining.
    */
    reset() {
        this.sinceGrounded = Infinity;
        this.sincePressed = Infinity;
        this.sinceWall = Infinity;
        this.wallSide = 0;
        this.sliding = false;
        this.jumpsLeft = this.tuning.airJumps;
        this.dashesLeft = this.tuning.dashes;
        this.dashing = 0;
        this.sinceDash = Infinity;
        this.dashAlong = 0;
        this.dashFall = 0;
        this.lockedFor = 0;
        Object.assign(this.input, {
            left: 0, right: 0, up: 0, down: 0,
            jump: false, jumpPressed: false, dash: false, dashPressed: false,
        });
        this.body.reset();
        return this;
    }

    /**
        * Sets the gravity of this character. Ground detection, jump direction and
        * the run axis all follow the new direction.
        *
        * @param {number} x horizontal gravity, in world units per second squared.
        * @param {number} y vertical gravity.
        * @returns {TriquiController} this controller, for chaining.
    */
    setGravity(x, y) {
        this.tuning.gravityX = x;
        this.tuning.gravityY = y;
        return this;
    }

    /**
        * Current state as a single word, for choosing animations or game rules.
        *
        * Checks are ordered: dashing and sliding take priority over standing,
        * rising and falling. The state is not derived from the velocity alone,
        * otherwise a character on a rising platform would read 'rising' and one
        * pushed along the ground 'running'.
        *
        * @returns {string} 'dashing', 'sliding', 'standing', 'rising' or 'falling'.
    */
    get state() {
        if (this.dashing > 0) {
            return 'dashing';
        }
        if (this.sliding) {
            return 'sliding';
        }
        if (this.body.grounded) {
            return 'standing';
        }
        return this.body.fallSpeed < 0 ? 'rising' : 'falling';
    }

    /**
        * Advances the character by one step.
        *
        * @param {number} step step duration, in seconds.
    */
    update(step) {
        const body = this.body;
        const tuning = this.tuning;
        const input = this.input;

        /*
            * Down direction. A zero gravity keeps the previous direction, so
            * disabling gravity makes the character float without losing its
            * orientation.
        */
        const pull = Math.hypot(tuning.gravityX, tuning.gravityY);
        if (pull > 0) {
            body.downX = tuning.gravityX / pull;
            body.downY = tuning.gravityY / pull;
        }
        const downX = body.downX;
        const downY = body.downY;
        const alongX = downY;
        const alongY = -downX;

        /*
            * Coyote time and jump buffer. The first keeps the ground available for
            * a short time after leaving it, the second keeps a jump press for a
            * short time before landing. Together they accept presses that arrive
            * slightly late or early.
        */
        this.sinceGrounded = body.grounded ? 0 : this.sinceGrounded + step;
        this.sincePressed = input.jumpPressed ? 0 : this.sincePressed + step;
        this.lockedFor = Math.max(0, this.lockedFor - step);
        this.sinceDash += step;

        /*
            * A wall is a contact along the run axis. Like the ground, it stays
            * available for a short time after leaving it.
        */
        const onWall = !body.grounded && (body.touchingTowards(alongX, alongY)
            || body.touchingTowards(-alongX, -alongY));
        if (onWall) {
            this.wallSide = body.touchingTowards(alongX, alongY) ? 1 : -1;
            this.sinceWall = 0;
        }
        else {
            this.sinceWall += step;
        }

        if (body.grounded) {
            this.jumpsLeft = tuning.airJumps;
            this.dashesLeft = tuning.dashes;
        }

        /*
            * Pressing down while grounded only starts the drop through timer. On
            * ordinary ground the collider ignores the timer.
        */
        if (input.down && body.grounded) {
            body.dropTimer = tuning.dropThroughTime;
        }
        body.dropTimer = Math.max(0, body.dropTimer - step);

        /*
            * Velocity is a world space vector, but the rules work relative to
            * gravity: running along the run axis and jumping against gravity. The
            * velocity is split into those two components, updated, and recombined.
        */
        let along = body.velocityX * alongX + body.velocityY * alongY;
        let fall = body.velocityX * downX + body.velocityY * downY;

        if (this.beginDash(input)) {
            /* A dash starting this step overrides the velocity. */
        }

        if (this.dashing > 0) {
            this.dashing = Math.max(0, this.dashing - step);
            along = this.dashAlong * tuning.dashSpeed;
            fall = this.dashFall * tuning.dashSpeed;
            this.sliding = false;

            if (this.dashing === 0) {
                /*
                    * After a dash the character keeps the direction but not the
                    * speed. Otherwise an upward dash would act as an extra jump and
                    * a horizontal dash as a permanent speed boost.
                */
                along = Math.max(-tuning.runSpeed, Math.min(tuning.runSpeed, along));
                fall = Math.max(fall, -tuning.jumpCut);
            }

            body.velocityX = alongX * along + downX * fall;
            body.velocityY = alongY * along + downY * fall;
            this.resolve(step, downX, downY);
            return;
        }

        /* Steering is ignored briefly after a wall jump, otherwise the player, still
           holding towards the wall, moves straight back to it. */
        const steering = this.lockedFor > 0 ? 0 : input.right - input.left;
        if (steering !== 0) {
            body.facing = Math.sign(steering);
        }

        const wanted = steering * tuning.runSpeed;
        if (wanted !== 0) {
            const change = tuning.runAcceleration * step * Math.sign(wanted - along);
            along = Math.abs(wanted - along) < Math.abs(change) ? wanted : along + change;
        }
        else {
            const drag = (body.grounded ? tuning.groundFriction : tuning.airFriction) * step;
            along = Math.abs(along) <= drag ? 0 : along - drag * Math.sign(along);
        }

        /*
            * Jump priority: from the ground when grounded, from a wall when one is
            * available, otherwise an air jump.
        */
        const asked = this.sincePressed <= tuning.jumpBuffer;
        const wallReady = tuning.wallJumpAway > 0 && !body.grounded
            && this.wallSide !== 0 && this.sinceWall <= tuning.wallGrace;

        if (asked && this.sinceGrounded <= tuning.coyoteTime) {
            fall = -tuning.jumpSpeed;
            this.spendJump();
        }
        else if (asked && wallReady) {
            fall = -tuning.wallJumpUp;
            along = -this.wallSide * tuning.wallJumpAway;
            body.facing = -this.wallSide;
            this.lockedFor = tuning.wallJumpLock;
            /* A wall restores air jumps but not dashes, otherwise a character with one
               dash would get one dash per wall. */
            this.jumpsLeft = tuning.airJumps;
            this.sinceWall = Infinity;
            this.spendJump();
        }
        else if (asked && this.jumpsLeft > 0) {
            fall = -tuning.airJumpSpeed;
            this.jumpsLeft--;
            this.spendJump();
        }

        if (!input.jump && !body.launched && fall < -tuning.jumpCut) {
            fall = -tuning.jumpCut;
        }
        fall = Math.min(fall + pull * step, tuning.maxFallSpeed);
        if (fall >= 0) {
            body.launched = false;
        }

        /*
            * Wall sliding caps the fall speed instead of applying a force. It only
            * applies while the input pushes towards the wall.
        */
        this.sliding = tuning.wallSlideSpeed > 0 && onWall && fall > 0
            && Math.sign(steering) === this.wallSide;
        if (this.sliding) {
            fall = Math.min(fall, tuning.wallSlideSpeed);
        }

        body.velocityX = alongX * along + downX * fall;
        body.velocityY = alongY * along + downY * fall;
        this.resolve(step, downX, downY);
    }

    /**
        * Consumes the coyote time and the jump buffer, so one press cannot trigger
        * two jumps.
        *
        * @private
    */
    spendJump() {
        this.sincePressed = Infinity;
        this.sinceGrounded = Infinity;
    }

    /**
        * Starts a dash when requested and available.
        *
        * The dash follows the input direction, in any of eight directions, or the
        * facing direction when no direction is held.
        *
        * @param {object} input the input state.
        * @returns {boolean} whether a dash started.
        * @private
    */
    beginDash(input) {
        const tuning = this.tuning;
        if (!input.dashPressed || this.dashing > 0 || this.dashesLeft <= 0
            || this.sinceDash < tuning.dashCooldown) {
            return false;
        }

        let aimAlong = input.right - input.left;
        const aimFall = input.down - input.up;
        if (aimAlong === 0 && aimFall === 0) {
            aimAlong = this.body.facing;
        }
        const length = Math.hypot(aimAlong, aimFall);

        this.dashAlong = aimAlong / length;
        this.dashFall = aimFall / length;
        this.dashing = tuning.dashTime;
        this.dashesLeft--;
        this.sinceDash = 0;
        if (aimAlong !== 0) {
            this.body.facing = Math.sign(aimAlong);
        }
        return true;
    }

    /**
        * Moves the body through the collider, resolving the gravity axis last.
        *
        * This keeps landing from cancelling the speed along the run axis, and lets
        * a body pressed against a wall keep moving along it.
        *
        * @param {number} step  step duration.
        * @param {number} downX down direction.
        * @param {number} downY down direction.
        * @private
    */
    resolve(step, downX, downY) {
        const body = this.body;
        if (Math.abs(downY) >= Math.abs(downX)) {
            this.collider.moveX(body, body.velocityX * step);
            this.collider.moveY(body, body.velocityY * step);
        }
        else {
            this.collider.moveY(body, body.velocityY * step);
            this.collider.moveX(body, body.velocityX * step);
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Engine
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
    * Owns the world, the collider, the characters and the clock.
    *
    * There is no limit on the number of characters. They are stored in a list
    * and updated in insertion order, each with its own body, input and tuning.
    * Players and AI controlled characters are handled the same way; the only
    * difference is what writes into {@link TriquiController#input}.
    *
    * Physics runs at a fixed step regardless of the frame duration. A long frame
    * runs several steps and a short one may run none. The same input produces the
    * same trajectory on any machine, and the step is short enough that a fast
    * body cannot cross a tile between two casts.
    *
    * Renderers use {@link TriquiEngine#alpha} to interpolate between steps. The
    * engine has no loop, timer or clock of its own: the host calls
    * {@link TriquiEngine#advance} from its own loop and then draws.
*/
export class TriquiEngine {

    /**
        * @param {TriquiWorld} world                world the characters move through.
        * @param {object}      [options]
        * @param {number}      [options.step]       physics step duration, in seconds.
        * @param {number}      [options.maxFrame]   maximum frame duration processed;
        *                                            time beyond it is discarded, so a
        *                                            tab resumed from the background
        *                                            does not run thousands of steps.
        * @param {{skin?: number, raysX?: number, raysY?: number}} [options.collider]
        *        collider options.
    */
    constructor(world, {
        step = DEFAULT_STEP, maxFrame = DEFAULT_MAX_FRAME, collider = {},
    } = {}) {
        /**
            * @type {TriquiWorld} world the characters move through.
        */
        this.world = world;
        /**
            * @type {TriquiCollider} collider shared by every character.
        */
        this.collider = new TriquiCollider(world, collider);
        /**
            * @type {number} physics step duration, in seconds.
        */
        this.step = step;
        /**
            * @type {number} maximum frame duration processed, in seconds.
        */
        this.maxFrame = maxFrame;
        /**
            * @type {TriquiController[]} characters, updated in insertion order.
        */
        this.controllers = [];
        /**
            * @type {TriquiBody[]} character bodies, in the same order. Stored as a
            *                      list so renderers can iterate it every frame
            *                      without a new array being created.
        */
        this.bodies = [];
        /**
            * @type {TriquiPlatform[]} platforms.
        */
        this.platforms = [];
        /**
            * @type {TriquiSensor[]} sensors, tested against every body once per
            *                        step.
        */
        this.sensors = [];
        /**
            * Every positioned object in insertion order: bodies, platforms and
            * sensors. The engine updates the typed lists above; renderers can
            * iterate this one to handle all objects the same way.
            *
            * Tiles are not included. A tile is a value in the map array, not an
            * object; attach data to a tile with 'setDataAt' on the world.
            *
            * @type {TriquiRectangle[]}
        */
        this.actors = [];
        /**
            * @type {Map<number, TriquiRectangle>} the same objects, by identifier.
            *                                       @private
        */
        this.byId = new Map();
        /**
            * @type {TriquiProjectile[]} active projectiles.
        */
        this.projectiles = [];
        /**
            * Body hurtboxes as rectangles projectiles can hit. Kept separate from
            * the world's shape set, so characters can be hit by projectiles
            * without colliding with each other. Created when the first projectile
            * is fired.
            *
            * @type {?ShapeSet} @private
        */
        this.targets = null;
        /**
            * @type {?Raycaster} caster used by projectiles: the level, the
            *                    platforms and the targets. @private
        */
        this.aim = null;
        /**
            * @type {number} next identifier to assign. @private
        */
        this.nextId = 1;
        /**
            * @type {number} accumulated time not yet simulated, in seconds.
            *                @private
        */
        this.accumulator = 0;
        /**
            * @type {object} reusable contact record used while carrying riders.
            *                @private
        */
        this.carriedTouching = { left: false, right: false, top: false, bottom: false };
    }

    /**
        * Interpolation factor between the last step and the next one, from 0 to
        * just under 1.
        *
        * Renderers pass it to {@link TriquiBody#renderX} and similar methods.
        * Drawing raw positions instead makes movement stutter at the physics step
        * rate.
        *
        * @returns {number} the fraction of a step not yet simulated.
    */
    get alpha() {
        return this.accumulator / this.step;
    }

    /**
        * Registers a rectangle: assigns an identifier and a kind and adds it to
        * the actor list.
        *
        * @param {TriquiRectangle} actor the rectangle to register.
        * @param {string}          kind  'body', 'platform' or 'sensor'.
        * @returns {TriquiRectangle} the same rectangle.
        * @private
    */
    register(actor, kind) {
        actor.id = this.nextId++;
        actor.kind = kind;
        this.actors.push(actor);
        this.byId.set(actor.id, actor);
        return actor;
    }

    /**
        * Unregisters a rectangle. Its identifier is never reused, so stale
        * references resolve to nothing instead of to a different object.
        *
        * @param {TriquiRectangle} actor the rectangle to unregister.
        * @private
    */
    forget(actor) {
        const at = this.actors.indexOf(actor);
        if (at >= 0) {
            this.actors.splice(at, 1);
        }
        this.byId.delete(actor.id);
    }

    /**
        * Looks up an object by identifier.
        *
        * @param {number} id the identifier.
        * @returns {?TriquiRectangle} the body, platform or sensor, or null if it
        *                             has been removed.
    */
    actor(id) {
        return this.byId.get(id) ?? null;
    }

    /**
        * Creates a body and its controller and adds them to the engine.
        *
        * @param {number} x         left edge.
        * @param {number} y         top edge.
        * @param {number} width     width, in world units.
        * @param {number} height    height, in world units.
        * @param {Partial<TriquiTuning>} [tuning] overrides of {@link DEFAULT_TUNING}.
        * @returns {TriquiController} the controller, which holds the body and the
        *                             input.
    */
    spawn(x, y, width, height, tuning) {
        const controller = new TriquiController(
            new TriquiBody(x, y, width, height), this.collider, tuning,
        );
        this.add(controller);
        return controller;
    }

    /**
        * Adds an existing character to the engine, typically one previously
        * removed with {@link TriquiEngine#remove}. This is the basis for pooling;
        * 'spawn' creates a character and passes it to this method.
        *
        * The character configuration is kept: size, tuning, data, hurtbox,
        * 'think', callbacks, position and velocity. The engine state is cleared:
        * contacts, events, touched faces, platform, sensors, crush state and the
        * controller timers and counters. Without this, a body re-added at the
        * same position would still be listed inside its old sensors and would
        * never receive the enter event.
        *
        * A new identifier is assigned, so references to the old one resolve to
        * nothing.
        *
        * Position it with {@link TriquiRectangle#place}, before or after adding.
        * Assigning x and y directly leaves the previous position unchanged, and
        * the first frame is interpolated from the old location.
        *
        * @param {TriquiController} controller the character to add.
        * @returns {boolean} false when it is already in the engine.
    */
    add(controller) {
        if (this.controllers.includes(controller)) {
            return false;
        }
        const body = controller.body;
        /* The controller may come from another engine: use this engine's collider. */
        controller.collider = this.collider;
        controller.reset();
        body.controller = controller;

        this.controllers.push(controller);
        this.bodies.push(body);
        this.register(body, 'body');
        if (this.world.bodiesCollide) {
            body.shape = this.world.shapes.addRectangle(
                body.x, body.y, body.width, body.height, body,
            );
        }
        if (this.targets) {
            body.targetShape = this.targets.addRectangle(
                body.hurtX, body.hurtY, body.hurtWidth, body.hurtHeight, body,
            );
        }
        return true;
    }

    /**
        * Removes a character from the engine.
        *
        * The controller and its body are left unchanged, so the character can be
        * added again later with {@link TriquiEngine#add}.
        *
        * @param {TriquiController} controller the character to remove.
        * @returns {boolean} whether it was in the engine.
    */
    remove(controller) {
        const at = this.controllers.indexOf(controller);
        if (at < 0) {
            return false;
        }
        const body = this.controllers[at].body;
        this.controllers.splice(at, 1);
        this.bodies.splice(at, 1);
        this.forget(body);
        if (body.shape) {
            this.world.shapes.remove(body.shape);
            body.shape = null;
        }
        if (body.targetShape) {
            this.targets.remove(body.targetShape);
            body.targetShape = null;
        }
        for (const rider of this.bodies) {
            if (rider.riding === body) {
                rider.riding = null;
            }
        }
        return true;
    }

    /**
        * Adds a platform.
        *
        * @param {number} x         left edge, at the start.
        * @param {number} y         top edge, at the start.
        * @param {number} width     width, in world units.
        * @param {number} height    height, in world units.
        * @param {ConstructorParameters<typeof TriquiPlatform>[4]} [options] see
        *        {@link TriquiPlatform}.
        * @returns {TriquiPlatform} the platform.
    */
    addPlatform(x, y, width, height, options) {
        const platform = new TriquiPlatform(x, y, width, height, options);
        platform.shape = this.world.shapes.addRectangle(x, y, width, height, platform);
        this.platforms.push(platform);
        return this.register(platform, 'platform');
    }

    /**
        * Removes a platform and detaches the bodies standing on it.
        *
        * @param {TriquiPlatform} platform the platform to remove.
        * @returns {boolean} whether it was in the engine.
    */
    removePlatform(platform) {
        const at = this.platforms.indexOf(platform);
        if (at < 0) {
            return false;
        }
        this.platforms.splice(at, 1);
        this.forget(platform);
        this.world.shapes.remove(platform.shape);
        platform.shape = null;
        for (const body of this.bodies) {
            if (body.riding === platform) {
                body.riding = null;
            }
        }
        return true;
    }

    /**
        * Adds a sensor, a rectangle that detects bodies without blocking them.
        *
        * @param {number} x      left edge.
        * @param {number} y      top edge.
        * @param {number} width  width, in world units.
        * @param {number} height height, in world units.
        * @param {*}      [data] game data used to identify it.
        * @returns {TriquiSensor} the sensor.
    */
    addSensor(x, y, width, height, data) {
        const sensor = new TriquiSensor(x, y, width, height, data);
        /* Set 'harmful' afterwards to test it against hurtboxes. */
        this.sensors.push(sensor);
        return this.register(sensor, 'sensor');
    }

    /**
        * Removes a sensor and sends a leave event to every body inside it.
        *
        * @param {TriquiSensor} sensor the sensor to remove.
        * @returns {boolean} whether it was in the engine.
    */
    removeSensor(sensor) {
        const at = this.sensors.indexOf(sensor);
        if (at < 0) {
            return false;
        }
        this.sensors.splice(at, 1);
        this.forget(sensor);
        for (const body of this.bodies) {
            if (body.inside.delete(sensor)) {
                this.leave(body, sensor);
            }
        }
        return true;
    }

    /**
        * Fires a projectile.
        *
        * The first projectile creates the target set containing every body
        * hurtbox. Games that never fire do not pay for it.
        *
        * @param {number} x         start position.
        * @param {number} y         start position.
        * @param {number} velocityX velocity, in world units per second.
        * @param {number} velocityY velocity, in world units per second.
        * @param {ConstructorParameters<typeof TriquiProjectile>[4]} [options] see
        *        {@link TriquiProjectile}.
        * @returns {TriquiProjectile} the projectile.
    */
    fire(x, y, velocityX, velocityY, options) {
        if (!this.targets) {
            this.targets = new ShapeSet({ cellSize: this.world.tileSize * 2 });
            for (const body of this.bodies) {
                body.targetShape = this.targets.addRectangle(
                    body.hurtX, body.hurtY, body.hurtWidth, body.hurtHeight, body,
                );
            }
            this.aim = new Raycaster([this.world.grid, this.world.shapes, this.targets], {
                /* Projectiles ignore one way decks and tiles defined as not solid. */
                filter: candidate => {
                    const payload = candidate.userData;
                    if (payload && payload.oneWay) {
                        return false;
                    }
                    return Filters.blocking(candidate);
                },
            });
        }

        const projectile = new TriquiProjectile(x, y, velocityX, velocityY, options);
        this.projectiles.push(projectile);
        return this.register(projectile, 'projectile');
    }

    /**
        * Removes a projectile before it ends on its own.
        *
        * @param {TriquiProjectile} projectile the projectile to remove.
        * @returns {boolean} whether it was still active.
    */
    removeProjectile(projectile) {
        if (!projectile.alive) {
            return false;
        }
        this.end(projectile, 'removed');
        return true;
    }

    /**
        * Advances every projectile by one step.
        *
        * The segment from the current to the next position is cast once and all
        * hits are returned sorted by distance. Each hit is recorded and passed to
        * the projectile's 'onContact'; the projectile stops at the first hit it
        * does not pass. Walls, platforms and characters are handled the same way,
        * and the contact's 'kind' identifies which one was hit.
        *
        * @private
    */
    flyProjectiles() {
        const step = this.step;

        for (const projectile of this.projectiles) {
            if (!projectile.alive) {
                continue;
            }
            projectile.previousX = projectile.x;
            projectile.previousY = projectile.y;
            projectile.age += step;
            if (projectile.age > projectile.life) {
                this.end(projectile, 'expired');
                continue;
            }

            projectile.velocityX += projectile.gravityX * step;
            projectile.velocityY += projectile.gravityY * step;
            const moveX = projectile.velocityX * step;
            const moveY = projectile.velocityY * step;
            const length = Math.hypot(moveX, moveY);
            if (length === 0) {
                continue;
            }

            const hits = this.aim.castAll(projectile.x, projectile.y, moveX, moveY, length);
            let stopped = false;

            for (const hit of hits) {
                const payload = hit.userData;
                const actor = payload instanceof TriquiRectangle ? payload : null;
                if (actor && (actor === projectile.owner || projectile.met.has(actor))) {
                    continue;
                }
                const cell = actor ? -1 : hit.cellY * this.world.columns + hit.cellX;
                if (!actor && projectile.metCells.has(cell)) {
                    continue;
                }

                const contact = {
                    projectile,
                    kind: actor ? actor.kind : 'tile',
                    other: actor,
                    tile: actor ? null : payload,
                    tileId: actor ? 0 : hit.tileId,
                    cellX: actor ? NO_CELL : hit.cellX,
                    cellY: actor ? NO_CELL : hit.cellY,
                    data: actor ? actor.data : this.world.dataAt(hit.cellX, hit.cellY),
                    x: hit.pointX,
                    y: hit.pointY,
                    normalX: hit.normalX,
                    normalY: hit.normalY,
                    distance: hit.distance,
                };
                projectile.contacts.push(contact);
                if (actor) {
                    projectile.met.add(actor);
                }
                else {
                    projectile.metCells.add(cell);
                }

                const verdict = projectile.onContact ? projectile.onContact(contact) : 'stop';
                if (verdict !== 'pass') {
                    projectile.x = hit.pointX;
                    projectile.y = hit.pointY;
                    projectile.stoppedBy = contact;
                    this.end(projectile, 'stopped');
                    stopped = true;
                    break;
                }
            }

            if (!stopped) {
                projectile.x += moveX;
                projectile.y += moveY;
            }
        }

        if (this.projectiles.some(projectile => !projectile.alive)) {
            this.projectiles = this.projectiles.filter(projectile => projectile.alive);
        }
    }

    /**
        * Ends a projectile and calls its 'onEnd'.
        *
        * @param {TriquiProjectile} projectile the projectile to end.
        * @param {string}           reason     'stopped', 'expired' or 'removed'.
        * @private
    */
    end(projectile, reason) {
        projectile.alive = false;
        projectile.reason = reason;
        this.forget(projectile);
        if (reason === 'removed') {
            this.projectiles = this.projectiles.filter(other => other !== projectile);
        }
        if (projectile.onEnd) {
            projectile.onEnd(projectile, reason);
        }
    }

    /**
        * Sets the gravity of every character.
        *
        * Gravity is stored in each controller's tuning, so characters can have
        * different gravity. This method covers the common case of rotating the
        * whole world.
        *
        * @param {number} x horizontal gravity, in world units per second squared.
        * @param {number} y vertical gravity.
        * @returns {TriquiEngine} this engine, for chaining.
    */
    setGravity(x, y) {
        for (const controller of this.controllers) {
            controller.setGravity(x, y);
        }
        return this;
    }

    /**
        * Moves every platform one step and updates its shape set entry.
        *
        * @private
    */
    movePlatforms() {
        for (const platform of this.platforms) {
            platform.step(this.step);
            this.refile(platform);
        }
    }

    /**
        * Moves the riders of each platform by the platform displacement.
        *
        * The move goes through the collider instead of setting the position
        * directly, so a rider carried into a wall stops at the wall.
        *
        * @private
    */
    carryRiders() {
        for (const body of this.bodies) {
            const ride = body.riding;
            if (!ride || (ride.deltaX === 0 && ride.deltaY === 0)) {
                continue;
            }
            this.shift(body, ride.deltaX, ride.deltaY);
        }
    }

    /**
        * Pushes bodies that a platform has moved into.
        *
        * Platforms are not blocked by bodies and must not overlap them, so they
        * push them. The push goes in the platform's direction of travel, by the
        * overlap distance, through the collider, so walls can block it. A body
        * that cannot be pushed clear is crushed. Being touched by a moving
        * platform does not crush a body by itself.
        *
        * For example, a press that hits a jumping character pushes it down and it
        * keeps falling; the same press reaching a character standing on the
        * floor crushes it.
        *
        * @private
    */
    pushBodies() {
        const skin = this.collider.skin;

        for (const platform of this.platforms) {
            const goingX = platform.deltaX;
            const goingY = platform.deltaY;
            if (goingX === 0 && goingY === 0) {
                continue;
            }

            for (const body of this.bodies) {
                /* The box is reduced by the skin, so a body resting against a platform is
                   not counted as overlapping it. */
                const left = body.x + skin;
                const right = body.x + body.width - skin;
                const top = body.y + skin;
                const bottom = body.y + body.height - skin;

                if (right <= platform.x || left >= platform.x + platform.width
                    || bottom <= platform.y || top >= platform.y + platform.height) {
                    continue;
                }

                this.shift(body,
                    goingX === 0 ? 0
                        : goingX > 0 ? platform.x + platform.width - left : platform.x - right,
                    goingY === 0 ? 0
                        : goingY > 0 ? platform.y + platform.height - top : platform.y - bottom);
            }
        }
    }

    /**
        * Moves a body without clearing its current contacts.
        *
        * Carrying and pushing are not movements made by the character, so the
        * faces already touched are kept and new contacts are added to them.
        * Otherwise a rider on a rising platform would read as airborne on every
        * step.
        *
        * @param {TriquiBody} body   the body to move.
        * @param {number}     byX    horizontal distance.
        * @param {number}     byY    vertical distance.
        * @private
    */
    shift(body, byX, byY) {
        const kept = this.carriedTouching;
        kept.left = body.touching.left;
        kept.right = body.touching.right;
        kept.top = body.touching.top;
        kept.bottom = body.touching.bottom;

        if (byX !== 0) {
            this.collider.moveX(body, byX);
        }
        if (byY !== 0) {
            this.collider.moveY(body, byY);
        }

        body.touching.left = body.touching.left || kept.left;
        body.touching.right = body.touching.right || kept.right;
        body.touching.top = body.touching.top || kept.top;
        body.touching.bottom = body.touching.bottom || kept.bottom;
        this.refile(body);
    }

    /**
        * Updates the shape set entries of a rectangle, if it has any.
        *
        * @param {TriquiRectangle} rectangle the rectangle that moved.
        * @private
    */
    refile(rectangle) {
        if (rectangle.shape) {
            rectangle.shape.x = rectangle.x;
            rectangle.shape.y = rectangle.y;
            this.world.shapes.update(rectangle.shape);
        }
        if (rectangle.targetShape) {
            /* Size is updated as well as position, so a hurtbox changed at runtime is
               used by the next projectile. */
            const target = rectangle.targetShape;
            target.x = rectangle.hurtX;
            target.y = rectangle.hurtY;
            target.width = rectangle.hurtWidth;
            target.height = rectangle.hurtHeight;
            this.targets.update(target);
        }
    }

    /**
        * Updates the sensors each body overlaps and fires enter and leave events.
        *
        * @private
    */
    readSensors() {
        for (const body of this.bodies) {
            for (const sensor of this.sensors) {
                const x = sensor.harmful ? body.hurtX : body.x;
                const y = sensor.harmful ? body.hurtY : body.y;
                const width = sensor.harmful ? body.hurtWidth : body.width;
                const height = sensor.harmful ? body.hurtHeight : body.height;
                const touching = sensor.enabled
                    && x < sensor.x + sensor.width
                    && x + width > sensor.x
                    && y < sensor.y + sensor.height
                    && y + height > sensor.y;
                const was = body.inside.has(sensor);

                if (touching && !was) {
                    body.inside.add(sensor);
                    body.justEntered.push(sensor);
                    if (body.onSensor) {
                        body.onSensor(sensor, true);
                    }
                }
                else if (!touching && was) {
                    body.inside.delete(sensor);
                    this.leave(body, sensor);
                }
            }
        }
    }

    /**
        * Fires the leave event for a body and a sensor.
        *
        * @param {TriquiBody}   body   the body that left.
        * @param {TriquiSensor} sensor the sensor it left.
        * @private
    */
    leave(body, sensor) {
        body.justLeft.push(sensor);
        if (body.onSensor) {
            body.onSensor(sensor, false);
        }
    }

    /**
        * Detects a body stuck inside solid geometry.
        *
        * The collider never moves a body into geometry, and platforms push bodies
        * out of the way. A body still overlapping something at the end of a step
        * is one the push could not clear, such as a rider pushed into a ceiling
        * or a character under a descending press. Without this check the body
        * would stop moving with no notification.
        *
        * The tested box is the body reduced by the skin, so resting flush against
        * a surface does not count as overlapping it.
        *
        * @param {TriquiBody} body the body to check.
        * @private
    */
    checkCrush(body) {
        const skin = this.collider.skin;
        let caught = null;

        this.world.overlapping(
            body.x + skin, body.y + skin,
            body.width - skin * 2, body.height - skin * 2,
            entry => {
                const payload = entry.other ?? entry.tile;
                /* Bodies do not crush each other; only the level and platforms can. */
                if (entry.other instanceof TriquiBody) {
                    return true;
                }
                if (payload && (payload.oneWay || payload.solid === false)) {
                    return true;
                }
                caught = entry.other ?? entry.tile ?? entry.tileId;
                return false;
            },
        );

        const wasCrushed = body.crushed;
        body.crushed = caught !== null;
        body.crushedBy = caught;
        if (body.crushed && !wasCrushed) {
            body.justCrushed = true;
            if (body.onCrushed) {
                body.onCrushed(caught);
            }
        }
    }

    /**
        * Runs as many fixed steps as the elapsed time allows.
        *
        * @param {number} elapsed seconds since the previous call.
        * @returns {number} the number of steps run.
    */
    advance(elapsed) {
        /*
            * Events are per frame, not per step. They are cleared here, before any
            * step runs, so a frame that runs three steps reports events from all
            * of them and a frame that runs none reports nothing.
        */
        for (const controller of this.controllers) {
            controller.body.clearEvents();
        }

        this.accumulator += Math.min(elapsed, this.maxFrame);
        let steps = 0;

        while (this.accumulator >= this.step) {
            if (this.collider.recordRays) {
                this.collider.rays.length = 0;
            }
            for (const body of this.bodies) {
                body.beginStep();
            }

            /*
                * Characters move before platforms, and platforms then carry the
                * bodies standing on them. In the opposite order, a body that
                * landed on a platform during this step would not be carried,
                * would end up overlapping the deck, and would never catch up.
            */
            for (const controller of this.controllers) {
                const body = controller.body;
                if (controller.think) {
                    controller.think(controller, this.step);
                }
                body.riding = null;
                controller.update(this.step);
                controller.input.jumpPressed = false;
                controller.input.dashPressed = false;
                this.refile(body);
            }

            this.movePlatforms();
            this.carryRiders();
            this.pushBodies();

            for (const body of this.bodies) {
                body.endStep();
                this.checkCrush(body);
            }

            /* Runs after every body has moved, so projectiles hit current positions. */
            this.flyProjectiles();
            this.readSensors();
            this.accumulator -= this.step;
            steps++;
        }
        return steps;
    }
}

export default TriquiEngine;
