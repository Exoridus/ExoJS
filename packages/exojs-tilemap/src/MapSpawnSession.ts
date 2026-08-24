import type { Destroyable } from '@codexo/exojs';

/**
 * The objects one spawn produced, and their shared lifetime.
 *
 * A session is handed out by
 * {@link import('./MapObjectSpawner').MapObjectSpawner.spawn} and owns every
 * result in it. Destroying the session destroys them all; nothing else has to
 * be tracked, and nothing scans the scene to find them again.
 *
 * A session is not reusable - destroy it and spawn again.
 *
 * @typeParam Result - what the factories produced.
 */
export class MapSpawnSession<Result extends Destroyable> implements Destroyable {

  /**
   * The spawned objects in spawn order: object-layer order, then object order
   * within each layer. Objects whose factory returned `null` are not in here.
   */
  public readonly objects: readonly Result[];

  private readonly _byId: ReadonlyMap<string, Result>;
  private _destroyed = false;

  /**
   * Sessions are produced by
   * {@link import('./MapObjectSpawner').MapObjectSpawner.spawn}, not
   * constructed directly.
   * @internal
   */
  public constructor(entries: ReadonlyArray<readonly [id: string, result: Result]>) {
    const objects: Result[] = [];
    const byId = new Map<string, Result>();

    for (const [id, result] of entries) {
      objects.push(result);
      byId.set(id, result);
    }

    this.objects = Object.freeze(objects);
    this._byId = byId;
  }

  /** Whether {@link destroy} has run. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * The object spawned from the source object with this
   * {@link import('./MapObject').MapObjectDescriptor.id}, or `undefined` when
   * no object with that id spawned anything. Constant time.
   *
   * The ids are the source-stable ones, which is what makes this the hook for
   * savegame restoration: persist the id, look the runtime object back up.
   */
  public get(sourceId: string): Result | undefined {
    return this._byId.get(sourceId);
  }

  /** Whether {@link get} would find an object for `sourceId`. */
  public has(sourceId: string): boolean {
    return this._byId.has(sourceId);
  }

  /**
   * Destroy every spawned object, in reverse spawn order. Idempotent;
   * {@link objects} still lists what the session held.
   *
   * Reverse order is the contract, not an implementation detail: an object
   * spawned later may have attached itself to an earlier one (a turret to its
   * platform, a light to its lamp), and tearing down the dependent first is
   * the order that never observes a half-destroyed owner.
   */
  public destroy(): void {
    if (this._destroyed) return;

    this._destroyed = true;

    for (let i = this.objects.length - 1; i >= 0; i--) {
      const object = this.objects[i];
      if (object !== undefined) object.destroy();
    }
  }
}
