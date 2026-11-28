import type { SceneNode } from './SceneNode';

/**
 * Callbacks to run when a node is destroyed, kept outside the node so that nodes
 * nobody registers on carry no extra field.
 */
const teardowns = new WeakMap<SceneNode, Array<() => void>>();

/** Runs `teardown` once when `node` is destroyed. @internal */
export const addNodeTeardown = (node: SceneNode, teardown: () => void): void => {
  const list = teardowns.get(node);

  if (list === undefined) {
    teardowns.set(node, [teardown]);
  } else {
    list.push(teardown);
  }
};

/** Cancels a teardown registered with {@link addNodeTeardown}. @internal */
export const removeNodeTeardown = (node: SceneNode, teardown: () => void): void => {
  const list = teardowns.get(node);
  const index = list?.indexOf(teardown) ?? -1;

  if (index !== -1) {
    list!.splice(index, 1);
  }
};

/** Runs and forgets every teardown of `node`, returning the errors they threw. @internal */
export const runNodeTeardowns = (node: SceneNode): unknown[] => {
  const list = teardowns.get(node);

  if (list === undefined) {
    return [];
  }

  teardowns.delete(node);

  const errors: unknown[] = [];

  for (const teardown of list) {
    try {
      teardown();
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
};
