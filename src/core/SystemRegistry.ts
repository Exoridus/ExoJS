import type { RenderingContext } from '#rendering/RenderingContext';

import { Signal } from './Signal';
import type { System } from './System';
import type { Time } from './Time';
import type { Destroyable } from './types';

/** Options accepted by {@link SystemRegistry.add}. */
export interface SystemRegistrationOptions {
  /** Overrides {@link System.order} for this registration only. */
  readonly order?: number;
}

interface SystemRegistration {
  readonly system: System;
  /** Monotonic insertion counter, assigned when the system structurally enters the registry. Tie-breaks `order` and drives reverse-order destruction. */
  readonly sequence: number;
  readonly order: number;
  active: boolean;
}

interface PendingAdd {
  readonly add: true;
  readonly system: System;
  readonly options: SystemRegistrationOptions | undefined;
}

interface PendingRemove {
  readonly add: false;
  readonly registration: SystemRegistration;
}

type PendingMutation = PendingAdd | PendingRemove;

// A type predicate (rather than a truthy/literal check on `mutation.add`) so this
// narrows `PendingMutation` correctly under every tsconfig this file is compiled
// under, including tsconfig.guides.json's `strict: false` — plain discriminant
// narrowing on a boolean-literal tag is unreliable there.
const isPendingAdd = (mutation: PendingMutation): mutation is PendingAdd => mutation.add;

const sortRegistrations = (list: SystemRegistration[]): void => {
  list.sort((a, b) => a.order - b.order || a.sequence - b.sequence);
};

const removeRegistration = (list: SystemRegistration[], registration: SystemRegistration): void => {
  const index = list.indexOf(registration);

  if (index !== -1) {
    list.splice(index, 1);
  }
};

/**
 * Phase-dispatching registry of {@link System}s, shared by `Scene` (as
 * `scene.systems`) and `Application` (as `app.systems`). Each system
 * participates only in the scheduler phases it implements
 * (`fixedUpdate`/`update`/`draw`); within a phase, systems run in ascending
 * `order` (ties keep registration order) and are destroyed in reverse
 * registration order when the registry is destroyed.
 *
 * Structural mutations are frame-scoped (definition §9.6): a system added
 * during a frame — whether from outside or from another system's own
 * callback — does not participate in any phase until the *next* frame, in
 * any phase. Removing a system during a callback marks it inactive
 * immediately, so it is skipped by every later phase and every later fixed
 * step in the *same* frame; the structural delete and the single {@link
 * SystemRegistry.onRemove} dispatch are finalized at the frame boundary.
 * Outside a frame — before the first {@link SystemRegistry._beginFrame} or
 * after its matching {@link SystemRegistry._endFrame} — `add()`/`remove()`
 * apply immediately.
 */
export class SystemRegistry implements Destroyable {
  private readonly _registrations = new Map<System, SystemRegistration>();
  private readonly _fixedList: SystemRegistration[] = [];
  private readonly _updateList: SystemRegistration[] = [];
  private readonly _drawList: SystemRegistration[] = [];
  private readonly _pendingAdds = new Set<System>();
  private readonly _pending: PendingMutation[] = [];
  private _sequence = 0;
  private _activeCount = 0;
  private _frameActive = false;
  private _fixedDirty = false;
  private _updateDirty = false;
  private _drawDirty = false;

  /** Dispatched when a system structurally enters the registry (immediately, or at the frame boundary for a buffered add). */
  public readonly onAdd = new Signal<[system: System]>();
  /** Dispatched when a system structurally leaves the registry (immediately, or at the frame boundary for a buffered remove). */
  public readonly onRemove = new Signal<[system: System]>();

  /**
   * Register `system`, returning it unchanged for fluent capture
   * (`const world = app.systems.add(new PhysicsWorld())`). Adding the same
   * object twice is a no-op. See the class docs for buffering timing.
   */
  public add<T extends System>(system: T, options?: SystemRegistrationOptions): T {
    if (this._registrations.has(system) || this._pendingAdds.has(system)) {
      return system;
    }

    if (this._frameActive) {
      this._pendingAdds.add(system);
      this._pending.push({ add: true, system, options });
    } else {
      this._insert(system, options);
    }

    return system;
  }

