import type { System } from './System';
import type { Time } from './Time';
import type { Destroyable } from './types';

/**
 * Ordered registry of per-frame {@link System}s, shared by {@link Scene} (as
 * `scene.systems`) and `Application` (as `app.systems`). Systems tick once per
 * frame in ascending `order` (ties keep insertion order) and are destroyed in
 * reverse registration order when the registry is destroyed.
 *
 * Structural mutations made from inside a system's `update()` (a system adding
 * or removing another, or itself) are deferred until the tick completes, so the
 * iteration is never invalidated mid-frame.
 */
export class SystemRegistry implements Destroyable {
  private readonly _systems: System[] = [];
  private readonly _set = new Set<System>();
  private readonly _pending: Array<{ add: boolean; system: System }> = [];
  private _ticking = false;
  private _sorted = true;

  /** Add `system`; returns it for fluent capture. Ticks from the next frame. */
  public add<T extends System>(system: T): T {
    if (this._ticking) {
      this._pending.push({ add: true, system });
    } else {
      this._insert(system);
    }

    return system;
  }

  /** Remove `system` without destroying it. Returns `true` if it was registered. */
  public remove(system: System): boolean {
    if (this._ticking) {
      if (!this._set.has(system)) {
        return false;
      }

      this._pending.push({ add: false, system });

      return true;
    }

    return this._delete(system);
  }

  /** Whether `system` is registered. */
  public has(system: System): boolean {
    return this._set.has(system);
  }

  /** Number of registered systems. */
  public get size(): number {
    return this._set.size;
  }

  /** @internal — ticked by the owner (SceneManager / Application) each frame. */
  public _tick(delta: Time): void {
    if (this._systems.length === 0) {
      return;
    }

    if (!this._sorted) {
      this._systems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      this._sorted = true;
    }

    this._ticking = true;

    for (let index = 0; index < this._systems.length; index++) {
      this._systems[index].update(delta);
    }

    this._ticking = false;
    this._drainPending();
  }

  public destroy(): void {
    for (let index = this._systems.length - 1; index >= 0; index--) {
      this._systems[index].destroy();
    }

    this._systems.length = 0;
    this._set.clear();
    this._pending.length = 0;
  }

  private _insert(system: System): void {
    if (!this._set.has(system)) {
      this._set.add(system);
      this._systems.push(system);
      this._sorted = false;
    }
  }

  private _delete(system: System): boolean {
    if (!this._set.delete(system)) {
      return false;
    }

    const index = this._systems.indexOf(system);

    if (index !== -1) {
      this._systems.splice(index, 1);
    }

    return true;
  }

  private _drainPending(): void {
    if (this._pending.length === 0) {
      return;
    }

    for (const { add, system } of this._pending) {
      if (add) {
        this._insert(system);
      } else {
        this._delete(system);
      }
    }

    this._pending.length = 0;
  }
}
