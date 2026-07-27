import type { LoadStateValue } from '#core/LoadState';
import { LoadState } from '#core/LoadState';
import type { AssetHandler } from '#extensions/Extension';
import { Asset } from '#resources/Asset';
import type { AssetDefinitions } from '#resources/AssetDefinitions';
import { createLeaf, registerAssetKind } from '#resources/assetKindRegistry';
import { Loader } from '#resources/Loader';
import type { SeamlessAdapter } from '#resources/seamless';

/**
 * Hardening coverage for the readiness (`idle`/`loading`/`ready`/`failed`) x
 * residency (`claimed`/`unclaimed`) state model, exercised through the
 * consolidated `Asset.type(...)` / `get()` / `load()` surface Task 4
 * introduced. `AssetResidency`'s own contract is untouched by this task —
 * this test documents existing behavior, it does not extend it.
 *
 * Methodology mirrors the SG-006 seeded-random-mutation pattern used for
 * scene-graph safety (`test/rendering/container.test.ts`, the "random
 * add/remove/setChildIndex sequences" test): a deterministic seeded PRNG
 * drives a long sequence of random operations against a live `Loader`, and
 * the invariants that must hold regardless of history are re-checked after
 * EVERY step — not just at a handful of hand-picked scenarios. A fixed
 * 3-example test (this file's original draft) cannot reach the interleavings
 * this walk does: claim-then-release-then-reclaim-before-settle, releasing
 * mid-flight, failing then abandoning, settling out of issue order, etc.
 *
 * A synthetic `stub` asset type (not a real `AssetDefinitions` member) is
 * used instead of a built-in type so the fetch itself is fully
 * test-controlled (no network/audio/image decoding to mock) while still
 * exercising the REAL `AssetTypeRegistry`/`AssetResidency`/`assetKindRegistry`
 * machinery — the same code every built-in type runs through.
 *
 * Two disjoint key namespaces drive two complementary sub-machines per step,
 * chosen at random by the same PRNG:
 *
 * - "r*" keys — claim/residency, via `_adopt`/`_release` (the `get()`
 *   surface's claim path). Exercises: idle -> loading -> ready/failed,
 *   claim-count > 0 never evicts, refcount-0 evicts a resident payload,
 *   free-on-arrival when the last claim releases mid-fetch.
 * - "l*" keys — store-before-fetch dedup and failure healing, via `load()`
 *   (`AssetResidency._loadSingleAsset`'s identity-based dedup). Exercises:
 *   an already-stored or already-in-flight key never triggers a second
 *   fetch; a failed key's next `load()` retries and can heal to stored.
 *
 * (The `get()`-adopt path does NOT itself retry a `'failed'` handle on
 * re-claim — only the bare-path `get(str)`/`get(Asset.type(value...))`
 * surfaces do, via `_getSeamless`/`_getRef`'s explicit failed-state check;
 * `_adopt`'s branches have no such check. This is a real, unchanged
 * characteristic of `AssetResidency`, not a gap this task introduces or
 * fixes — the "r*" channel's model deliberately does not assert a retry
 * that the implementation does not perform, and the "l*" channel is where
 * failure-healing is actually exercised.)
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

// `registerAssetKind` is idempotent for a matching entry, so re-running this
// module (or another file registering the same synthetic kind) is safe.
registerAssetKind('stub' as keyof AssetDefinitions, { isValue: false, adapter: stubAdapter });

test('readiness x residency: seeded random claim/release/fetch/fail sequence keeps every invariant', async () => {
  const R_KEYS = ['r0', 'r1', 'r2'];
  const L_KEYS = ['l0', 'l1', 'l2'];
  const SCOPES = [Symbol('scope0'), Symbol('scope1'), Symbol('scope2'), Symbol('scope3')];

  const loader = new Loader();
  let fetchCount = 0;
  // Handler invocations are synchronous up to their own Promise executor (verified
  // against AssetDecoder._dispatchFetch/_fetchWithHandler), so `pending` always
  // reflects the current in-flight set immediately after a triggering call —
  // no `await` needed between issuing a fetch and observing it here.
  const pending = new Map<string, { resolve: (h: StubHandle) => void; reject: (e: Error) => void }>();

  const handler: AssetHandler<StubHandle> = {
    load: request =>
      new Promise<StubHandle>((resolve, reject) => {
        fetchCount++;
        pending.set(request.source, { resolve, reject });
      }),
  };

  loader.bindAsset<StubHandle>({ ctor: StubHandle, typeNames: ['stub'], seamless: stubAdapter }, handler);

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

  function pickClaimedPair(): { key: string; scopeIdx: number } | null {
    const candidates: Array<{ key: string; scopeIdx: number }> = [];
    for (const [key, model] of ch1) {
      for (const scopeIdx of model.claims) candidates.push({ key, scopeIdx });
    }
    return candidates.length === 0 ? null : candidates[Math.floor(random() * candidates.length)]!;
  }

  function pickPendingKey(pool: readonly string[]): string | null {
    const candidates = pool.filter(k => pending.has(k));
    return candidates.length === 0 ? null : candidates[Math.floor(random() * candidates.length)]!;
  }

  for (let step = 0; step < 200; step++) {
    const action = Math.floor(random() * 7);

    switch (action) {
      case 0: {
        // Claim a fresh-or-existing "r" key under a random scope.
        const key = R_KEYS[Math.floor(random() * R_KEYS.length)]!;
        const scopeIdx = Math.floor(random() * SCOPES.length);
        const model = ch1.get(key)!;

        if (model.handle === null) {
          // A freshly-minted catalog-style leaf is idle until adopted — exercise
          // that state explicitly before it ever gets claimed.
          const leaf = createLeaf('stub' as keyof AssetDefinitions, key) as StubHandle;
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

          loader._release(loader['_typeRegistry']['_key'](StubHandle, pick.key), SCOPES[pick.scopeIdx]!);
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
          // Claim state at the moment of arrival — NOT at claim time — is what
          // decides free-on-arrival (§4.7): a release can land between issuing
          // and settling this exact fetch.
          const claimedAtArrival = model.claims.size > 0;
          const donor = new StubHandle();
          donor.payload = `value:${key}:${step}`;

          entry.resolve(donor);
          await flush();

          if (claimedAtArrival) {
            model.ready = true;
            expect(model.handle!.loadState).toBe('ready');
            expect(model.handle!.payload).toBe(donor.payload);
          } else {
            model.ready = false;
            expect(model.handle!.loadState).toBe('loading'); // freed on arrival
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
          expect(model.handle!.loadState).toBe('failed');
        }
        break;
      }

      case 4: {
        // load() an "l" key — must dedup against an already-stored or
        // already-in-flight fetch, regardless of how many times it's called.
        const key = L_KEYS[Math.floor(random() * L_KEYS.length)]!;
        const model = ch2.get(key)!;
        const expectNewFetch = !model.pending && !model.stored;
        const before = fetchCount;

        void loader.load(new Asset({ type: 'stub', source: key })).catch(() => {
          /* settled explicitly via `pending`; swallow here to avoid an unhandled rejection */
        });

        expect(fetchCount - before).toBe(expectNewFetch ? 1 : 0);
        if (expectNewFetch) model.pending = true;
        break;
      }

      case 5: {
        // Settle a pending "l" fetch successfully — must land in the store.
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
        // Settle a pending "l" fetch as a failure — must heal on the next load().
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
