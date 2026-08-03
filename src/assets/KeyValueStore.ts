/**
 * Async key/value store for application data — game saves, settings, profiles,
 * cached payloads. A single, uniform surface so calling code does not care
 * whether the backing store is synchronous or asynchronous.
 *
 * The backend is the axis you choose by capability, not a flag:
 * - {@link WebStorageStore} — `localStorage`/`sessionStorage`: small, synchronous,
 *   JSON-only (no Blobs/ArrayBuffers). The moral successor of the old `JsonStore`.
 * - {@link IndexedDbKeyValueStore} — IndexedDB: large, structured-clone, so Blobs,
 *   `ArrayBuffer`s and nested objects round-trip without JSON.
 * - {@link MemoryStore} — in-memory: ephemeral, holds references directly. For
 *   tests and throwaway data.
 *
 * Pair with {@link Scene.serialize} / {@link Scene.deserialize} for a save
 * system: `store.set(slot, scene.serialize())` to save, `scene.deserialize(await
 * store.get(slot))` to restore. Slot naming, profiles and autosave policy are
 * the game's concern, not the engine's.
 */
export interface KeyValueStore {
  /** Read the value at `key`, or `null` when absent. */
  get<T>(key: string): Promise<T | null>;
  /** Write `value` at `key`, replacing any existing entry. */
  set(key: string, value: unknown): Promise<void>;
  /** Whether an entry exists at `key`. */
  has(key: string): Promise<boolean>;
  /** Remove the entry at `key`. Resolves `true` if one existed and was removed. */
  delete(key: string): Promise<boolean>;
  /** Remove every entry owned by this store. Resolves `true` on success. */
  clear(): Promise<boolean>;
}
