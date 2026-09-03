import type { RenderingContext } from '#rendering/RenderingContext';

import { logger } from './Logger';
import { Signal } from './Signal';
import { hookOwnerName, requireSynchronousHook } from './syncHooks';
import type { System } from './System';
import type { Destroyable } from './types';
import type { Seconds } from './units';

/** Options accepted by {@link SystemRegistry.add}. */
export interface SystemRegistrationOptions {
  /** Overrides {@link System.order} for this registration only. */
  readonly order?: number;
  /**
   * Systems this one must run before, additive to (not a replacement for)
   * `order` - see {@link SystemRegistry} class docs for how `before`/`after`
   * combine with `order`/registration sequence.
   */
  readonly before?: readonly System[];
  /** Systems this one must run after. See {@link SystemRegistrationOptions.before}. */
  readonly after?: readonly System[];
  /**
   * Restrict this registration to the named phases. By default a system takes
   * part in every phase whose method it defines, which is what almost every
   * system wants.
   *
   * Pass this when an object happens to carry a method whose name matches a
   * phase without meaning to be that phase - a controller with its own
   * `update()` that should only draw, say. Naming a phase the system does not
   * implement is ignored.
   */
  readonly phases?: readonly SystemPhase[];
}

/** The scheduler phases a {@link System} can be registered for, in dispatch order. */
export type SystemPhase = 'preUpdate' | 'fixedUpdate' | 'update' | 'draw';

