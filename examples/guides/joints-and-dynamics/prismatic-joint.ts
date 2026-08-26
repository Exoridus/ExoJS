import { BoxShape, PhysicsBody, PhysicsWorld, PrismaticJoint } from '@codexo/exojs-physics';

// #region guide:prismatic-joint
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const rail = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

world.addJoint(
  new PrismaticJoint({
    bodyA: rail,
    bodyB: slider,
    anchor: { x: 0, y: 0 },
    axis: { x: 1, y: 0 }, // slide horizontally
    enableMotor: true,
    motorSpeed: 100,
    maxMotorForce: 1e8,
    enableLimit: true,
    lowerTranslation: 0,
    upperTranslation: 200,
  }),
);
// #endregion guide:prismatic-joint
