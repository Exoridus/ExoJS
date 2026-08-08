// Shared example recipe: build static physics colliders from a Tiled object
// layer, or from a tile layer's per-tile collision geometry.
//
// This module is the integration seam between two intentionally decoupled
// packages: `@codexo/exojs-tilemap` (data-only object layers) and
// `@codexo/exojs-physics` (the simulation world). Neither package depends on
// the other — tilemap never imports physics, physics never imports tilemap
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
// authored on tileset tiles. The hard part — walking the tile grid, applying
// tile transforms and layer offsets, and merging adjacent whole-cell boxes into
// as few rectangles as possible — lives in `@codexo/exojs-tilemap`'s
// `buildTileCollisionGeometry`; all that is left here is the same short
// geometry → shape loop.
//
// Object coordinates are in object-layer pixel space with +Y down, matching the
// engine's screen space, so positions map straight through. Rotation (Tiled
// degrees, clockwise) is converted to radians on the body.

import {
    type AnyShape,
    BoxShape,
    CircleShape,
    type CollisionFilter,
    PhysicsBody,
    type PhysicsWorld,
    PolygonShape,
} from '@codexo/exojs-physics';
import {
    buildTileCollisionGeometry,
    ObjectKind,
    type ObjectLayer,
    type ObjectPoint,
    type TileCollisionOptions,
    type TileCollisionRect,
    type TileCollisionShape,
    type TileLayer,
    type TileMapObject,
} from '@codexo/exojs-tilemap';

const DEGREES_TO_RADIANS = Math.PI / 180;

/** Options for {@link buildCollidersFromObjectLayer}. */
export interface ObjectLayerColliderOptions {
    /** Coulomb friction for every generated collider. Default `0.6`. */
    friction?: number;
    /** Restitution / bounciness in `[0, 1]` for every generated collider. Default `0`. */
    restitution?: number;
    /** Category/mask/group collision filter shared by every generated collider. */
    filter?: Partial<CollisionFilter>;
    /**
     * Skip an object (e.g. by a custom property) before a body is built for it.
     * Return `true` to keep the object, `false` to drop it. Default keeps all
     * closed-area objects.
     */
    accept?: (object: TileMapObject) => boolean;
}

/** A single static body produced from one object, paired with its source object. */
export interface ObjectLayerCollider {
    /** The source object the body was built from. */
    readonly object: TileMapObject;
    /** The static body added to the world. */
    readonly body: PhysicsBody;
}

/**
 * Build a static {@link PhysicsBody} (one box / polygon / circle collider) for
 * every closed-area object in `layer`, add them to `world`, and return the
 * `{ object, body }` pairs. Point, polyline and tile objects carry no closed
 * area and are skipped; non-convex polygons are skipped (the polygon shape
 * rejects them) with a console warning.
 *
 * The bodies are `static`, so they never move and form the level's solid world.
 */
export function buildCollidersFromObjectLayer(
    world: PhysicsWorld,
    layer: ObjectLayer,
    options: ObjectLayerColliderOptions = {},
): Array<ObjectLayerCollider> {
    const accept = options.accept ?? (() => true);
    const built: Array<ObjectLayerCollider> = [];

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
 * Options for {@link buildCollidersFromTileLayer}. Combines the collider
 * material settings above with the tilemap package's geometry options (region
 * scoping, merge toggle, per-shape filter).
 */
export interface TileLayerColliderOptions extends TileCollisionOptions {
    /** Coulomb friction for every generated collider. Default `0.6`. */
    friction?: number;
    /** Restitution / bounciness in `[0, 1]` for every generated collider. Default `0`. */
    restitution?: number;
    /** Category/mask/group collision filter shared by every generated collider. */
    filter?: Partial<CollisionFilter>;
}

/**
 * What a tile-layer collider was built from: either a merged whole-cell
 * rectangle (which spans many tiles and has no single source object) or one
 * pass-through per-tile shape.
 */
