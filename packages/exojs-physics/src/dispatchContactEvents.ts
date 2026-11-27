import type { ContactGraph } from './ContactGraph';
import type { PhysicsWorld } from './PhysicsWorld';

export const dispatchContactEvents = (graph: ContactGraph, world: PhysicsWorld): void => {
  // A removal's end must precede a new start for the same pair.
  for (const event of graph.removalCollisionEnd) {
    world.onCollisionEnd.dispatch(event);
  }

  for (const event of graph.removalSensorExit) {
    world.onSensorExit.dispatch(event);
  }

  graph.clearRemovalEnds();

  for (const event of graph.collisionEnd) {
    world.onCollisionEnd.dispatch(event);
  }

  for (const event of graph.sensorExit) {
    world.onSensorExit.dispatch(event);
  }

  for (const event of graph.collisionStart) {
    world.onCollisionStart.dispatch(event);
  }

  for (const event of graph.sensorEnter) {
    world.onSensorEnter.dispatch(event);
  }
};
