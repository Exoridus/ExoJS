import { PhysicsBody, type PhysicsWorld } from '@codexo/exojs-physics';
import type { ObjectLayer, TileMapObject } from '@codexo/exojs-tilemap';

import { collidersForGeometry, objectLabel } from './buildColliders';
import { resolveDefaults, resolveMaterial } from './material';
import type { ColliderDefaults } from './types';

/** Options for {@link buildObjectLayerColliders}. */
export interface ObjectColliderOptions extends ColliderDefaults {
  /** Drop an object before a body is built for it. Return `true` to keep it. */
  accept?: (object: TileMapObject) => boolean;
}

/** One static body built from one object, paired with its source. */
export interface ObjectCollider {
  readonly object: TileMapObject;
  readonly body: PhysicsBody;
}

/**
 * Build one static body per collision object in an object layer and add them to
 * `world`.
 *
 * An object layer is static data with no residency, so this is a one-shot
 * build with no lifecycle: the caller owns the returned bodies and destroys
 * them through the world. Use {@link import('./TileColliderStreamer').TileColliderStreamer}
 * for tile layers, whose chunks come and go.
 *
 * The layer's display offset is converted to a logical translation. Isometric
 * geometry remains in logical space; use TilePhysicsBinding for presentation. Objects with no collision geometry (points, tile and text objects) are
 * skipped, as is any object the decomposition rejects - with a warning, not an
 * exception.
 */
export const buildObjectLayerColliders = (
  world: PhysicsWorld,
  layer: ObjectLayer,
  options: ObjectColliderOptions = {},
): ObjectCollider[] => {
  const defaults = resolveDefaults(options);
  const accept = options.accept;
  const built: ObjectCollider[] = [];

  for (const object of layer.objects) {
    if (accept !== undefined && !accept(object)) {
      continue;
    }

    const p = layer.projection;
    const offset =
      p === undefined ? { x: layer.offsetX, y: layer.offsetY } : p.pixelToLogical(p.originX + layer.offsetX, p.originY + layer.offsetY);
    const x = object.x + offset.x;
    const y = object.y + offset.y;
    const material = resolveMaterial(defaults, options.material, { type: object.type, object });
    const colliders = collidersForGeometry({ ...object, x, y }, material, x, y, objectLabel(object));

    if (colliders.length === 0) {
      continue;
    }

    built.push({
      object,
      body: world.add(new PhysicsBody({ type: 'static', position: { x, y }, colliders })),
    });
  }

  return built;
};
