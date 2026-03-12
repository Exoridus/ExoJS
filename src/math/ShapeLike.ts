import type { Collidable } from 'types/Collision';
import type { Cloneable, Destroyable, HasBoundingBox } from 'types/types';

export interface ShapeLike extends Collidable, Cloneable, Destroyable, HasBoundingBox {

}
