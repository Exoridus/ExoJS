import type { Scene } from '#core/Scene';
import { JsonStore } from '#resources/JsonStore';

import type { SerializedScene } from './types';

/**
 * Thin convenience over {@link JsonStore} for persisting and restoring scene
 * layouts by named slot. Serializes the **structural state** of a scene (see
 * {@link Scene.serialize}); pair it with your own game-state persistence for a
 * complete save system.
 *
 * ```ts
 * const saves = new SaveManager();
 * await saves.save('slot-1', scene);
 * // ... later, with the same assets pre-loaded ...
 * await saves.load('slot-1', scene);
 * ```
 */
export class SaveManager {
  private readonly _store: JsonStore;

  /** Wrap an existing {@link JsonStore}, or create a default one. */
  public constructor(store: JsonStore = new JsonStore()) {
    this._store = store;
  }

  /** The underlying {@link JsonStore}, for direct access or custom keys. */
  public get store(): JsonStore {
    return this._store;
  }

  /** Serialize `scene` and persist it under `slot`. */
  public async save(slot: string, scene: Scene): Promise<void> {
    await this._store.set(slot, scene.serialize());
  }

  /**
   * Restore the scene saved under `slot` into `scene`, replacing its root
   * subtree. Returns `false` if no save exists for that slot. Referenced assets
   * must be pre-loaded into the scene's loader first.
   */
  public async load(slot: string, scene: Scene): Promise<boolean> {
    const data = await this._store.get<SerializedScene>(slot);

    if (data === null) {
      return false;
    }

    scene.deserialize(data);

    return true;
  }

  /** Returns `true` if a save exists under `slot`. */
  public has(slot: string): Promise<boolean> {
    return this._store.has(slot);
  }

  /** Delete the save under `slot`. Returns `true` if a record was removed. */
  public delete(slot: string): Promise<boolean> {
    return this._store.delete(slot);
  }
}
