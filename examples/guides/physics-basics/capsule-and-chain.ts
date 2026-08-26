import { CapsuleShape, ChainShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:capsule-and-chain
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

// A hillside. Drawn left to right, so it is solid from above.
world.add(
  new PhysicsBody({
    type: 'static',
    position: { x: 0, y: 0 },
    colliders: [
      {
        shape: new ChainShape([
          { x: -400, y: 0 },
          { x: 0, y: 40 },
          { x: 400, y: 0 },
        ]),
      },
    ],
  }),
);

world.add(
  new PhysicsBody({
    type: 'dynamic',
    position: { x: -200, y: -100 },
    colliders: [{ shape: new CapsuleShape(0, -12, 0, 12, 8), density: 1 }],
  }),
);
// #endregion guide:capsule-and-chain
