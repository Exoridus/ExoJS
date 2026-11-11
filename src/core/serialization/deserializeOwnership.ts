import { logger } from '#core/Logger';
import type { SceneNode } from '#core/SceneNode';

/** Release a provisional node without replacing the error that aborted its read. @internal */
export const destroyFailedRead = (node: SceneNode): void => {
  if (node.destroyed) {
    return;
  }

  try {
    node.destroy();
  } catch (error) {
    logger.error('A provisional node could not be fully destroyed after deserialization failed.', {
      source: 'deserialize',
      data: { error },
    });
  }
};

/** Keep construction ownership until a serializer can return its completed node. @internal */
export const initializeDeserializedNode = <T extends SceneNode>(node: T, initialize: (node: T) => void): T => {
  try {
    initialize(node);

    return node;
  } catch (error) {
    destroyFailedRead(node);

    throw error;
  }
};
