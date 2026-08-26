import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:bullet-bodies
const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

// A thin wall the projectile would otherwise skip over.
world.add(new PhysicsBody({ type: 'static', position: { x: 200, y: 0 }, colliders: [{ shape: new BoxShape(4, 400) }] }));

// A fast bullet - swept each step so it stops at the wall instead of tunnelling.
const bullet = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, isBullet: true, colliders: [{ shape: new CircleShape(6) }] }));
bullet.linearVelocityX = 6000; // ~100px per fixed step - far more than the 4px wall is thick
// #endregion guide:bullet-bodies