  /**
   * Remove `system` without destroying it — never destroys. Returns `true`
   * if it was registered. See the class docs for the exact timing of
   * structural cleanup and {@link SystemRegistry.onRemove}.
   */
  public remove(system: System): boolean {
    if (this._pendingAdds.has(system)) {
      this._pendingAdds.delete(system);

      const index = this._pending.findIndex(mutation => isPendingAdd(mutation) && mutation.system === system);

      if (index !== -1) {
        this._pending.splice(index, 1);
      }

      return true;
    }

    const registration = this._registrations.get(system);

    if (registration === undefined || !registration.active) {
      return false;
    }

    registration.active = false;
    this._activeCount--;

    if (this._frameActive) {
      this._pending.push({ add: false, registration });
    } else {
      this._finalizeRemoval(registration);
    }

    return true;
  }

  /** Whether `system` is currently registered and eligible to run — `false` for a not-yet-eligible buffered add or an already-removed system. */
  public has(system: System): boolean {
    return this._registrations.get(system)?.active === true;
  }

  /** Number of systems currently registered and eligible to run. */
  public get size(): number {
    return this._activeCount;
  }

  /** @internal Opens this frame's mutation-buffering window. Call once before dispatching any phase. */
  public _beginFrame(): void {
    this._frameActive = true;
  }

  /** @internal Drains buffered mutations and closes this frame's mutation-buffering window. Call once after the last phase dispatch. */
  public _endFrame(): void {
    this._frameActive = false;

    if (this._pending.length === 0) {
      return;
    }

    for (const mutation of this._pending) {
      if (isPendingAdd(mutation)) {
        this._pendingAdds.delete(mutation.system);
        this._insert(mutation.system, mutation.options);
      } else {
        this._finalizeRemoval(mutation.registration);
      }
    }

    this._pending.length = 0;
  }

  /** @internal Dispatched once per fixed-timestep step, ahead of {@link SystemRegistry._update}. */
  public _fixedUpdate(step: Time): void {
    if (this._fixedList.length === 0) {
      return;
    }

    if (this._fixedDirty) {
      sortRegistrations(this._fixedList);
      this._fixedDirty = false;
    }

    for (const registration of this._fixedList) {
      if (registration.active) {
        registration.system.fixedUpdate!(step);
      }
    }
  }

  /** @internal Dispatched once per frame, after fixed steps and ahead of {@link SystemRegistry._draw}. */
  public _update(delta: Time): void {
    if (this._updateList.length === 0) {
      return;
    }

    if (this._updateDirty) {
      sortRegistrations(this._updateList);
      this._updateDirty = false;
    }

    for (const registration of this._updateList) {
      if (registration.active) {
        registration.system.update!(delta);
      }
    }
  }

  /** @internal Dispatched once per frame, after {@link SystemRegistry._update}. */
  public _draw(context: RenderingContext): void {
    if (this._drawList.length === 0) {
      return;
    }

    if (this._drawDirty) {
      sortRegistrations(this._drawList);
      this._drawDirty = false;
    }

    for (const registration of this._drawList) {
      if (registration.active) {
        registration.system.draw!(context);
      }
    }
  }

  /**
   * Destroy every remaining registered system exactly once, in reverse
   * registration order, then clear the registry. A system already removed
   * via {@link SystemRegistry.remove} — even if not yet structurally
   * finalized — is not destroyed: `remove()` never destroys.
   */
  public destroy(): void {
    const remaining = [...this._registrations.values()].filter(registration => registration.active).sort((a, b) => b.sequence - a.sequence);

    for (const registration of remaining) {
      registration.system.destroy?.();
    }

    this._registrations.clear();
    this._fixedList.length = 0;
    this._updateList.length = 0;
    this._drawList.length = 0;
    this._pendingAdds.clear();
    this._pending.length = 0;
    this._activeCount = 0;
    this.onAdd.destroy();
    this.onRemove.destroy();
  }

  private _insert(system: System, options?: SystemRegistrationOptions): void {
    const registration: SystemRegistration = {
      system,
      sequence: this._sequence++,
      order: options?.order ?? system.order ?? 0,
      active: true,
    };

    this._registrations.set(system, registration);
    this._activeCount++;

    if (system.fixedUpdate !== undefined) {
      this._fixedList.push(registration);
      this._fixedDirty = true;
    }

    if (system.update !== undefined) {
      this._updateList.push(registration);
      this._updateDirty = true;
    }

    if (system.draw !== undefined) {
      this._drawList.push(registration);
      this._drawDirty = true;
    }

    this.onAdd.dispatch(system);
  }

  private _finalizeRemoval(registration: SystemRegistration): void {
    this._registrations.delete(registration.system);
    removeRegistration(this._fixedList, registration);
    removeRegistration(this._updateList, registration);
    removeRegistration(this._drawList, registration);
    this.onRemove.dispatch(registration.system);
  }
}
