const idbStorage = new Map<string, unknown>();

// IndexedDbStore mock: a single namespaced Map standing in for the database.
// It holds values *by reference* (no structured clone) — enough to prove the
// KV store passes values through without a JSON layer; the real backend deep-
// clones via structured clone.
vi.mock('#resources/IndexedDbStore', () => {
  class IndexedDbStoreMock {
    public load(storageName: string, key: string): Promise<unknown | null> {
      const recordKey = `${storageName}:${key}`;

      return Promise.resolve(idbStorage.has(recordKey) ? idbStorage.get(recordKey)! : null);
    }

    public save(storageName: string, key: string, data: unknown): Promise<void> {
      idbStorage.set(`${storageName}:${key}`, data);

      return Promise.resolve();
    }

    public delete(storageName: string, key: string): Promise<boolean> {
      return Promise.resolve(idbStorage.delete(`${storageName}:${key}`));
    }

    public clear(storageName: string): Promise<boolean> {
      for (const recordKey of [...idbStorage.keys()]) {
        if (recordKey.startsWith(`${storageName}:`)) {
          idbStorage.delete(recordKey);
        }
      }

      return Promise.resolve(true);
    }

    public destroy(): void {}
  }

  return { IndexedDbStore: IndexedDbStoreMock };
});

import { IndexedDbKeyValueStore } from '#resources/IndexedDbKeyValueStore';
import type { KeyValueStore } from '#resources/KeyValueStore';
import { MemoryStore } from '#resources/MemoryStore';
import { WebStorageStore } from '#resources/WebStorageStore';

