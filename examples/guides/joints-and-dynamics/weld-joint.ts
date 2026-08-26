import { BoxShape, PhysicsBody, PhysicsWorld, WeldJoint } from '@codexo/exojs-physics';

// #region guide:weld-joint
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const a = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));
const b = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 24, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

world.addJoint(new WeldJoint({ bodyA: a, bodyB: b }));
// #endregion guide:weld-joint
