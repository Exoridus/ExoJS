import type { ICollidable } from 'types/Collision';
import type { ICloneable, IDestroyable, IWithBoundingBox } from 'types/types';

export interface IShape extends ICollidable, ICloneable, IDestroyable, IWithBoundingBox {

}
