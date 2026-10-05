import { _readMeta, _stampMeta } from './assetMeta';
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
export const createLeaf = (leaf: AssetLeaf<unknown> | undefined, kind: string, src: string, opts?: unknown): object => {
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
};

// Leaf -> the owner token of the loader that first claimed it. Keyed weakly by
// the leaf and valued by a token rather than the loader, so a module-level
// catalog never keeps a destroyed loader alive.
const leafOwners = new WeakMap<object, object>();

/**
 * Bind catalog leaves to one loader, or throw before binding any of them.
 *
 * A leaf heals in place, so its payload, load state and claims can only ever
 * belong to one loader's residency. A second loader adopting it would overwrite
 * state the first still serves, so every leaf is checked before the first one
 * is bound, and a rejected batch changes nothing. The binding is permanent: a
 * leaf whose loader was destroyed is not handed to the next one either.
 * @internal
 */
export const _bindLeaves = (leaves: Iterable<object>, owner: object): void => {
  for (const leaf of leaves) {
    const bound = leafOwners.get(leaf);

    if (bound !== undefined && bound !== owner) {
      const meta = _readMeta(leaf);
      const name = meta === undefined ? 'An asset catalog leaf' : `Asset catalog leaf "${meta.src}" (${meta.kind})`;

      throw new Error(
        `${name} already belongs to another loader. A catalog leaf is bound to the first application loader that claims it, ` +
          'even after that loader is destroyed. Create the catalog per application - for example from a function each ' +
          'application calls - instead of sharing one module-level Assets.from() instance between applications.',
      );
    }
  }

  for (const leaf of leaves) {
    leafOwners.set(leaf, owner);
  }
};
