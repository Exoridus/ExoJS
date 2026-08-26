import { BoxShape, DistanceJoint, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:distance-joint
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 150 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

// Rigid rod: holds the bob exactly 100px from the anchor.
world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 100 }));

// Or a soft spring that sags and bobs under gravity:
world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 100, hertz: 2.5, dampingRatio: 1 }));
// #endregion guide:distance-joint
