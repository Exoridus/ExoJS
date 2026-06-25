import type { KeyValueStore } from './KeyValueStore';

/**
 * In-memory {@link KeyValueStore} backed by a `Map`. Holds values **by
 * reference** — no cloning, no serialization — so it accepts any value but does
 * not persist across sessions and does not isolate the caller from later
 * mutation of a stored object. Ideal for tests and ephemeral data, and as a
 * drop-in store when persistence is not needed.
 */
export class MemoryStore implements KeyValueStore {
  private readonly _map = new Map<string, unknown>();

  public get<T>(key: string): Promise<T | null> {
    return Promise.resolve(this._map.has(key) ? (this._map.get(key) as T) : null);
  }

  public set(key: string, value: unknown): Promise<void> {
    this._map.set(key, value);

    return Promise.resolve();
  }

  public has(key: string): Promise<boolean> {
    return Promise.resolve(this._map.has(key));
  }

  public delete(key: string): Promise<boolean> {
    return Promise.resolve(this._map.delete(key));
  }

  public clear(): Promise<boolean> {
    this._map.clear();

    return Promise.resolve(true);
  }
}
