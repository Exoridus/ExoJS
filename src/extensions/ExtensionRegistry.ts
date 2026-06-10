import type { Extension } from './Extension';
import { buildSnapshot, type ExtensionSnapshot, freezeExtension } from './snapshot';

// Module-level store — accessible to testing.ts via _clearRegistryStore.
let _byId = new Map<string, Extension>();
let _revision = 0;
let _cache: { revision: number; snapshot: ExtensionSnapshot } | undefined;

/** @internal — used by testing.ts only; NOT re-exported from barrel */
export function _clearRegistryStore(): void {
  _byId = new Map();
  _revision++;
  _cache = undefined;
}

/** @internal */
export function getGlobalSnapshotInternal(): ExtensionSnapshot {
  if (_cache?.revision === _revision) {
    return _cache.snapshot;
  }

  const snapshot = buildSnapshot([..._byId.values()]);
  _cache = { revision: _revision, snapshot };

  return snapshot;
}

/**
 * Process-wide static catalogue of {@link Extension} descriptors. Stores
 * descriptors only — never Application, backend, GPU, or loader instances — and
 * is read exactly once per Application (at construction). Not read in any hot path.
 *
 * Extension authors import from `@codexo/exojs/extensions`:
 *   import { ExtensionRegistry } from '@codexo/exojs/extensions';
 * @advanced
 */
export class ExtensionRegistry {
  private constructor() {}

  /**
   * Register an extension descriptor. Idempotent for the *same object* under the
   * same `id` (no-op). Throws if a *different* object is already registered under
   * that `id` — this detects duplicate package installations.
   */
  public static register(extension: Extension): void {
    const existing = _byId.get(extension.id);

    if (existing !== undefined) {
      if (existing === extension) return;
      throw new Error(
        `An extension with id "${extension.id}" is already registered with a different descriptor. ` +
          `Ensure only one copy of the extension package is installed (check for duplicate or mismatched versions).`,
      );
    }

    _byId.set(extension.id, extension);
    _revision++;
    _cache = undefined;

    // Eager freeze at registration time so that globally registered descriptors
    // are immediately immutable. Idempotent with buildSnapshot's per-visit freeze.
    freezeExtension(extension);
  }

  /** True if an extension with `id` is currently registered. */
  public static has(id: string): boolean {
    return _byId.has(id);
  }

  /** The registered descriptor for `id`, or `undefined`. */
  public static get(id: string): Readonly<Extension> | undefined {
    return _byId.get(id);
  }

  /**
   * All registered descriptors in registration order.
   * Returns a cached readonly view; no allocation on repeated calls while the
   * registry is unchanged. Invalidated only after a new registration.
   */
  public static list(): ReadonlyArray<Readonly<Extension>> {
    return getGlobalSnapshotInternal().extensions;
  }
}