interface SystemRegistration {
  readonly system: System;
  /** Monotonic insertion counter, assigned when the system structurally enters the registry. Tie-breaks `order` and drives reverse-order destruction. */
  readonly sequence: number;
  readonly order: number;
  readonly before: readonly System[];
  readonly after: readonly System[];
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
// under, including tsconfig.guides.json's `strict: false` - plain discriminant
// narrowing on a boolean-literal tag is unreliable there.
const isPendingAdd = (mutation: PendingMutation): mutation is PendingAdd => mutation.add;

const tieBreak = (a: SystemRegistration, b: SystemRegistration): number => a.order - b.order || a.sequence - b.sequence;

/**
 * Cold half of the system-phase synchrony contract. The phase loops keep the
 * hot path to a single `result !== undefined` comparison and only call this
 * once a phase has actually returned something, so building the message here
 * costs nothing per frame.
 */
const requireSynchronousPhase = (result: unknown, system: System, phase: string): void => {
  requireSynchronousHook(
    result,
    `${hookOwnerName(system, 'System')}.${phase}()`,
    'The frame path never awaits a phase result, so an async phase loses its timing and swallows its errors. Move the asynchronous work into the owning scene’s load(), which the engine awaits once per activation.',
  );
};

/**
 * Sorts `list` in place. Pure `order`/`sequence` comparison when no
 * registration in `list` declares `before`/`after` - identical to the
 * original plain-sort behaviour. Otherwise resolves `before`/`after` against
 * `registrations` (only edges where BOTH ends are present in `list` count -
 * a phase-mismatched or not-yet-registered target is silently a no-op) and
 * topologically sorts (Kahn's algorithm), using `tieBreak` to pick among
 * simultaneously-ready registrations at each step. Throws if a cycle leaves
 * registrations that never become ready.
 */
const sortRegistrations = (list: SystemRegistration[], registrations: ReadonlyMap<System, SystemRegistration>): void => {
  if (list.every(reg => reg.before.length === 0 && reg.after.length === 0)) {
    list.sort(tieBreak);

    return;
  }

  const inList = new Set(list);
  const successors = new Map<SystemRegistration, SystemRegistration[]>(list.map(reg => [reg, []]));
  const indegree = new Map<SystemRegistration, number>(list.map(reg => [reg, 0]));

  const addEdge = (earlier: SystemRegistration, later: SystemRegistration): void => {
    if (earlier === later) {
      return;
    }

    successors.get(earlier)!.push(later);
    indegree.set(later, indegree.get(later)! + 1);
  };

  for (const reg of list) {
    for (const target of reg.before) {
      const targetReg = registrations.get(target);

      if (targetReg !== undefined && inList.has(targetReg)) {
        addEdge(reg, targetReg);
      }
    }

    for (const dependency of reg.after) {
      const dependencyReg = registrations.get(dependency);

      if (dependencyReg !== undefined && inList.has(dependencyReg)) {
        addEdge(dependencyReg, reg);
      }
    }
  }

  const ready = list.filter(reg => indegree.get(reg) === 0);
  const sorted: SystemRegistration[] = [];

  while (ready.length > 0) {
    ready.sort(tieBreak);

    const next = ready.shift()!;

    sorted.push(next);

    for (const successor of successors.get(next)!) {
      const remaining = indegree.get(successor)! - 1;

      indegree.set(successor, remaining);

      if (remaining === 0) {
        ready.push(successor);
      }
    }
  }

  if (sorted.length !== list.length) {
    const sortedSet = new Set(sorted);
    const stuckNames = list
      .filter(reg => !sortedSet.has(reg))
      .map(reg => reg.system.constructor?.name ?? 'system')
      .join(', ');

    throw new Error(`SystemRegistry: cycle detected in before/after constraints among: ${stuckNames}`);
  }

  list.length = 0;
  list.push(...sorted);
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
 * (`preUpdate`/`fixedUpdate`/`update`/`draw`); within a phase, systems run in ascending
 * `order` (ties keep registration order) and are destroyed in reverse
 * registration order when the registry is destroyed.
 *
 * {@link SystemRegistrationOptions.before}/{@link SystemRegistrationOptions.after}
 * layer a dependency graph on top of `order`, additive rather than a
 * replacement: `order`/registration sequence still decide ties among
 * registrations the graph doesn't relate to each other. A `before`/`after`
 * reference to a system outside the current phase - a different phase, or
 * never registered - is silently a no-op there, not an error. A cycle throws
 * once the affected phase list is next sorted.
 *
 * Structural mutations are frame-scoped: a system added
 * during a frame - whether from outside or from another system's own
 * callback - does not participate in any phase until the *next* frame, in
 * any phase. Removing a system during a callback marks it inactive
 * immediately, so it is skipped by every later phase and every later fixed
 * step in the *same* frame; the structural delete and the single {@link
 * SystemRegistry.onRemove} dispatch are finalized at the frame boundary,
 * or at once if the same system is added again before that boundary.
 * Outside a frame - before the first {@link SystemRegistry._beginFrame} or
 * after its matching {@link SystemRegistry._endFrame} - `add()`/`remove()`
 * apply immediately.
 */
export class SystemRegistry implements Destroyable {
  private readonly _registrations = new Map<System, SystemRegistration>();
  /** Systems the owning Application registered as its own; removing one stops part of the engine. */
  private readonly _coreSystems = new Set<System>();

  private readonly _preUpdateList: SystemRegistration[] = [];
  private readonly _fixedList: SystemRegistration[] = [];
  private readonly _updateList: SystemRegistration[] = [];
  private readonly _drawList: SystemRegistration[] = [];
  private readonly _pendingAdds = new Set<System>();
  private readonly _pending: PendingMutation[] = [];
  private _sequence = 0;
  private _activeCount = 0;
  private _frameActive = false;
  private _preUpdateDirty = false;
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
   *
   * Takes ownership: the registry calls `system.destroy?.()` when it is
   * removed by the registry's own {@link SystemRegistry.destroy}, in reverse
   * registration order. `remove()` does not destroy - see its own docs - so
   * a system meant to outlive this registry (e.g. an application-lifetime
   * `PhysicsWorld` registered on a scene) must be `remove()`d before the
   * registry that would otherwise destroy it tears down.
   *
   * Re-adding a system removed earlier in the same frame is not that no-op: it
   * cancels the pending removal and registers the system again with this
   * call's options, which is how a system changes its own order or phase
   * selection from inside a callback. The re-registration is buffered like any
   * other, so the system runs again from the next frame on.
   */
  public add<T extends System>(system: T, options?: SystemRegistrationOptions): T {
    if (this._pendingAdds.has(system)) {
      return system;
    }

    const existing = this._registrations.get(system);

    if (existing !== undefined) {
      if (existing.active) {
        return system;
      }

      // Removed earlier in this frame. Falling through to the duplicate no-op
      // above would leave the queued removal to drain at the frame boundary
      // and delete the registration this call just asked for. Finalizing it
      // here instead is also what lets the new options take effect: a
      // registration's order and phase membership are fixed at insertion.
      this._dropPendingRemoval(existing);
      this._finalizeRemoval(existing);
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
   * Remove `system` without destroying it - never destroys. Returns `true`
   * if the system was registered and eligible to run, matching
   * {@link SystemRegistry.has}; a buffered add made earlier in the same frame
   * is cancelled but reports `false`, since it never became a registration.
   * See the class docs for the exact timing of structural cleanup and
   * {@link SystemRegistry.onRemove}.
   */
  public remove(system: System): boolean {
    if (__DEV__ && this._coreSystems.has(system)) {
      logger.warn(
        "SystemRegistry.remove(): removing one of the engine's own core systems stops that part of the engine for good — input, interaction, audio, tweens, animations or rendering will no longer run. This is allowed on purpose, but it is almost never what you want; to reorder around one, use `before`/`after` against it instead.",
        { source: 'SystemRegistry', once: 'systems:remove-core' },
      );
    }

    if (this._pendingAdds.has(system)) {
      this._pendingAdds.delete(system);

      const index = this._pending.findIndex(mutation => isPendingAdd(mutation) && mutation.system === system);

      if (index !== -1) {
        this._pending.splice(index, 1);
      }

      return false;
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

  /** Whether `system` is currently registered and eligible to run - `false` for a not-yet-eligible buffered add or an already-removed system. */
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

  /**
   * Register a system the owning {@link Application} owns. Identical to
   * {@link SystemRegistry.add} apart from marking it, so that removing it later
   * warns in development and so that the owner can take it back out at teardown
   * without tripping that warning.
   * @internal
   */
  public _addCoreSystem<T extends System>(system: T, options?: SystemRegistrationOptions): T {
    this._coreSystems.add(system);

    return this.add(system, options);
  }

  /** @internal Counterpart to {@link _addCoreSystem}: unregister without the development warning. */
  public _removeCoreSystem(system: System): boolean {
    this._coreSystems.delete(system);

    return this.remove(system);
  }

  /** @internal Dispatched once per frame, ahead of every fixed step. */
  public _preUpdate(delta: Seconds): void {
    if (this._preUpdateList.length === 0) {
      return;
    }

    if (this._preUpdateDirty) {
      sortRegistrations(this._preUpdateList, this._registrations);
      this._preUpdateDirty = false;
    }

    for (const registration of this._preUpdateList) {
      if (registration.active) {
        const result = registration.system.preUpdate!(delta) as unknown;

        if (result !== undefined) requireSynchronousPhase(result, registration.system, 'preUpdate');
      }
    }
  }

  /** @internal Dispatched once per fixed-timestep step, after {@link SystemRegistry._preUpdate} and ahead of {@link SystemRegistry._update}. */
  public _fixedUpdate(step: Seconds): void {
    if (this._fixedList.length === 0) {
      return;
    }

    if (this._fixedDirty) {
      sortRegistrations(this._fixedList, this._registrations);
      this._fixedDirty = false;
    }

    for (const registration of this._fixedList) {
      if (registration.active) {
        const result = registration.system.fixedUpdate!(step) as unknown;

        if (result !== undefined) requireSynchronousPhase(result, registration.system, 'fixedUpdate');
      }
    }
  }

  /** @internal Dispatched once per frame, after fixed steps and ahead of {@link SystemRegistry._draw}. */
  public _update(delta: Seconds): void {
    if (this._updateList.length === 0) {
      return;
    }

    if (this._updateDirty) {
      sortRegistrations(this._updateList, this._registrations);
      this._updateDirty = false;
    }

    for (const registration of this._updateList) {
      if (registration.active) {
        const result = registration.system.update!(delta) as unknown;

        if (result !== undefined) requireSynchronousPhase(result, registration.system, 'update');
      }
    }
  }

  /** @internal Dispatched once per frame, after {@link SystemRegistry._update}. */
  public _draw(context: RenderingContext): void {
    if (this._drawList.length === 0) {
      return;
    }

    if (this._drawDirty) {
      sortRegistrations(this._drawList, this._registrations);
      this._drawDirty = false;
    }

    for (const registration of this._drawList) {
      if (registration.active) {
        const result = registration.system.draw!(context) as unknown;

        if (result !== undefined) requireSynchronousPhase(result, registration.system, 'draw');
      }
    }
  }

  /**
   * Destroy every remaining registered system exactly once, in reverse
   * registration order, then clear the registry. A system already removed
   * via {@link SystemRegistry.remove} - even if not yet structurally
   * finalized - is not destroyed: `remove()` never destroys.
   *
   * Each system is destroyed under its own guard and the clear-and-reset tail
   * always runs, so one throwing system can neither skip the systems after it
   * nor leave the registry live. Systems are the extension seam, which makes a
   * throwing `destroy()` the case to expect rather than a remote one.
   *
   * Failures are logged, never propagated - including in development, where
   * {@link DestroyScope.destroy} rethrows an `AggregateError` instead. The
   * difference is the caller: `Application._disposeManagedResources` invokes
   * this method unguarded, part-way through an ordered teardown, so a throw
   * here would strand the rendering context, audio, input, backend, platform
   * and clocks that come after it - reinstating the very leak this guard
   * closes.
   */
  public destroy(): void {
    const remaining = [...this._registrations.values()].filter(registration => registration.active).sort((a, b) => b.sequence - a.sequence);
    const failures: unknown[] = [];

    for (const registration of remaining) {
      try {
        registration.system.destroy?.();
      } catch (error) {
        failures.push(error);
      }
    }

    this._registrations.clear();
    this._preUpdateList.length = 0;
    this._fixedList.length = 0;
    this._updateList.length = 0;
    this._drawList.length = 0;
    this._pendingAdds.clear();
    this._pending.length = 0;
    this._activeCount = 0;
    this.onAdd.destroy();
    this.onRemove.destroy();

    for (const error of failures) {
      logger.error('SystemRegistry.destroy(): a system threw while being destroyed.', { source: 'SystemRegistry', ...(error instanceof Error && { error }) });
    }
  }

  private _insert(system: System, options?: SystemRegistrationOptions): void {
    const registration: SystemRegistration = {
      system,
      sequence: this._sequence++,
      order: options?.order ?? system.order ?? 0,
      before: options?.before ?? [],
      after: options?.after ?? [],
      active: true,
    };

    this._registrations.set(system, registration);
    this._activeCount++;

    const wants = (phase: SystemPhase): boolean => options?.phases === undefined || options.phases.includes(phase);

    if (system.preUpdate !== undefined && wants('preUpdate')) {
      this._preUpdateList.push(registration);
      this._preUpdateDirty = true;
    }

    if (system.fixedUpdate !== undefined && wants('fixedUpdate')) {
      this._fixedList.push(registration);
      this._fixedDirty = true;
    }

    if (system.update !== undefined && wants('update')) {
      this._updateList.push(registration);
      this._updateDirty = true;
    }

    if (system.draw !== undefined && wants('draw')) {
      this._drawList.push(registration);
      this._drawDirty = true;
    }

    this.onAdd.dispatch(system);
  }

  /** Drop a queued removal so the frame boundary does not finalize it a second time. */
  private _dropPendingRemoval(registration: SystemRegistration): void {
    const index = this._pending.findIndex(mutation => !isPendingAdd(mutation) && mutation.registration === registration);

    if (index !== -1) {
      this._pending.splice(index, 1);
    }
  }

  private _finalizeRemoval(registration: SystemRegistration): void {
    this._registrations.delete(registration.system);
    removeRegistration(this._preUpdateList, registration);
    removeRegistration(this._fixedList, registration);
    removeRegistration(this._updateList, registration);
    removeRegistration(this._drawList, registration);
    this.onRemove.dispatch(registration.system);
  }
}
