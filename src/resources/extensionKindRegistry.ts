import type { AssetDefinitions } from './AssetDefinitions';

const extToKind = new Map<string, keyof AssetDefinitions>();

function normalizeExt(ext: string): string {
  return ext.replace(/^\.+/, '').toLowerCase();
}

/**
 * Map a file suffix to an asset kind for bare-string path inference in
 * `Assets.from()` / `get()` / `load()` (asset-system v2 §5).
 *
 * Compound suffixes (`atlas.json`) are allowed and win over their bare tail
 * (`json`) via longest-suffix-first resolution. Registering a **bare** suffix
 * already claimed by a *different* kind is a **loud conflict** (§5.1): it throws
 * naming both kinds and pointing to the compound-suffix / `X.of()` escape
 * hatches, replacing the old silent clobber. Idempotent for the same
 * `(ext, kind)` pair.
 */
export function registerExtensionKind(ext: string, kind: keyof AssetDefinitions): void {
  const key = normalizeExt(ext);
  const existing = extToKind.get(key);
  if (existing !== undefined && existing !== kind) {
    throw new Error(
      `extensionKindRegistry: suffix ".${key}" is already registered as kind "${existing}", ` +
        `cannot also register it as "${kind}". Use a compound suffix (e.g. "${kind}.${key}") ` +
        `or annotate individual assets with Asset.kind(...) instead of a bare path.`,
    );
  }
  extToKind.set(key, kind);
}

/** The kind registered for a bare/compound suffix, or `undefined`. @internal */
export function getExtensionKind(ext: string): keyof AssetDefinitions | undefined {
  return extToKind.get(normalizeExt(ext));
}

/**
 * Resolve a path string to its asset kind — basename-only, longest-suffix-first
 * (mirrors the type-level `MatchKind`/`KindByPath`). Query/hash are stripped. Returns
 * `undefined` when no dot-suffix of the basename is registered. @internal
 */
export function resolveKindByPath(path: string): keyof AssetDefinitions | undefined {
  const noQuery = path.split(/[?#]/)[0] ?? path;
  const basename = noQuery.split('/').pop() ?? noQuery;
  const parts = basename.toLowerCase().split('.');
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join('.');
    const kind = extToKind.get(suffix);
    if (kind !== undefined) return kind;
  }
  return undefined;
}

/** Test-only reset of the module-level registry. @internal */
export function _resetExtensionKindsForTest(): void {
  extToKind.clear();
}
