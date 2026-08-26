import { BoxShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:box-body
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

// A static floor: an immovable body with a single box collider.
world.add(
  new PhysicsBody({
    type: 'static',
    position: { x: 0, y: 400 },
    colliders: [{ shape: new BoxShape(800, 40) }],
  }),
);

// A dynamic crate that falls onto the floor.
const crate = world.add(
  new PhysicsBody({
    type: 'dynamic',
    position: { x: 0, y: 0 },
    colliders: [{ shape: new BoxShape(32, 32), density: 1, friction: 0.5, restitution: 0.1 }],
  }),
);
// #endregion guide:box-body
