export * from './core';
// The physics draw layer extends `DebugLayer` from this entry, so this entry and
// the physics debug module import each other. The re-export has to stay last:
// ES modules evaluate dependencies in import order, and the core layers above
// must be evaluated before the physics module's class declaration reads them.
export { PhysicsDebugDraw, type PhysicsDebugDrawOptions } from '#physics-debug';
