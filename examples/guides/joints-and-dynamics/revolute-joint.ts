import { BoxShape, PhysicsBody, PhysicsWorld, RevoluteJoint } from '@codexo/exojs-physics';

// #region guide:revolute-joint
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
const arm = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 70, y: 0 }, colliders: [{ shape: new BoxShape(100, 10) }] }));

// A free hinge at the origin - the arm swings under gravity.
world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: arm, anchor: { x: 0, y: 0 } }));

// A powered hinge - a motor driving it toward 5 rad/s, capped torque:
world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: arm, anchor: { x: 0, y: 0 }, enableMotor: true, motorSpeed: 5, maxMotorTorque: 1e8 }));

// A limited hinge - the relative angle is clamped to ±45°:
world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: arm, anchor: { x: 0, y: 0 }, enableLimit: true, lowerAngle: -Math.PI / 4, upperAngle: Math.PI / 4 }));
// #endregion guide:revolute-joint
