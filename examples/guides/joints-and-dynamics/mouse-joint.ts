import { BoxShape, MouseJoint, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:mouse-joint
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

const drag = world.addJoint(new MouseJoint({ body, target: { x: 0, y: 0 }, hertz: 5, dampingRatio: 0.7, maxForce: 10000 }));
drag.target = { x: 50, y: -30 }; // update from the pointer position each frame
// #endregion guide:mouse-joint
