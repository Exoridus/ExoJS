import { BoxShape, DistanceJoint, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:distance-limits
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 50 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

// A rope: the bob falls freely until it reaches 100px, then the rope holds.
world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, maxLength: 100 }));
// #endregion guide:distance-limits
