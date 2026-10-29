import { IndexedDbKeyValueStore } from '#assets/storage/IndexedDbKeyValueStore';

const stores: IndexedDbKeyValueStore[] = [];
const names: string[] = [];

const uniqueName = (): string => {
  const name = `exojs-kv-schema-${crypto.randomUUID()}`;
  names.push(name);

  return name;
};

const createStore = (name: string, storeName: string, version: number): IndexedDbKeyValueStore => {
  const store = new IndexedDbKeyValueStore({ name, storeName, version });
  stores.push(store);

  return store;
};

const schema = async (name: string): Promise<{ version: number; names: string[] }> => {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Database open failed.'));
  });
  const result = { version: database.version, names: [...database.objectStoreNames] };
  database.close();

  return result;
};

afterEach(async () => {
  for (const store of stores.splice(0)) {
    store.destroy();
  }

  for (const name of names.splice(0)) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Database removal failed.'));
      request.onblocked = () => reject(new Error('Owned test database removal was blocked.'));
    });
  }
});

describe('IndexedDbKeyValueStore schema ownership in a real browser', () => {
  test('adding a store preserves a sibling save game across version upgrade', async () => {
    const name = uniqueName();
    const first = createStore(name, 'saves', 1);
    await first.set('autosave', { level: 7 });
    first.destroy();
    const settings = createStore(name, 'settings', 2);
    await settings.set('volume', 0.5);
    settings.destroy();
    expect(await schema(name)).toEqual({ version: 2, names: ['saves', 'settings'] });
    const reopened = createStore(name, 'saves', 2);
    await expect(reopened.get('autosave')).resolves.toEqual({ level: 7 });
  });

  test('a rejected explicit migration rolls back version, schema and save data', async () => {
    const name = uniqueName();
    const first = createStore(name, 'saves', 1);
    await first.set('autosave', { level: 7 });
    first.destroy();
    const rejected = new IndexedDbKeyValueStore({
      name,
      storeName: 'settings',
      version: 2,
      migrations: {
        2: database => {
          database.deleteObjectStore('saves');
          database.createObjectStore('settings', { keyPath: 'name' });

          return false;
        },
      },
    });
    stores.push(rejected);
    await expect(rejected.set('volume', 0.5)).rejects.toThrow();
    rejected.destroy();
    expect(await schema(name)).toEqual({ version: 1, names: ['saves'] });
    const reopened = createStore(name, 'saves', 1);
    await expect(reopened.get('autosave')).resolves.toEqual({ level: 7 });
  });
});
