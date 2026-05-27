const storage = new Map<string, unknown>();

vi.mock('@/resources/IndexedDbStore', () => {
  class IndexedDbStoreMock {
    public async load(storageName: string, key: string): Promise<unknown | null> {
      const recordKey = `${storageName}:${key}`;

      return storage.has(recordKey) ? storage.get(recordKey)! : null;
    }

    public async save(storageName: string, key: string, data: unknown): Promise<void> {
      storage.set(`${storageName}:${key}`, data);
    }

    public async delete(storageName: string, key: string): Promise<boolean> {
      return storage.delete(`${storageName}:${key}`);
    }

    public async clear(storageName: string): Promise<boolean> {
      let removed = false;

      for (const key of [...storage.keys()]) {
        if (key.startsWith(`${storageName}:`)) {
          storage.delete(key);
          removed = true;
        }
      }

      return removed;
    }

    public destroy(): void {}
  }

  return { IndexedDbStore: IndexedDbStoreMock };
});

import { IndexedDbStore } from '@/resources/IndexedDbStore';
import { JsonStore } from '@/resources/JsonStore';

describe('JsonStore', () => {
  afterEach(() => {
    storage.clear();
    vi.restoreAllMocks();
  });

  test('set/get roundtrip stores JSON payload by key', async () => {
    const store = new JsonStore('test-json-store');
    const payload = {
      profile: 'pilot',
      score: 1280,
      flags: { hardcore: false },
    };

    await store.set('slot-1', payload);

    await expect(store.get('slot-1')).resolves.toEqual(payload);
  });

  test('delete removes an existing entry and get returns null afterwards', async () => {
    const store = new JsonStore('test-json-store');

    await store.set('slot-1', { score: 10 });

    await expect(store.delete('slot-1')).resolves.toBe(true);
    await expect(store.get('slot-1')).resolves.toBeNull();
  });

  test('has and clear reflect storage state', async () => {
    const store = new JsonStore('test-json-store');

    await store.set('slot-1', { score: 10 });
    await store.set('slot-2', { score: 20 });

    await expect(store.has('slot-1')).resolves.toBe(true);
    await expect(store.clear()).resolves.toBe(true);
    await expect(store.has('slot-1')).resolves.toBe(false);
    await expect(store.has('slot-2')).resolves.toBe(false);
  });

  test('set throws for non-JSON-serializable data', async () => {
    const store = new JsonStore('test-json-store');
    const circular: { self?: unknown } = {};

    circular.self = circular;

    await expect(store.set('slot-1', circular)).rejects.toThrow('JsonStore.set() failed: data is not JSON-serializable.');
  });

  test('get throws when underlying store payload is not a JSON string', async () => {
    const loadSpy = vi.spyOn(IndexedDbStore.prototype, 'load').mockResolvedValueOnce({ invalid: true });
    const store = new JsonStore('test-json-store');

    await expect(store.get('slot-1')).rejects.toThrow('JsonStore.get() failed: stored payload is not a JSON string.');
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  test('get throws when stored JSON is invalid', async () => {
    vi.spyOn(IndexedDbStore.prototype, 'load').mockResolvedValueOnce('{invalid-json');
    const store = new JsonStore('test-json-store');

    await expect(store.get('slot-1')).rejects.toThrow('JsonStore.get() failed: invalid JSON payload for key "slot-1".');
  });
});
