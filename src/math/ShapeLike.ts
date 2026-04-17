import type { Collidable } from 'math/Collision';
import type { Cloneable, Destroyable, HasBoundingBox } from 'core/types';

export interface ShapeLike extends Collidable, Cloneable, Destroyable, HasBoundingBox {

}
