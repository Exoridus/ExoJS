import { Asset } from '#assets/Asset';
import { createLeaf } from '#assets/catalogLeaf';
import { Loader } from '#assets/Loader';
import type { SeamlessAdapter } from '#assets/seamless';
import type { LoadStateValue } from '#core/LoadState';
import { LoadState } from '#core/LoadState';

import { testAssetType } from './test-asset-type';

/**
 * A seeded operation sequence checks readiness and residency after every step.
 * One key group exercises claims, release, cancellation and replacement; another
 * checks stored/in-flight deduplication and failure retries through load().
 */

// ---------------------------------------------------------------------------
// A minimal seamless (resource) asset type, fully test-controlled.
// ---------------------------------------------------------------------------

class StubHandle {
  public readonly _loadState = new LoadState<StubHandle>();
  public payload: string | null = null;

  public get loadState(): LoadStateValue {
    return this._loadState.value;
  }

  public get loaded(): Promise<StubHandle> {
    return this._loadState.loaded(this);
  }
}

/**
 * `new Asset({...})` types its `type` against the registered `AssetDefinitions`
 * keys, and `stub` is deliberately not one - the walk installs it on the loader
 * at runtime only, so the descriptor goes through the implementation signature.
 */
const stubAsset = (source: string): Asset<StubHandle> =>
  new (Asset as unknown as new (config: { type: string; source: string }) => Asset<StubHandle>)({ type: 'stub', source });

const stubAdapter: SeamlessAdapter<StubHandle> = {
  createPlaceholder(): StubHandle {
    const handle = new StubHandle();
    handle._loadState.begin();

    return handle;
  },
  begin(handle) {
    handle._loadState.begin();
  },
  fill(handle, donor) {
    handle.payload = donor.payload;
    handle._loadState.settle(handle);
  },
  fail(handle, error) {
    handle.payload = null;
    handle._loadState.fail(error);
  },
  evict(handle) {
    handle.payload = null;
    handle._loadState.begin();
  },
  stateOf(handle) {
    return handle.loadState;
  },
};

