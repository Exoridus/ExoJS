import { Sprite } from '@codexo/exojs';
import { CircleShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:sprite-binding
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const sprite = new Sprite(null);

const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(12) }] }));

world.bind(body, sprite); // sprite now tracks the body every step
// #endregion guide:sprite-binding
