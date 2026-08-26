import { BoxShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:sleeping
const world = new PhysicsWorld({
  gravity: { x: 0, y: 1000 },
  enableSleeping: true, // default; set false to never sleep
  sleepLinearVelocity: 5, // px/s - at or below this a body is a sleep candidate
  sleepAngularVelocity: 0.06, // rad/s
  timeToSleep: 0.5, // seconds below the thresholds before sleeping
});
// #endregion guide:sleeping

const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

// #region guide:never-sleep
body.allowSleep = false; // this body - and its island - never sleeps
// #endregion guide:never-sleep
