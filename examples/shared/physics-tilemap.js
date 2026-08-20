// Auto-generated from physics-tilemap.ts - edit the .ts source, not this file.
// Shared example recipe: build static physics colliders from a Tiled object
// layer, or from a tile layer's per-tile collision geometry.
//
// This module is the integration seam between two intentionally decoupled
// packages: `@codexo/exojs-tilemap` (data-only object layers) and
// `@codexo/exojs-physics` (the simulation world). Neither package depends on
// the other - tilemap never imports physics, physics never imports tilemap
// (this is a deliberate architectural decision, not an oversight). The
// glue therefore lives here, in example/app land, where depending on both is
// legitimate. Copy it into your own project and adapt as needed; it is a
// recipe, not engine API.
//
// `buildCollidersFromObjectLayer` walks an `ObjectLayer`, maps each geometry
// kind to the closest convex physics shape, and adds one static `PhysicsBody`
// per object to the world:
//
//   - Rectangle → `BoxShape`            (centred on the object's centre)
//   - Polygon   → `PolygonShape`        (convex; concave inputs are skipped)
//   - Ellipse   → `CircleShape`         (radius = the larger semi-axis)
//   - Point / Polyline / Tile           (no closed area → skipped)
//
// `buildCollidersFromTileLayer` does the same for the per-tile collision shapes
// authored on tileset tiles. The hard part - walking the tile grid, applying
// tile transforms and layer offsets, and merging adjacent whole-cell boxes into
// as few rectangles as possible - lives in `@codexo/exojs-tilemap`'s
// `buildTileCollisionGeometry`; all that is left here is the same short
// geometry → shape loop.
//
// Object coordinates are in object-layer pixel space with +Y down, matching the
// engine's screen space, so positions map straight through. Rotation (Tiled
// degrees, clockwise) is converted to radians on the body.
import { BoxShape, CircleShape, PhysicsBody, PolygonShape, } from '@codexo/exojs-physics';
import { buildTileCollisionGeometry, ObjectKind, } from '@codexo/exojs-tilemap';
const DEGREES_TO_RADIANS = Math.PI / 180;
/**
 * Build a static {@link PhysicsBody} (one box / polygon / circle collider) for
 * every closed-area object in `layer`, add them to `world`, and return the
 * `{ object, body }` pairs. Point, polyline and tile objects carry no closed
 * area and are skipped; non-convex polygons are skipped (the polygon shape
 * rejects them) with a console warning.
 *
 * The bodies are `static`, so they never move and form the level's solid world.
 */
export function buildCollidersFromObjectLayer(world, layer, options = {}) {
    const accept = options.accept ?? (() => true);
    const built = [];
    for (const object of layer.objects) {
        if (!accept(object)) {
            continue;
        }
        const placement = shapeForGeometry(object, object.name || String(object.id));
        if (placement === null) {
            continue;
        }
        const body = new PhysicsBody({
            type: 'static',
            position: { x: placement.x, y: placement.y },
            angle: placement.angle,
            colliders: [
                {
                    shape: placement.shape,
                    friction: options.friction ?? 0.6,
                    restitution: options.restitution ?? 0,
                    filter: options.filter,
                },
            ],
        });
        world.add(body);
        built.push({ object, body });
    }
    return built;
}
/**
 * Build static colliders from a tile layer's per-tile collision shapes - the
 * `objectgroup` Tiled lets you draw on a tileset tile.
 *
 * All the geometry work is done by `buildTileCollisionGeometry` in
 * `@codexo/exojs-tilemap`: it walks the tile grid, applies each tile's
 * flip/rotation transform plus the tileset and layer pixel offsets, and merges
 * adjacent whole-cell boxes into as few rectangles as it can - so a solid
 * region becomes a handful of wide bodies instead of one body per tile. This
 * function only turns that geometry into bodies, with the same kind → shape
 * mapping as {@link buildCollidersFromObjectLayer}.
 *
 * Pass `region` to scope the build to part of the layer (a streamed chunk, the
 * tiles around the player) instead of the whole map.
 */
