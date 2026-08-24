// What each cache seam is - and is not - given.
//
// The whole point of splitting policy from layout from store is that no layer
// can reach past its own concern. A policy that could get at an `AssetFactory`
// would be deciding how a resource is built; a store that could get at an
// `AssetType` would be deciding what a representation means. Neither is
// expressible against these contracts, and that is a compile-time property, so
// it is asserted here rather than by poking at runtime objects.
//
// `pnpm typecheck:type-tests` compiles this file under all three lanes, so
// every assertion below must hold identically in all of them.

import type { AssetFactory, CacheContext, CacheLayout, CacheLayoutContext, CachePolicy, CacheReadResult, CacheStore } from '../../src/index';
import { CacheFirstPolicy, MemoryCacheStore, SingleEntryLayout } from '../../src/index';

// --- A policy sees three operations and two identities, and nothing else. ----

type ContextKeys = keyof CacheContext<string>;

const contextKeys: ContextKeys[] = ['namespace', 'sourceKey', 'signal', 'read', 'fetch', 'write'];

// @ts-expect-error - a policy has no route, no store list and no way to reach one.
const noStores: ContextKeys = 'stores';
// @ts-expect-error - a policy never receives the factory that builds the resource.
const noFactory: ContextKeys = 'factory';
// @ts-expect-error - a policy is not told which asset type asked.
const noAssetType: ContextKeys = 'assetType';
// @ts-expect-error - a policy does not name records; the layout does.
const noRecord: ContextKeys = 'record';

void contextKeys;
void noStores;
void noFactory;
void noAssetType;
void noRecord;

// --- A cache-first policy needs nothing but the context. --------------------

class MinimalCacheFirstPolicy implements CachePolicy {
  public async resolve<T>(context: CacheContext<T>): Promise<T> {
    const cached = await context.read();

    if (cached.hit) {
      return cached.value;
    }

    const value = await context.fetch();

    await context.write(value);

    return value;
  }
}

const policy: CachePolicy = new MinimalCacheFirstPolicy();

void policy;
void new CacheFirstPolicy();

// --- A store sees record keys and opaque values. ----------------------------

type StoreKeys = keyof CacheStore;

const storeKeys: StoreKeys[] = ['id', 'get', 'set', 'delete', 'clear', 'destroy'];

// @ts-expect-error - a store is never handed the asset type a record belongs to.
const storeNoAssetType: StoreKeys = 'assetType';
// @ts-expect-error - a store does not decode; that is the codec's work.
const storeNoCodec: StoreKeys = 'codec';
// @ts-expect-error - a store does not choose a policy.
const storeNoPolicy: StoreKeys = 'policy';

void storeKeys;
void storeNoAssetType;
void storeNoCodec;
void storeNoPolicy;

// A store's value type is deliberately open, so a `Blob` is as storable as a
// string without the contract naming either.
const store: CacheStore = new MemoryCacheStore();

void store.set({ namespace: 'a', source: 'url:x', version: 1, record: 'value' }, new Uint8Array([1, 2, 3]));

// An `AssetFactory` is not a `CacheStore` and cannot be passed as one.
declare const factory: AssetFactory<string, object>;

// @ts-expect-error - the two contracts share nothing; a factory can never stand in for a store.
const factoryAsStore: CacheStore = factory;

void factoryAsStore;

// --- A layout addresses named records, never composed keys. -----------------

type LayoutContextKeys = keyof CacheLayoutContext;

const layoutContextKeys: LayoutContextKeys[] = ['read', 'write'];

// @ts-expect-error - the namespace is the cache's to own, not the layout's.
const layoutNoNamespace: LayoutContextKeys = 'namespace';
// @ts-expect-error - a layout cannot reach the store directly.
const layoutNoStore: LayoutContextKeys = 'store';

void layoutContextKeys;
void layoutNoNamespace;
void layoutNoStore;

const layout: CacheLayout<string> = SingleEntryLayout.version<string>(1);

void layout.version;

// --- A read result carries its value only on the hit branch. ----------------

declare const result: CacheReadResult<string>;

if (result.hit) {
  const value: string = result.value;

  void value;
} else {
  // @ts-expect-error - a miss has no value to read, which is what keeps it
  // distinct from a stored `undefined`.
  void result.value;
}
