import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld, WheelJoint } from '@codexo/exojs-physics';

// #region guide:wheel-joint
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const chassis = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(120, 20) }] }));
const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 30 }, colliders: [{ shape: new CircleShape(10) }] }));

world.addJoint(
  new WheelJoint({
    bodyA: chassis,
    bodyB: wheel,
    anchor: { x: 0, y: 30 },
    axis: { x: 0, y: 1 }, // suspension travels vertically
    hertz: 5,
    dampingRatio: 0.7,
    enableMotor: true,
    motorSpeed: 20,
    maxMotorTorque: 1e6,
  }),
);
// #endregion guide:wheel-joint
