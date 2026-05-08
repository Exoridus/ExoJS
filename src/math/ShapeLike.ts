import type { Cloneable, Destroyable, HasBoundingBox } from '@/core/types';
import type { Collidable } from '@/math/Collision';

/**
 * Full shape contract: a {@link Collidable} that can also be cloned, destroyed,
 * and queried for its axis-aligned bounding box. All concrete shape classes
 * ({@link Circle}, {@link Rectangle}, {@link Polygon}, {@link Ellipse},
 * {@link Line}, {@link Vector}) implement this interface.
 */
export interface ShapeLike extends Collidable, Cloneable, Destroyable, HasBoundingBox {}