test('readiness x residency: seeded random claim/release/fetch/fail sequence keeps every invariant', async () => {
  const R_KEYS = ['r0', 'r1', 'r2'];
  const L_KEYS = ['l0', 'l1', 'l2'];
  const loader = new Loader();
  const SCOPES = [
    loader.createScope({ name: 'scope0' }),
    loader.createScope({ name: 'scope1' }),
    loader.createScope({ name: 'scope2' }),
    loader.createScope({ name: 'scope3' }),
  ];

  let fetchCount = 0;
  // Factory invocations are synchronous up to their own Promise executor
  // (verified against AssetDecoder._dispatchFetch), so `pending` always
  // reflects the current in-flight set immediately after a triggering call -
  // no `await` needed between issuing a fetch and observing it here.
  const pending = new Map<string, { resolve: (h: StubHandle) => void; reject: (e: Error) => void; signal: AbortSignal | undefined }>();

  loader._installAssetTypes([
    testAssetType<string, StubHandle>({
      id: 'stub',
      token: StubHandle,
      leaf: stubAdapter,
      acquires: false,
      create: (_source, context) =>
        new Promise<StubHandle>((resolve, reject) => {
          fetchCount++;
          pending.set(context.source, { resolve, reject, signal: context.signal });
        }),
    }),
  ]);

  interface Ch1Model {
    handle: StubHandle | null;
    claims: Set<number>;
    ready: boolean;
  }

  interface Ch2Model {
    pending: boolean;
    stored: boolean;
  }

  const ch1 = new Map<string, Ch1Model>(R_KEYS.map(k => [k, { handle: null, claims: new Set<number>(), ready: false }]));
  const ch2 = new Map<string, Ch2Model>(L_KEYS.map(k => [k, { pending: false, stored: false }]));

  let seed = 20260726;

  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;

    return seed / 0x7fffffff;
  };

  const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

  const pickClaimedPair = (): { key: string; scopeIdx: number } | null => {
    const candidates: Array<{ key: string; scopeIdx: number }> = [];

    for (const [key, model] of ch1) {
      for (const scopeIdx of model.claims) {
        candidates.push({ key, scopeIdx });
      }
    }

    return candidates.length === 0 ? null : candidates[Math.floor(random() * candidates.length)]!;
  };

  const pickPendingKey = (pool: readonly string[]): string | null => {
    const candidates = pool.filter(k => pending.has(k));

    return candidates.length === 0 ? null : candidates[Math.floor(random() * candidates.length)]!;
  };

  for (let step = 0; step < 200; step++) {
    const action = Math.floor(random() * 7);

    switch (action) {
      case 0: {
        // Claim a fresh-or-existing "r" key under a random scope.
        const key = R_KEYS[Math.floor(random() * R_KEYS.length)]!;
        const scopeIdx = Math.floor(random() * SCOPES.length);
        const model = ch1.get(key)!;

        if (model.handle === null) {
          // A freshly-minted catalog-style leaf is idle until adopted - exercise
          // that state explicitly before it ever gets claimed.
          const leaf = createLeaf(stubAdapter, 'stub', key) as StubHandle;
          expect(leaf.loadState).toBe('idle');
          model.handle = leaf;
        }

        loader._adopt(model.handle, SCOPES[scopeIdx]!);
        model.claims.add(scopeIdx);
        break;
      }

      case 1: {
        // Release one currently-held (key, scope) claim.
        const pick = pickClaimedPair();

        if (pick !== null) {
          const model = ch1.get(pick.key)!;
          const wasReady = model.ready;

          loader._release(loader['_canonicalize'](StubHandle, pick.key).key, SCOPES[pick.scopeIdx]!);
          model.claims.delete(pick.scopeIdx);

          if (model.claims.size === 0 && wasReady) {
            // Last claim released on a resident payload -> immediate eviction,
            // identity kept, re-armed to 'loading' for a later heal.
            model.ready = false;
            expect(model.handle!.loadState).toBe('loading');
          }
        }

        break;
      }

      case 2: {
        // Settle a pending "r" fetch successfully.
        const key = pickPendingKey(R_KEYS);

        if (key !== null) {
          const model = ch1.get(key)!;
          const entry = pending.get(key)!;
          pending.delete(key);
          const donor = new StubHandle();
          donor.payload = `value:${key}:${step}`;

          entry.resolve(donor);
          await flush();

          if (entry.signal?.aborted) {
            model.ready = false;
            expect(model.handle!.loadState).toBe(model.claims.size > 0 ? 'loading' : 'failed');
            expect(model.handle!.payload).toBeNull();
          } else {
            expect(model.claims.size).toBeGreaterThan(0);
            model.ready = true;
            expect(model.handle!.loadState).toBe('ready');
            expect(model.handle!.payload).toBe(donor.payload);
          }
        }

        break;
      }

      case 3: {
        // Settle a pending "r" fetch as a failure.
        const key = pickPendingKey(R_KEYS);

        if (key !== null) {
          const model = ch1.get(key)!;
          const entry = pending.get(key)!;
          pending.delete(key);

          entry.reject(new Error(`boom:${key}:${step}`));
          await flush();

          model.ready = false;
          expect(model.handle!.loadState).toBe(entry.signal?.aborted && model.claims.size > 0 ? 'loading' : 'failed');
        }

        break;
      }

      case 4: {
        // load() an "l" key - must dedup against an already-stored or
        // already-in-flight fetch, regardless of how many times it's called.
        const key = L_KEYS[Math.floor(random() * L_KEYS.length)]!;
        const model = ch2.get(key)!;
        const expectNewFetch = !model.pending && !model.stored;
        const before = fetchCount;

        void loader.load(stubAsset(key)).catch(() => {
          /* settled explicitly via `pending`; swallow here to avoid an unhandled rejection */
        });

        expect(fetchCount - before).toBe(expectNewFetch ? 1 : 0);

        if (expectNewFetch) {
          model.pending = true;
        }

        break;
      }

      case 5: {
        // Settle a pending "l" fetch successfully - must land in the store.
        const key = pickPendingKey(L_KEYS);

        if (key !== null) {
          const model = ch2.get(key)!;
          const entry = pending.get(key)!;
          pending.delete(key);

          entry.resolve(new StubHandle());
          await flush();

          model.pending = false;
          model.stored = true;
        }

        break;
      }

      case 6: {
        // Settle a pending "l" fetch as a failure - must heal on the next load().
        const key = pickPendingKey(L_KEYS);

        if (key !== null) {
          const model = ch2.get(key)!;
          const entry = pending.get(key)!;
          pending.delete(key);

          entry.reject(new Error(`boom:${key}:${step}`));
          await flush();

          model.pending = false; // stored stays false — the next load() (case 4) must re-fetch
        }

        break;
      }

      default:
        break;
    }

    // Invariants that must hold after EVERY step, regardless of the random
    // history that led here.
    for (const key of R_KEYS) {
      const model = ch1.get(key)!;

      if (model.handle !== null) {
        const stored = loader._peekResource(StubHandle, key);
        expect(stored !== null).toBe(model.ready); // claimed while resident <=> resident; never evicted while held
      }
    }

    for (const key of L_KEYS) {
      const model = ch2.get(key)!;
      const stored = loader._peekResource(StubHandle, key);
      expect(stored !== null).toBe(model.stored);
    }
  }
});
