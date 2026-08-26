import { Sprite } from '@codexo/exojs';
import { CircleShape, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:binding-options
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
const sprite = new Sprite(null);

world.attach(sprite, { type: 'dynamic', position: { x: 0, y: 0 }, shape: new CircleShape(12), restitution: 0.5 });
// #endregion guide:binding-options
