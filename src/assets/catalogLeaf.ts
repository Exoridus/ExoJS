import { _stampMeta } from './assetMeta';
import { AssetRef } from './AssetRef';
import type { AssetLeaf } from './AssetType';

/**
 * Builds the handle a catalog entry holds before its payload arrives: a
 * deferred {@link AssetRef} for a value type, an empty resource for a type that
 * heals in place.
 *
 * A type that declares no leaf has nothing to hand out, and says so rather than
 * returning a handle that could never settle.
 * @internal
 */
export function createLeaf(leaf: AssetLeaf<unknown> | undefined, kind: string, src: string, opts?: unknown): object {
  if (leaf === undefined) {
    throw new Error(`No asset type "${kind}" is installed, so "${src}" cannot be materialized.`);
  }

  if (leaf === 'none') {
    throw new Error(`Asset type "${kind}" has no catalog leaf, so "${src}" cannot be held by a catalog. Load it directly instead.`);
  }

  if (leaf === 'ref') {
    const ref = new AssetRef<unknown>();

    ref._loadState.markIdle(); // a catalog leaf is idle until a loader adopts it

    // `parse` is a per-leaf post-load transform, not a fetch option - apply it
    // on fill and keep it out of the source-keyed fetch opts.
    const { parse, ...fetchOpts } = (opts ?? {}) as { parse?: (raw: unknown) => unknown };

    if (typeof parse === 'function') {
      ref._setParse(parse);
    }

    const cleanOpts = Object.keys(fetchOpts).length > 0 ? fetchOpts : undefined;

    return _stampMeta(ref, { kind, src, opts: cleanOpts });
  }

  const placeholder = leaf.createPlaceholder(opts) as { _loadState: { markIdle(): void } };

  placeholder._loadState.markIdle(); // idle until adopted (overrides createPlaceholder's 'loading')

  return _stampMeta(placeholder as object, { kind, src, opts });
}
