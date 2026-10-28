import { logger } from '#core/Logger';

/** Reports observer failures without rejecting successful asset work. @internal */
export const reportAssetObserverFailure = (error: unknown): void => {
  logger.error('Asset observer failed.', {
    source: 'assets',
    error: error instanceof Error ? error : new Error(String(error)),
  });
};

/**
 * Structural comparison of two option bags, for the dev-only ignored-options
 * diagnostic. Depth-limited: an option value nested deeper than an asset type's
 * own configuration ever goes is compared by identity rather than risking an
 * unbounded walk of whatever a caller put there.
 */
export const sameOptions = (a: unknown, b: unknown, depth = 0): boolean => {
  if (Object.is(a, b)) {
    return true;
  }

  if (depth >= 4 || typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }

  const keys = Object.keys(a);

  return (
    keys.length === Object.keys(b).length &&
    keys.every(key => sameOptions((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1))
  );
};
