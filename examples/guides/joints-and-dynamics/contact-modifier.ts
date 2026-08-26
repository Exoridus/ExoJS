import { PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:contact-modifier
const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

world.contactModifier = contact => {
  // Ice: no friction wherever the icy collider is involved.
  if (contact.colliderA.isSensor || contact.colliderB.isSensor) {
    return;
  }

  contact.friction = 0;
  contact.restitution = 0.1;
};
// #endregion guide:contact-modifier
