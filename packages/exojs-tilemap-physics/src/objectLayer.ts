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
 * The layer's pixel offset is applied, so the colliders land where the layer is
 * drawn. Objects with no collision geometry (points, tile and text objects) are
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

    const x = object.x + layer.offsetX;
    const y = object.y + layer.offsetY;
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
