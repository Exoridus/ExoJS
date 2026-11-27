import type { Component } from '#core/Component';
import { logger } from '#core/Logger';
import type { SceneNode } from '#core/SceneNode';

const assetReleases = new WeakMap<SceneNode, ReadonlyArray<() => void>>();

/** Move completed reads' texture leases to the node that consumes them. @internal */
export const retainReadAssets = (node: SceneNode, releases: ReadonlyArray<() => void>): void => {
  if (node.destroyed) {
    releaseReadAssets(releases);
  } else {
    const previous = assetReleases.get(node);
    assetReleases.set(node, previous === undefined ? releases : [...previous, ...releases]);
  }
};

/** Release every lease even if one texture's teardown fails. @internal */
export const releaseReadAssets = (releases: ReadonlyArray<() => void>): void => {
  for (const release of releases) {
    try {
      release();
    } catch (error) {
      logger.error('A deserialized asset lease could not be fully released.', { source: 'deserialize', data: { error } });
    }
  }
};

/** @internal */
export const releaseNodeReadAssets = (node: SceneNode): void => {
  const releases = assetReleases.get(node);

  if (releases !== undefined) {
    assetReleases.delete(node);
    releaseReadAssets(releases);
  }
};

/** Release a provisional object without replacing the error that aborted its read. @internal */
export const destroyFailedRead = (node: SceneNode | Component): void => {
  if (node.destroyed) {
    return;
  }

  try {
    node.destroy();
  } catch (error) {
    logger.error('A provisional object could not be fully destroyed after deserialization failed.', {
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
