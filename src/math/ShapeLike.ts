import type { Cloneable, Destroyable, HasBoundingBox } from '#core/types';

import type { Collidable } from './collisionTypes';

/**
 * Conformance contract shared by the concrete math shape values ({@link Circle},
 * {@link Rectangle}, {@link Polygon}, {@link Ellipse}, {@link Line},
 * {@link Vector}): a {@link Collidable} that can also be cloned, destroyed and
 * queried for its axis-aligned bounding box.
 *
 * Internal on purpose - no public API accepts one, and two implementers
 * ({@link Vector}, {@link Line}) do not produce a SAT collision response.
 * {@link Collidable} is the public collision vocabulary.
 *
 * @internal
 */
export interface ShapeLike extends Collidable, Cloneable<ShapeLike>, Destroyable, HasBoundingBox {}
