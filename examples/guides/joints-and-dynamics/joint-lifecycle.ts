import { BoxShape, PhysicsBody, PhysicsWorld, RevoluteJoint } from '@codexo/exojs-physics';

const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const bodyA = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
const bodyB = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 70, y: 0 }, colliders: [{ shape: new BoxShape(100, 10) }] }));
const anchor = { x: 0, y: 0 };

// #region guide:joint-lifecycle
const joint = world.addJoint(new RevoluteJoint({ bodyA, bodyB, anchor }));
// ...later...
world.removeJoint(joint);
// #endregion guide:joint-lifecycle
