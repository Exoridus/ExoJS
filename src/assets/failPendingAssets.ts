import type { AssetRef } from './AssetRef';
import type { AssetTypeRegistry } from './AssetTypeRegistry';
import type { CanonicalAsset } from './canonicalKey';
import type { WeakHandleSet } from './WeakHandleSet';

/** Reject pending consumers before type adapters are removed. Visits every handle before returning adapter failures. @internal */
export const failPendingAssets = (
  types: AssetTypeRegistry,
  deferred: Iterable<{ readonly asset: CanonicalAsset; readonly handles: WeakHandleSet }>,
  refs: Iterable<{ readonly refs: ReadonlySet<AssetRef<unknown>> }>,
): unknown[] => {
  const errors: unknown[] = [];
  const error = new DOMException('Asset loader was destroyed.', 'AbortError');

  for (const entry of deferred) {
    const adapter = types.getSeamlessAdapter(entry.asset.type);

    for (const handle of entry.handles) {
      try {
        const state = adapter?.stateOf(handle);

        if (state === 'loading' || state === 'idle') {
          adapter?.fail(handle, error);
        }
      } catch (error_) {
        errors.push(error_);
      }
    }
  }

  for (const entry of refs) {
    for (const ref of entry.refs) {
      if (ref.state === 'loading' || ref.state === 'idle') {
        ref._fail(error);
      }
    }
  }

  return errors;
};
