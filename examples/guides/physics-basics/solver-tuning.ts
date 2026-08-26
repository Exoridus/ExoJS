import { PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:solver-tuning
const world = new PhysicsWorld({
  gravity: { x: 0, y: 1000 },
  interpolation: true,
});
// #endregion guide:solver-tuning
