import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';

import type { FocusController } from './FocusController';
import type { InteractionEvent } from './InteractionEvent';
import type { ScopeToken } from './ScopeToken';

/** Dispatches through ancestors until propagation stops, without creating unused node signals. @internal */
export const bubbleInteractionEvent = (event: InteractionEvent): void => {
  let current: RenderNode | null = event.target;

  while (current !== null) {
    event.currentTarget = current;
    current._peekInteractionSignal(event.type)?.dispatch(event);

    if (event.propagationStopped) {
      break;
    }

    current = current.parent;
  }
};

const isDescendantOrSelf = (node: RenderNode, root: RenderNode): boolean => {
  let current: RenderNode | null = node;

  while (current !== null) {
    if (current === root) {
      return true;
    }

    current = current.parent;
  }

  return false;
};

/** Removes subtree-local scopes without changing scopes in another tree. @internal */
export const removeScopesInSubtree = (
  stack: Array<{ token: ScopeToken; root: RenderNode }>,
  root: RenderNode,
  focus: FocusController,
): void => {
  for (let index = stack.length - 1; index >= 0; index--) {
    const entry = stack[index];

    if (entry !== undefined && isDescendantOrSelf(entry.root, root)) {
      stack.splice(index, 1);
      focus.popScope(entry.token);
    }
  }
};

/** Iterative pre-order traversal avoids recursive stack growth on deep trees. @internal */
export const iterateInteractionSubtree = function* (root: RenderNode): Generator<RenderNode> {
  const stack: RenderNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;

    yield node;

    if (node instanceof Container) {
      // Push in reverse to preserve child insertion order.
      for (let index = node.children.length - 1; index >= 0; index--) {
        const child = node.children[index];

        if (child !== undefined) {
          stack.push(child);
        }
      }
    }
  }
};