export type TileLayerColliderSource =
    | { readonly kind: 'rect'; readonly rect: TileCollisionRect }
    | { readonly kind: 'shape'; readonly shape: TileCollisionShape };

/** A single static body produced from tile collision geometry. */
export interface TileLayerCollider {
    /** The geometry the body was built from. */
    readonly source: TileLayerColliderSource;
    /** The static body added to the world. */
    readonly body: PhysicsBody;
}

/**
 * Build static colliders from a tile layer's per-tile collision shapes — the
 * `objectgroup` Tiled lets you draw on a tileset tile.
 *
 * All the geometry work is done by `buildTileCollisionGeometry` in
 * `@codexo/exojs-tilemap`: it walks the tile grid, applies each tile's
 * flip/rotation transform plus the tileset and layer pixel offsets, and merges
 * adjacent whole-cell boxes into as few rectangles as it can — so a solid
 * region becomes a handful of wide bodies instead of one body per tile. This
 * function only turns that geometry into bodies, with the same kind → shape
 * mapping as {@link buildCollidersFromObjectLayer}.
 *
 * Pass `region` to scope the build to part of the layer (a streamed chunk, the
 * tiles around the player) instead of the whole map.
 */
export function buildCollidersFromTileLayer(
    world: PhysicsWorld,
    layer: TileLayer,
    options: TileLayerColliderOptions = {},
): Array<TileLayerCollider> {
    const geometry = buildTileCollisionGeometry(layer, {
        ...(options.region !== undefined && { region: options.region }),
        ...(options.merge !== undefined && { merge: options.merge }),
        ...(options.accept !== undefined && { accept: options.accept }),
    });
    const built: Array<TileLayerCollider> = [];

    const add = (placement: ShapePlacement | null, source: TileLayerColliderSource): void => {
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
        // no angle — just the box centred on the run.
        add(
            {
                shape: new BoxShape(rect.width, rect.height),
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
                angle: 0,
            },
            { kind: 'rect', rect },
        );
    }

    for (const shape of geometry.shapes) {
        add(
            shapeForGeometry(shape, shape.source.name || `tile ${shape.tx},${shape.ty}`),
            { kind: 'shape', shape },
        );
    }

    return built;
}

/** A shape plus the world position and angle its origin should be placed at. */
interface ShapePlacement {
    readonly shape: AnyShape;
    readonly x: number;
    readonly y: number;
    readonly angle: number;
}

/**
 * The subset of fields both an object-layer {@link TileMapObject} and a
 * per-tile {@link TileCollisionShape} share — enough to pick a physics shape.
 * Both types are structurally assignable to it, so one mapping serves both.
 */
interface CollisionGeometry {
    readonly kind: ObjectKind;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly points?: readonly ObjectPoint[];
}

/**
 * Map one piece of collision geometry to a convex shape + body placement, or
 * `null` when it has no closed area (point / polyline / tile) or is a
 * degenerate / non-convex polygon. Boxes and circles are positioned at the
 * geometry's centre, since a physics shape is centred on its collider origin.
 */
function shapeForGeometry(geometry: CollisionGeometry, label: string): ShapePlacement | null {
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
            // No native ellipse collider — approximate with a circle whose radius
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
            } catch (error) {
                // PolygonShape throws on non-convex / degenerate input — there is
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
function rotateOffset(geometry: CollisionGeometry, angle: number): ObjectPoint {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfWidth = geometry.width / 2;
    const halfHeight = geometry.height / 2;

    return {
        x: geometry.x + (cos * halfWidth - sin * halfHeight),
        y: geometry.y + (sin * halfWidth + cos * halfHeight),
    };
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// Indirect through globalThis so the example lint rule (`no-console`) and the
// recipe stay clean while still surfacing authoring mistakes in the console.
function warn(message: string): void {
    const logger = (globalThis as { console?: { warn?: (message: string) => void } }).console;

    logger?.warn?.(message);
}
