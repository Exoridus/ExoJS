import type { SceneNode } from '@codexo/exojs';

import { Collider } from '../Collider';
import { PhysicsBody } from '../PhysicsBody';
import type { AttachOptions } from '../PhysicsWorld';
import { nodeWorldAngle, nodeWorldPosition } from './nodeWorldTransform';

/** @internal */
export const createBodyForNode = (node: SceneNode, options: AttachOptions): PhysicsBody =>
  new PhysicsBody({
    ...(options.type !== undefined && { type: options.type }),
    position: options.position ?? nodeWorldPosition(node),
    angle: options.angle ?? nodeWorldAngle(node),
    ...(options.gravityScale !== undefined && { gravityScale: options.gravityScale }),
    ...(options.fixedRotation !== undefined && { fixedRotation: options.fixedRotation }),
    colliders: [
      new Collider({
        shape: options.shape,
        ...(options.offset !== undefined && { offset: options.offset }),
        ...(options.rotation !== undefined && { rotation: options.rotation }),
        ...(options.density !== undefined && { density: options.density }),
        ...(options.friction !== undefined && { friction: options.friction }),
        ...(options.restitution !== undefined && { restitution: options.restitution }),
        ...(options.isSensor !== undefined && { isSensor: options.isSensor }),
        ...(options.filter !== undefined && { filter: options.filter }),
      }),
    ],
  });
