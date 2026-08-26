import { BoxShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:one-way-platform
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const platform = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 300 }, colliders: [{ shape: new BoxShape(400, 10) }] }));
const player = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 100 }, colliders: [{ shape: new BoxShape(20, 40) }] }));

let jumpingUp = false;

world.contactModifier = contact => {
  const involvesPlatform = contact.bodyA === platform || contact.bodyB === platform;

  if (involvesPlatform && jumpingUp) {
    contact.enabled = false;
  }
};

// In your update, before stepping the world:
jumpingUp = player.linearVelocityY < -10;
// #endregion guide:one-way-platform
