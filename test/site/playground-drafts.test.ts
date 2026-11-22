// @vitest-environment node
import { expect, it } from 'vitest';

import { createDraftStore, playgroundDraftKey } from '../../site/src/lib/playground-drafts';

const fixture = () => {
  let serialized: string | null = null;
  const storage = {
    getItem: () => serialized,
    setItem: (_key: string, value: string) => {
      serialized = value;
    },
  };

  return { storage, read: () => serialized };
};

const draft = { entry: 'edited entry', helpers: { 'shared/runtime.ts': { source: 'edited helper', original: 'original helper' } } };

it('isolates current drafts by the deployed engine version and source revision', () => {
  const { storage } = fixture();
  const store = createDraftStore(() => storage);
  const build = { packageVersion: '0.19.1', sourceSha: 'revision-a' };
  const key = playgroundDraftKey('current', 'example.ts', build);
  store.save(key, draft);

  expect(createDraftStore(() => storage).load(playgroundDraftKey('current', 'example.ts', build))).toEqual(draft);
  expect(store.load(playgroundDraftKey('current', 'example.ts', { ...build, sourceSha: 'revision-b' }))).toBeNull();
  expect(store.load(playgroundDraftKey('current', 'example.ts', { ...build, packageVersion: '0.20.0' }))).toBeNull();
  expect(playgroundDraftKey('0.19.0', 'example.ts', build)).toBe(
    playgroundDraftKey('0.19.0', 'example.ts', { packageVersion: '0.20.0', sourceSha: 'revision-b' }),
  );
});

it('restores the entry and edited helpers across a new store instance', () => {
  const { storage } = fixture();
  const store = createDraftStore(() => storage);
  expect(store.save('current/example.ts', draft).persistence).toBe('session');
  expect(createDraftStore(() => storage).load('current/example.ts')).toEqual(draft);
  expect(store.load('0.19.0/example.ts')).toBeNull();
});

it('keeps independent snapshots instead of retaining mutable caller objects', () => {
  const { storage } = fixture();
  const store = createDraftStore(() => storage);
  const edited = { entry: 'entry', helpers: {} };
  store.save('a', edited);
  edited.entry = 'later';
  expect(store.load('a')?.entry).toBe('entry');
});

it('retains drafts in memory and reports that reload recovery is unavailable when storage throws', () => {
  const store = createDraftStore(() => {
    throw new Error('storage denied');
  });
  expect(store.save('a', draft).persistence).toBe('memory');
  expect(store.load('a')).toEqual(draft);
});

it('removes reset drafts from storage so reload returns the original', () => {
  const { storage } = fixture();
  const store = createDraftStore(() => storage);
  store.save('a', draft);
  store.remove('a');
  expect(createDraftStore(() => storage).load('a')).toBeNull();
});

it('reports eviction when the bounded session fills up', () => {
  const { storage } = fixture();
  const store = createDraftStore(() => storage, { maxDrafts: 2 });
  store.save('a', draft);
  store.save('b', draft);
  expect(store.save('c', draft).evicted).toBe(1);
  expect(store.load('a')).toEqual(draft);
  expect(store.isPersisted('a')).toBe(false);
  expect(createDraftStore(() => storage).load('a')).toBeNull();
  expect(store.load('b')).toEqual(draft);
  expect(createDraftStore(() => storage).load('c')).toEqual(draft);
});

it('continues reporting reload risk when another draft is persisted or a reset cannot be stored', () => {
  const { storage } = fixture();
  let denied = false;
  const store = createDraftStore(
    () => ({
      getItem: storage.getItem,
      setItem: (key, value) => {
        if (denied) {
          throw new Error('quota');
        }

        storage.setItem(key, value);
      },
    }),
    { maxDrafts: 1 },
  );
  store.save('a', draft);
  expect(store.hasUnpersistedChanges()).toBe(false);
  store.save('b', draft);
  store.save('b', { entry: 'another edit', helpers: {} });
  expect(store.isPersisted('b')).toBe(true);
  expect(store.hasUnpersistedChanges()).toBe(true);
  store.remove('a');
  expect(store.hasUnpersistedChanges()).toBe(false);
  denied = true;
  store.remove('b');
  expect(store.hasUnpersistedChanges()).toBe(true);
});

it('retains an oversized edit in memory while preserving the previous durable snapshot', () => {
  const { storage } = fixture();
  const store = createDraftStore(() => storage, { maxChars: 200 });
  store.save('a', { entry: 'small', helpers: {} });
  expect(store.save('a', { entry: 'x'.repeat(500), helpers: {} }).persistence).toBe('memory');
  expect(store.load('a')?.entry).toBe('x'.repeat(500));
  expect(store.isPersisted('a')).toBe(false);
  expect(createDraftStore(() => storage).load('a')?.entry).toBe('small');
});

it('ignores corrupt or unsupported stored data', () => {
  const store = createDraftStore(() => ({ getItem: () => '{broken', setItem() {} }));
  expect(store.load('a')).toBeNull();
});