/** Minimal synchronous in-memory `Storage` stand-in for WebStorageStore tests. */
function createWebStorage(): Storage {
  const map = new Map<string, string>();

  return {
    get length(): number {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
  } as Storage;
}

const backends: ReadonlyArray<{ name: string; create: () => KeyValueStore }> = [
  { name: 'MemoryStore', create: () => new MemoryStore() },
  { name: 'WebStorageStore', create: () => new WebStorageStore(createWebStorage()) },
  { name: 'IndexedDbKeyValueStore', create: () => new IndexedDbKeyValueStore('test-kv-store') },
];

describe.each(backends)('KeyValueStore contract — $name', ({ create }) => {
  afterEach(() => {
    idbStorage.clear();
  });

  test('get resolves null for a missing key', async () => {
    const store = create();

    await expect(store.get('absent')).resolves.toBeNull();
  });

  test('set then get round-trips a value', async () => {
    const store = create();
    const value = { profile: 'pilot', score: 1280, flags: { hardcore: false } };

    await store.set('slot-1', value);

    await expect(store.get('slot-1')).resolves.toEqual(value);
  });

  test('set overwrites an existing entry', async () => {
    const store = create();

    await store.set('slot-1', { score: 1 });
    await store.set('slot-1', { score: 2 });

    await expect(store.get('slot-1')).resolves.toEqual({ score: 2 });
  });

  test('has reflects whether a key is present', async () => {
    const store = create();

    await expect(store.has('slot-1')).resolves.toBe(false);
    await store.set('slot-1', { score: 1 });
    await expect(store.has('slot-1')).resolves.toBe(true);
  });

  test('delete removes an existing entry and resolves true', async () => {
    const store = create();

    await store.set('slot-1', { score: 1 });

    await expect(store.delete('slot-1')).resolves.toBe(true);
    await expect(store.has('slot-1')).resolves.toBe(false);
    await expect(store.get('slot-1')).resolves.toBeNull();
  });

  test('clear empties the store', async () => {
    const store = create();

    await store.set('slot-1', { score: 1 });
    await store.set('slot-2', { score: 2 });

    await expect(store.clear()).resolves.toBe(true);
    await expect(store.has('slot-1')).resolves.toBe(false);
    await expect(store.has('slot-2')).resolves.toBe(false);
  });

  test('independent keys do not interfere', async () => {
    const store = create();

    await store.set('a', { v: 1 });
    await store.set('b', { v: 2 });

    await expect(store.get('a')).resolves.toEqual({ v: 1 });
    await expect(store.get('b')).resolves.toEqual({ v: 2 });
  });
});

describe('MemoryStore', () => {
  test('holds values by reference (no clone)', async () => {
    const store = new MemoryStore();
    const value = { nested: { count: 1 } };

    await store.set('k', value);

    await expect(store.get('k')).resolves.toBe(value);
  });

  test('accepts non-JSON-serializable values', async () => {
    const store = new MemoryStore();
    const value = { fn: () => 1, map: new Map([['x', 1]]) };

    await store.set('k', value);

    await expect(store.get('k')).resolves.toBe(value);
  });

  test('delete resolves false for a missing key', async () => {
    const store = new MemoryStore();

    await expect(store.delete('absent')).resolves.toBe(false);
  });
});

describe('WebStorageStore', () => {
  test('serializes through JSON, so reads are deep copies', async () => {
    const store = new WebStorageStore(createWebStorage());
    const value = { nested: { count: 1 } };

    await store.set('k', value);
    const read = await store.get<typeof value>('k');

    expect(read).toEqual(value);
    expect(read).not.toBe(value);
  });

  test('rejects a non-JSON-serializable value on write', async () => {
    const store = new WebStorageStore(createWebStorage());
    const circular: { self?: unknown } = {};

    circular.self = circular;

    await expect(store.set('k', circular)).rejects.toThrow('WebStorageStore.set() failed: value is not JSON-serializable.');
  });

  test('rejects on read when the stored value is not valid JSON', async () => {
    const storage = createWebStorage();

    storage.setItem('k', '{invalid-json');

    const store = new WebStorageStore(storage);

    await expect(store.get('k')).rejects.toThrow('WebStorageStore.get() failed: stored value for key "k" is not valid JSON.');
  });

  test('delete resolves false for a missing key', async () => {
    const store = new WebStorageStore(createWebStorage());

    await expect(store.delete('absent')).resolves.toBe(false);
  });

  test('namespaces keys by prefix so stores sharing one Storage do not collide', async () => {
    const storage = createWebStorage();
    const a = new WebStorageStore(storage, { prefix: 'a:' });
    const b = new WebStorageStore(storage, { prefix: 'b:' });

    await a.set('slot', { who: 'a' });
    await b.set('slot', { who: 'b' });

    await expect(a.get('slot')).resolves.toEqual({ who: 'a' });
    await expect(b.get('slot')).resolves.toEqual({ who: 'b' });
  });

  test('clear on a prefixed store removes only its own keys', async () => {
    const storage = createWebStorage();
    const a = new WebStorageStore(storage, { prefix: 'a:' });
    const b = new WebStorageStore(storage, { prefix: 'b:' });

    await a.set('slot', { who: 'a' });
    await b.set('slot', { who: 'b' });

    await a.clear();

    await expect(a.has('slot')).resolves.toBe(false);
    await expect(b.has('slot')).resolves.toBe(true);
  });
});

describe('IndexedDbKeyValueStore', () => {
  afterEach(() => {
    idbStorage.clear();
  });

  test('passes an ArrayBuffer through without JSON serialization', async () => {
    const store = new IndexedDbKeyValueStore('test-kv-store');
    const bytes = new Uint8Array([1, 2, 3, 250, 255]);

    await store.set('buffer', bytes.buffer);
    const read = await store.get<ArrayBuffer>('buffer');

    expect(read).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(read!)).toEqual(bytes);
  });

  test('round-trips a nested object carrying binary data', async () => {
    const store = new IndexedDbKeyValueStore('test-kv-store');
    const payload = { level: 3, pixels: new Uint8Array([9, 8, 7]) };

    await store.set('save', payload);
    const read = await store.get<typeof payload>('save');

    expect(read).not.toBeNull();
    expect(read!.level).toBe(3);
    expect(read!.pixels).toEqual(new Uint8Array([9, 8, 7]));
  });
});
