import type { AssetDefinitions } from './AssetDefinitions';
import { _stampMeta } from './assetMeta';
import { AssetRef } from './AssetRef';
import type { SeamlessAdapter } from './seamless';

/** An asset type's placeholder strategy: a resource type carries a {@link SeamlessAdapter}; a value type does not. */
export interface AssetKindEntry {
  readonly adapter?: SeamlessAdapter<unknown>;
  readonly isValue: boolean;
}

const kinds = new Map<string, AssetKindEntry>();

/** Register an asset type's placeholder strategy. Idempotent for the same entry; throws on a conflicting registration. @internal */
export function registerAssetKind(kind: keyof AssetDefinitions, entry: AssetKindEntry): void {
  const existing = kinds.get(kind);
  if (existing !== undefined && (existing.isValue !== entry.isValue || existing.adapter !== entry.adapter)) {
    throw new Error(`assetKindRegistry: type "${kind}" already registered with a conflicting entry.`);
  }
  kinds.set(kind, entry);
}

/** @internal */
export function getAssetKind(kind: string): AssetKindEntry | undefined {
  return kinds.get(kind);
}

/** Build a meta-stamped placeholder handle (resource) or `AssetRef` (value) for a catalog leaf. @internal */
export function createLeaf(kind: keyof AssetDefinitions, src: string, opts?: unknown): object {
  const entry = kinds.get(kind);
  if (entry === undefined) {
    throw new Error(`assetKindRegistry: no type registered for "${kind}". Register it via registerAssetKind().`);
  }

  if (entry.isValue) {
    const ref = new AssetRef<unknown>();
    ref._loadState.markIdle(); // a catalog leaf is idle until a loader adopts it
    // `parse` is a per-leaf post-load transform, not a fetch option — apply it on
    // fill and keep it out of the source-keyed fetch opts.
    const { parse, ...fetchOpts } = (opts ?? {}) as { parse?: (raw: unknown) => unknown };
    if (typeof parse === 'function') ref._setParse(parse);
    const cleanOpts = Object.keys(fetchOpts).length > 0 ? fetchOpts : undefined;
    return _stampMeta(ref, { kind, src, opts: cleanOpts });
  }

  if (entry.adapter === undefined) {
    throw new Error(`assetKindRegistry: resource type "${kind}" has no seamless adapter.`);
  }

  const placeholder = entry.adapter.createPlaceholder(opts) as { _loadState: { markIdle(): void } };
  placeholder._loadState.markIdle(); // idle until adopted (overrides createPlaceholder's 'loading')
  return _stampMeta(placeholder as object, { kind, src, opts });
}
