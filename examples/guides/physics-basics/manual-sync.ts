import { radiansToDegrees, Sprite, Texture } from '@codexo/exojs';
import { BoxShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 100, y: 0 }, colliders: [{ shape: new BoxShape(32, 32) }] }));
const sprite = new Sprite(Texture.empty);

// #region guide:manual-sync
sprite.setPosition(body.x, body.y);
sprite.setRotation(radiansToDegrees(body.angle));
// #endregion guide:manual-sync
