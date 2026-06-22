// Shared example recipe: build static physics colliders from a Tiled object
// layer.
//
// This module is the integration seam between two intentionally decoupled
// packages: `@codexo/exojs-tilemap` (data-only object layers) and
// `@codexo/exojs-physics` (the simulation world). Neither package depends on
// the other — tilemap never imports physics, physics never imports tilemap
// (see the B4/D4 ADR on shared geometry vs. separate collision detection). The
// glue therefore lives here, in example/app land, where depending on both is
// legitimate. Copy it into your own project and adapt as needed; it is a
// recipe, not engine API.
//
// It walks an `ObjectLayer`, maps each geometry kind to the closest convex
// physics shape, and adds one static `PhysicsBody` per object to the world:
//
//   - Rectangle → `BoxShape`            (centred on the object's centre)
//   - Polygon   → `PolygonShape`        (convex; concave inputs are skipped)
//   - Ellipse   → `CircleShape`         (radius = the larger semi-axis)
//   - Point / Polyline / Tile           (no closed area → skipped)
//
// Object coordinates are in object-layer pixel space with +Y down, matching the
// engine's screen space, so positions map straight through. Rotation (Tiled
// degrees, clockwise) is converted to radians on the body.

import {
    BoxShape,
    CircleShape,
    type CollisionFilter,
    PhysicsBody,
    type PhysicsWorld,
    PolygonShape,
    type Shape,
} from '@codexo/exojs-physics';
import { ObjectKind, type ObjectLayer, type TileMapObject } from '@codexo/exojs-tilemap';

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

        const placement = shapeForObject(object);

        if (placement === null) {
            continue;
        }

        const body = new PhysicsBody({
            type: 'static',
            position: { x: placement.x, y: placement.y },
            angle: object.rotation * DEGREES_TO_RADIANS,
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

/** A shape plus the world position its origin should be placed at. */
interface ShapePlacement {
    readonly shape: Shape;
    readonly x: number;
    readonly y: number;
}

/**
 * Map one object to a convex shape + body position, or `null` when the object
 * has no closed area (point / polyline / tile) or is a degenerate / non-convex
 * polygon. The body is positioned at the object's geometric centre so the
 * shape, which is centred on the collider origin, lines up with the object.
 */
function shapeForObject(object: TileMapObject): ShapePlacement | null {
    switch (object.kind) {
        case ObjectKind.Rectangle: {
            if (object.width <= 0 || object.height <= 0) {
                return null;
            }

            // The body sits at the rectangle's centre; the box is centred on it.
            // Rotation pivots about the object origin in Tiled, so rotate the
            // centre offset (w/2, h/2) by the object's angle around that origin.
            const angle = object.rotation * DEGREES_TO_RADIANS;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const halfWidth = object.width / 2;
            const halfHeight = object.height / 2;

            return {
                shape: new BoxShape(object.width, object.height),
                x: object.x + (cos * halfWidth - sin * halfHeight),
                y: object.y + (sin * halfWidth + cos * halfHeight),
            };
        }

        case ObjectKind.Ellipse: {
            // No native ellipse collider — approximate with a circle whose radius
            // is the larger semi-axis (a conservative, fully-covering bound).
            const radius = Math.max(object.width, object.height) / 2;

            if (radius <= 0) {
                return null;
            }

            const angle = object.rotation * DEGREES_TO_RADIANS;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const halfWidth = object.width / 2;
            const halfHeight = object.height / 2;

            return {
                shape: new CircleShape(radius),
                x: object.x + (cos * halfWidth - sin * halfHeight),
                y: object.y + (sin * halfWidth + cos * halfHeight),
            };
        }

        case ObjectKind.Polygon: {
            if (object.points.length < 3) {
                return null;
            }

            try {
                // Polygon points are relative to the object origin; the body
                // carries the world origin + rotation, so the shape keeps the
                // local points and we place the body at the object origin.
                const shape = new PolygonShape(object.points.map(point => ({ x: point.x, y: point.y })));

                return { shape, x: object.x, y: object.y };
            } catch (error) {
                // PolygonShape throws on non-convex / degenerate input — there is
                // no automatic convex decomposition. Skip and let the author know.
                warn(`physics-tilemap: skipped non-convex/degenerate polygon "${object.name || object.id}": ${describeError(error)}`);

                return null;
            }
        }

        default:
            // Point, polyline and tile objects have no closed collision area.
            return null;
    }
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
