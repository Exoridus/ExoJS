import type { AssetRef } from './AssetRef';
import type { SeamlessAdapter } from './seamless';

interface AssetHandles {
  readonly handles?: Iterable<unknown>;
  readonly refs?: ReadonlySet<AssetRef<unknown>>;
}

/** A failed sibling makes joining the shared acquisition a retry. @internal */
export const hasFailedAssetHandle = (entry: AssetHandles, adapter?: SeamlessAdapter<unknown>): boolean => {
  for (const handle of entry.handles ?? []) {
    if (adapter?.stateOf(handle) === 'failed') {
      return true;
    }
  }

  for (const ref of entry.refs ?? []) {
    if (ref.state === 'failed') {
      return true;
    }
  }

  return false;
};

/** Re-arm failed consumers before callers read the replacement promise. @internal */
export const retryAssetHandles = (entry: AssetHandles | undefined, adapter?: SeamlessAdapter<unknown>): void => {
  for (const handle of entry?.handles ?? []) {
    if (adapter?.stateOf(handle) === 'failed') {
      adapter.begin(handle);
    }
  }

  for (const ref of entry?.refs ?? []) {
    if (ref.state === 'failed') {
      ref._begin();
    }
  }
};
