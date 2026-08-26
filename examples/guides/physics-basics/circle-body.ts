import { CircleShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:circle-body
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

const ball = world.add(
  new PhysicsBody({
    type: 'dynamic',
    position: { x: 0, y: -200 },
    colliders: [{ shape: new CircleShape(12), density: 1, restitution: 0.6 }],
  }),
);
// #endregion guide:circle-body
