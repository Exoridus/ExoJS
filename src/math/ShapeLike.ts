import type { Cloneable, Destroyable, HasBoundingBox } from '#core/types';

import type { Collidable } from './collisionTypes';

/**
 * Conformance contract shared by the concrete math shape values ({@link Circle},
 * {@link Rectangle}, {@link Polygon}, {@link Ellipse}, {@link Line},
 * {@link Vector}): a {@link Collidable} that can also be cloned, destroyed and
 * queried for its axis-aligned bounding box.
 *
 * Two implementers ({@link Vector}, {@link Line}) satisfy {@link Collidable}
 * structurally but produce no SAT collision response, so an API that needs a
 * resolvable overlap should take {@link Collidable} and check the response it
 * gets back rather than accepting any `ShapeLike`.
 */
export interface ShapeLike extends Collidable, Cloneable<ShapeLike>, Destroyable, HasBoundingBox {}