export function buildCollidersFromTileLayer(world, layer, options = {}) {
    const geometry = buildTileCollisionGeometry(layer, {
        ...(options.region !== undefined && { region: options.region }),
        ...(options.merge !== undefined && { merge: options.merge }),
        ...(options.accept !== undefined && { accept: options.accept }),
    });
    const built = [];
    const add = (placement, source) => {
        if (placement === null) {
            return;
        }
        const body = new PhysicsBody({
            type: 'static',
            position: { x: placement.x, y: placement.y },
            angle: placement.angle,
            colliders: [
                {
                    shape: placement.shape,
                    friction: options.friction ?? 0.6,
                    restitution: options.restitution ?? 0,
                    filter: options.filter,
                },
            ],
        });
        world.add(body);
        built.push({ source, body });
    };
    for (const rect of geometry.rects) {
        // A merged rectangle is axis-aligned by construction, so the body needs
        // no angle - just the box centred on the run.
        add({
            shape: new BoxShape(rect.width, rect.height),
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            angle: 0,
        }, { kind: 'rect', rect });
    }
    for (const shape of geometry.shapes) {
        add(shapeForGeometry(shape, shape.source.name || `tile ${shape.tx},${shape.ty}`), { kind: 'shape', shape });
    }
    return built;
}
/**
 * Map one piece of collision geometry to a convex shape + body placement, or
 * `null` when it has no closed area (point / polyline / tile) or is a
 * degenerate / non-convex polygon. Boxes and circles are positioned at the
 * geometry's centre, since a physics shape is centred on its collider origin.
 */
function shapeForGeometry(geometry, label) {
    const angle = geometry.rotation * DEGREES_TO_RADIANS;
    switch (geometry.kind) {
        case ObjectKind.Rectangle: {
            if (geometry.width <= 0 || geometry.height <= 0) {
                return null;
            }
            // The body sits at the rectangle's centre; the box is centred on it.
            // Rotation pivots about the object origin in Tiled, so rotate the
            // centre offset (w/2, h/2) by the object's angle around that origin.
            const centre = rotateOffset(geometry, angle);
            return { shape: new BoxShape(geometry.width, geometry.height), x: centre.x, y: centre.y, angle };
        }
        case ObjectKind.Ellipse: {
            // No native ellipse collider - approximate with a circle whose radius
            // is the larger semi-axis (a conservative, fully-covering bound).
            const radius = Math.max(geometry.width, geometry.height) / 2;
            if (radius <= 0) {
                return null;
            }
            const centre = rotateOffset(geometry, angle);
            return { shape: new CircleShape(radius), x: centre.x, y: centre.y, angle };
        }
        case ObjectKind.Polygon: {
            const points = geometry.points ?? [];
            if (points.length < 3) {
                return null;
            }
            try {
                // Polygon points are relative to the object origin; the body
                // carries the world origin + rotation, so the shape keeps the
                // local points and we place the body at the object origin.
                const shape = new PolygonShape(points.map(point => ({ x: point.x, y: point.y })));
                return { shape, x: geometry.x, y: geometry.y, angle };
            }
            catch (error) {
                // PolygonShape throws on non-convex / degenerate input - there is
                // no automatic convex decomposition. Skip and let the author know.
                warn(`physics-tilemap: skipped non-convex/degenerate polygon "${label}": ${describeError(error)}`);
                return null;
            }
        }
        default:
            // Point, polyline and tile objects have no closed collision area.
            return null;
    }
}
/** The centre of an axis-aligned box rotated about its top-left origin. */
function rotateOffset(geometry, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfWidth = geometry.width / 2;
    const halfHeight = geometry.height / 2;
    return {
        x: geometry.x + (cos * halfWidth - sin * halfHeight),
        y: geometry.y + (sin * halfWidth + cos * halfHeight),
    };
}
function describeError(error) {
    return error instanceof Error ? error.message : String(error);
}
// Indirect through globalThis so the example lint rule (`no-console`) and the
// recipe stay clean while still surfacing authoring mistakes in the console.
function warn(message) {
    const logger = globalThis.console;
    logger?.warn?.(message);
}
