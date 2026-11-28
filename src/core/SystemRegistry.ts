import type { RenderingContext } from '#rendering/RenderingContext';

import type { Application } from './Application';
import type { FrameBudget } from './FrameBudget';
import { logger } from './Logger';
import type { Scene } from './scene/Scene';
import { Signal } from './Signal';
import { hookOwnerName, requireSynchronousHook } from './syncHooks';
import type { System, SystemContext } from './System';
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
export type SystemPhase = 'preFrame' | 'fixedUpdate' | 'update' | 'draw' | 'postFrame';

interface SystemRegistration {
  readonly system: System;
  /** Monotonic insertion counter, assigned when the system structurally enters the registry. Tie-breaks `order` and drives reverse-order destruction. */
  readonly sequence: number;
  readonly order: number;
  readonly before: readonly System[];
  readonly after: readonly System[];
  /** Registered and not removed. */
  active: boolean;
  /** Between `onEnable` and `onDisable`. */
  enabled: boolean;
  /**
   * Whether a phase calls it: registered, and not left behind by a failed
   * `onEnable`. Independent of the owner being live - the owner gates whole
   * passes on that itself.
   */
  runnable: boolean;
  /** Between `onAttach` and `onDetach`. */
  attached: boolean;
}

/** What a {@link SystemRegistry} knows of its owner. @internal */
export interface SystemRegistryOwner {
  readonly app: Application;
  readonly scene: Scene | null;
  reportError(error: unknown): void;
}

/** A system type to look up with {@link SystemRegistry.find}, abstract classes included. */
// oxlint-disable-next-line typescript/no-explicit-any -- constructor parameters are irrelevant to an instanceof lookup
export type SystemClass<T extends System = System> = abstract new (...args: any[]) => T;

type LifecycleHook = 'onEnable' | 'onDisable' | 'onDetach';

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
const requireSynchronousLifecycleHook = (result: unknown, system: System, hook: string): void => {
  requireSynchronousHook(
    result,
    `${hookOwnerName(system, 'System')}.${hook}()`,
    'System lifecycle hooks run synchronously and are never awaited; start asynchronous work from them and keep its handle instead.',
  );
};

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
 * The registry that owns each system, from the start of its `onAttach` until
 * its detach. Keys are weak so a released system is not retained.
 */
const systemOwners = new WeakMap<System, SystemRegistry>();

const wantsPhase = (options: SystemRegistrationOptions | undefined, phase: SystemPhase): boolean =>
  options?.phases === undefined || options.phases.includes(phase);

/** Drop entries a removal finalized while a phase list could still be iterating. */
const sweepRegistrations = (list: SystemRegistration[]): void => {
  let kept = 0;

  for (const registration of list) {
    if (registration.active) {
      list[kept++] = registration;
    }
  }

  list.length = kept;
};

/**
 * Phase-dispatching registry of {@link System}s, shared by `Scene` (as
 * `scene.systems`) and `Application` (as `app.systems`). Each system
 * participates only in the scheduler phases it implements
 * (`preFrame`/`fixedUpdate`/`update`/`draw`/`postFrame`); within a phase, systems run in ascending
 * `order` (ties keep registration order) and are destroyed in reverse
 * registration order when the registry is destroyed.
 *
 * {@link SystemRegistrationOptions.before}/{@link SystemRegistrationOptions.after}
 * layer a dependency graph on top of `order`, additive rather than a
 * replacement: `order`/registration sequence still decide ties among
 * registrations the graph doesn't relate to each other. A `before`/`after`
 * reference to a system outside the current phase - a different phase, or
 * never registered - is silently a no-op there, not an error. A cycle among
 * `before`/`after` constraints makes `add()` throw and leaves the registry
 * unchanged; for an add buffered during a frame it throws at the frame boundary.
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
 *
 * Systems with {@link SystemLifecycle} hooks are told when they are attached,
 * enabled, disabled and detached; see that interface for the exact points.
 */
export class SystemRegistry implements Destroyable {
  private readonly _registrations = new Map<System, SystemRegistration>();
  /** Systems the owning Application registered as its own; removing one stops part of the engine. */
  private readonly _coreSystems = new Set<System>();

  private readonly _preFrameList: SystemRegistration[] = [];
  private readonly _fixedList: SystemRegistration[] = [];
  private readonly _updateList: SystemRegistration[] = [];
  private readonly _drawList: SystemRegistration[] = [];
  private readonly _postFrameList: SystemRegistration[] = [];
  private readonly _pendingAdds = new Set<System>();
  private readonly _pending: PendingMutation[] = [];
  /** Systems inside their `onAttach`, and those of them removed from it. */
  private readonly _attaching = new Set<System>();
  private readonly _cancelledAttach = new Set<System>();
  private _sweepPending = false;
  private _sequence = 0;
  private _activeCount = 0;
  private _frameActive = false;
  private _halted = false;
  private _preFrameDirty = false;
  private _fixedDirty = false;
  private _updateDirty = false;
  private _drawDirty = false;
  private _postFrameDirty = false;
  private _live: boolean;
  private readonly _owner: SystemRegistryOwner | null;
  private readonly _context: SystemContext;

  /** Dispatched when a system structurally enters the registry (immediately, or at the frame boundary for a buffered add). */
  public readonly onAdd = new Signal<[system: System]>();
  /** Dispatched when a system structurally leaves the registry (immediately, or at the frame boundary for a buffered remove). */
  public readonly onRemove = new Signal<[system: System]>();

  /**
   * Registries are created by {@link Application} and {@link Scene}; one
   * constructed directly belongs to no application and is enabled from the
   * start.
   * @internal
   */
  public constructor(owner?: SystemRegistryOwner) {
    this._owner = owner ?? null;
    this._live = owner?.scene === null || owner === undefined;

    const unowned = (): never => {
      throw new Error('SystemContext.app: this registry was constructed on its own and belongs to no application.');
    };

    this._context = Object.freeze({
      get app(): Application {
        return owner?.app ?? unowned();
      },
      scene: owner?.scene ?? null,
      systems: this,
    });
  }

  /**
   * Register `system`, returning it unchanged for fluent capture
   * (`const world = app.systems.add(new PhysicsWorld({ fixedDelta: app.fixedTimeStep }))`).
   * Adding the same object twice is a no-op. See the class docs for buffering
   * timing.
   *
   * A system belongs to one registry at a time, from its `onAttach` until its
   * `onDetach`. Adding a system another registry still owns throws without
   * calling any hook; a system that registry removed earlier in its current
   * frame is released there first, so it is detached before it is attached here.
   * Distinct instances of one class can be registered anywhere.
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
    if (this._pendingAdds.has(system) || this._attaching.has(system)) {
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

    const owner = systemOwners.get(system);

    if (owner !== undefined && owner !== this && !owner._release(system)) {
      throw new Error(
        'SystemRegistry.add(): this system already belongs to another system registry. A system has one owner at a time: remove() it from the other registry first to move it.',
      );
    }

    if (!this._frameActive) {
      this._assertInsertable(system, options);
    }

    // Owned from here, before onAttach runs, so the hook cannot hand the system
    // to a second registry; onAttach itself may add or remove it reentrantly.
    systemOwners.set(system, this);
    this._attaching.add(system);

    try {
      this._attachHook(system);
    } catch (error) {
      this._attaching.delete(system);
      this._cancelledAttach.delete(system);
      this._disown(system);

      throw error;
    }

    this._attaching.delete(system);

    if (this._cancelledAttach.delete(system)) {
      this._detachSystem(system);

      return system;
    }

    if (this._frameActive) {
      // Attached now rather than at the boundary, so the system can reach its
      // context straight after add() even though it first runs next frame.
      this._pendingAdds.add(system);
      this._pending.push({ add: true, system, options });

      return system;
    }

    // onAttach may have registered other systems that now close a cycle.
    if (system.onAttach !== undefined) {
      try {
        this._assertInsertable(system, options);
      } catch (error) {
        this._detachSystem(system);

        throw error;
      }
    }

    this._insert(system, options);

    return system;
  }

  /**
   * The one registered system that is an instance of `type`, or `null` when
   * there is none. Buffered adds count, removed systems do not.
   *
   * @throws When more than one system matches: pass the intended one
   *   explicitly instead, or use {@link SystemRegistry.findAll}.
   */
  public find<T extends System>(type: SystemClass<T>): T | null {
    let found: T | null = null;

    for (const system of this._candidates()) {
      if (system instanceof type) {
        if (found !== null) {
          throw new Error(
            `SystemRegistry.find(): more than one registered system is a ${type.name || 'match'}. Pass the one you mean explicitly, or use findAll().`,
          );
        }

        found = system;
      }
    }

    return found;
  }

  /** Every registered system that is an instance of `type`, in registration order. Buffered adds count. */
  public findAll<T extends System>(type: SystemClass<T>): T[] {
    const found: T[] = [];

    for (const system of this._candidates()) {
      if (system instanceof type) {
        found.push(system);
      }
    }

    return found;
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
    if (this._attaching.has(system)) {
      this._cancelledAttach.add(system);

      return false;
    }

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

      this._detachSystem(system);

      return false;
    }

    const registration = this._registrations.get(system);

    if (registration === undefined || !registration.active) {
      return false;
    }

    registration.active = false;
    registration.runnable = false;
    this._activeCount--;
    this._disable(registration);

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

    if (this._sweepPending) {
      this._sweepPending = false;
      sweepRegistrations(this._preFrameList);
      sweepRegistrations(this._fixedList);
      sweepRegistrations(this._updateList);
      sweepRegistrations(this._drawList);
      sweepRegistrations(this._postFrameList);
    }

    if (this._pending.length === 0) {
      return;
    }

    // Taken off the queue before anything is applied: an onAdd/onRemove
    // listener that throws must neither leave the rest of the frame's
    // mutations unapplied nor have the next boundary apply them a second time.
    const pending = this._pending.splice(0);
    let failed = false;
    let failure: unknown;

    for (const mutation of pending) {
      try {
        if (isPendingAdd(mutation)) {
          this._pendingAdds.delete(mutation.system);

          try {
            this._assertInsertable(mutation.system, mutation.options);
          } catch (error) {
            this._detachSystem(mutation.system);

            throw error;
          }

          this._insert(mutation.system, mutation.options);
        } else {
          this._finalizeRemoval(mutation.registration);
        }
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }

    if (failed) {
      throw failure;
    }
  }

  /**
   * Whether the owner can run its systems: an application always, a scene
   * while it is active. Enables or disables every registered system on change.
   * @internal
   */
  public _setLive(live: boolean): void {
    if (this._live === live) {
      return;
    }

    this._live = live;

    if (live) {
      for (const registration of [...this._registrations.values()].sort((a, b) => a.sequence - b.sequence)) {
        this._enable(registration);
      }

      return;
    }

    for (const registration of [...this._registrations.values()].sort((a, b) => b.sequence - a.sequence)) {
      this._disable(registration);
    }
  }

  /**
   * Stop dispatching for good: the phase pass in progress ends after the
   * system currently running, and no later pass calls any system. Used by an
   * owner whose participation ends mid-frame, so the systems after the one
   * that ended it do not run against it. Registration and teardown are
   * unaffected.
   * @internal
   */
  public _halt(): void {
    this._halted = true;
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
  public _preFrame(delta: Seconds): void {
    if (this._preFrameList.length === 0) {
      return;
    }

    if (this._preFrameDirty) {
      sortRegistrations(this._preFrameList, this._registrations);
      this._preFrameDirty = false;
    }

    for (const registration of this._preFrameList) {
      if (this._halted) {
        return;
      }

      if (registration.runnable) {
        const result = registration.system.preFrame!(delta) as unknown;

        if (result !== undefined) {
          requireSynchronousPhase(result, registration.system, 'preFrame');
        }
      }
    }
  }

  /** @internal Dispatched once per fixed-timestep step, after {@link SystemRegistry._preFrame} and ahead of {@link SystemRegistry._update}. */
  public _fixedUpdate(step: Seconds): void {
    if (this._fixedList.length === 0) {
      return;
    }

    if (this._fixedDirty) {
      sortRegistrations(this._fixedList, this._registrations);
      this._fixedDirty = false;
    }

    for (const registration of this._fixedList) {
      if (this._halted) {
        return;
      }

      if (registration.runnable) {
        const result = registration.system.fixedUpdate!(step) as unknown;

        if (result !== undefined) {
          requireSynchronousPhase(result, registration.system, 'fixedUpdate');
        }
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
      if (this._halted) {
        return;
      }

      if (registration.runnable) {
        const result = registration.system.update!(delta) as unknown;

        if (result !== undefined) {
          requireSynchronousPhase(result, registration.system, 'update');
        }
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
      if (this._halted) {
        return;
      }

      if (registration.runnable) {
        const result = registration.system.draw!(context) as unknown;

        if (result !== undefined) {
          requireSynchronousPhase(result, registration.system, 'draw');
        }
      }
    }
  }

  /** @internal Dispatched once per frame, after the backend flush that ends {@link SystemRegistry._draw}'s frame. */
  public _postFrame(delta: Seconds, budget: FrameBudget): void {
    if (this._postFrameList.length === 0) {
      return;
    }

    if (this._postFrameDirty) {
      sortRegistrations(this._postFrameList, this._registrations);
      this._postFrameDirty = false;
    }

    for (const registration of this._postFrameList) {
      if (this._halted) {
        return;
      }

      if (registration.runnable) {
        const result = registration.system.postFrame!(delta, budget) as unknown;

        if (result !== undefined) {
          requireSynchronousPhase(result, registration.system, 'postFrame');
        }
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
    this._destroy(error => {
      logger.error('SystemRegistry.destroy(): a system threw while being destroyed.', {
        source: 'SystemRegistry',
        ...(error instanceof Error && { error }),
      });
    });
  }

  /**
   * @internal {@link SystemRegistry.destroy}, handing each system's failure
   * to `onFailure` instead of logging it - for an owner that reports teardown
   * failures through its own error pipeline.
   */
  public _destroy(onFailure: (error: unknown) => void): void {
    const remaining = [...this._registrations.values()].filter(registration => registration.active).sort((a, b) => b.sequence - a.sequence);
    const failures: unknown[] = [];

    const report = (error: unknown): void => {
      failures.push(error);
    };

    for (const registration of remaining) {
      // An earlier destroy() may have removed this member.
      if (!registration.active) {
        continue;
      }

      this._disable(registration, report);
      this._detach(registration, report);

      try {
        registration.system.destroy?.();
      } catch (error) {
        failures.push(error);
      }
    }

    // Removed during an open frame, or added and still buffered: attached, never destroyed.
    for (const registration of this._registrations.values()) {
      this._detach(registration, report);
    }

    for (const system of this._pendingAdds) {
      this._detachSystem(system, report);
    }

    this._registrations.clear();
    this._preFrameList.length = 0;
    this._fixedList.length = 0;
    this._updateList.length = 0;
    this._drawList.length = 0;
    this._postFrameList.length = 0;
    this._pendingAdds.clear();
    this._pending.length = 0;
    this._activeCount = 0;
    this.onAdd.destroy();
    this.onRemove.destroy();

    for (const error of failures) {
      onFailure(error);
    }
  }

  /** Throws, registering nothing, when `system` would close a before/after cycle. */
  private _assertInsertable(system: System, options: SystemRegistrationOptions | undefined): void {
    const registration = this._createRegistration(system, options);

    this._registrations.set(system, registration);

    try {
      this._assertAcyclic(registration, options);
    } finally {
      this._registrations.delete(system);
    }
  }

  private _createRegistration(system: System, options: SystemRegistrationOptions | undefined): SystemRegistration {
    return {
      system,
      sequence: this._sequence,
      order: options?.order ?? system.order ?? 0,
      before: options?.before ?? [],
      after: options?.after ?? [],
      active: true,
      enabled: false,
      runnable: true,
      attached: true,
    };
  }

  /** Structurally register an attached system that passed {@link _assertInsertable}. */
  private _insert(system: System, options: SystemRegistrationOptions | undefined): void {
    const registration = this._createRegistration(system, options);

    this._sequence++;
    this._registrations.set(system, registration);
    this._activeCount++;

    if (system.preFrame !== undefined && wantsPhase(options, 'preFrame')) {
      this._preFrameList.push(registration);
      this._preFrameDirty = true;
    }

    if (system.fixedUpdate !== undefined && wantsPhase(options, 'fixedUpdate')) {
      this._fixedList.push(registration);
      this._fixedDirty = true;
    }

    if (system.update !== undefined && wantsPhase(options, 'update')) {
      this._updateList.push(registration);
      this._updateDirty = true;
    }

    if (system.draw !== undefined && wantsPhase(options, 'draw')) {
      this._drawList.push(registration);
      this._drawDirty = true;
    }

    if (system.postFrame !== undefined && wantsPhase(options, 'postFrame')) {
      this._postFrameList.push(registration);
      this._postFrameDirty = true;
    }

    this._enable(registration);

    // onEnable may have removed the system again; its onRemove has then been dispatched already.
    if (registration.active) {
      this.onAdd.dispatch(system);
    }
  }

  /** Registered systems and buffered adds, in registration order. */
  private *_candidates(): Generator<System> {
    for (const registration of this._registrations.values()) {
      if (registration.active) {
        yield registration.system;
      }
    }

    yield* this._pendingAdds;
  }

  /** Run `onAttach`; a throw propagates to the caller of `add()`, which has registered nothing yet. */
  private _attachHook(system: System): void {
    if (system.onAttach === undefined) {
      return;
    }

    const result = system.onAttach(this._context) as unknown;

    if (result !== undefined) {
      requireSynchronousLifecycleHook(result, system, 'onAttach');
    }
  }

  private _enable(registration: SystemRegistration): void {
    if (!this._live || !registration.active || registration.enabled) {
      return;
    }

    registration.enabled = true;
    registration.runnable = true;

    // A failed onEnable leaves the system registered and silent rather than
    // running phases whose setup never happened, and gets onDisable so it can
    // release whatever it acquired before throwing. A hook that removed its own
    // system has been disabled by that removal already.
    if (!this._runHook(registration.system, 'onEnable') && registration.enabled) {
      registration.enabled = false;
      registration.runnable = false;
      this._runHook(registration.system, 'onDisable');
    }
  }

  private _disable(registration: SystemRegistration, report?: (error: unknown) => void): void {
    if (!registration.enabled) {
      return;
    }

    registration.enabled = false;
    this._runHook(registration.system, 'onDisable', report);
  }

  private _detach(registration: SystemRegistration, report?: (error: unknown) => void): void {
    if (!registration.attached) {
      return;
    }

    registration.attached = false;
    this._detachSystem(registration.system, report);
  }

  /**
   * Release ownership, then run `onDetach`: released first so the hook can hand
   * the system to another registry, or add it here again.
   */
  private _detachSystem(system: System, report?: (error: unknown) => void): void {
    this._disown(system);
    this._runHook(system, 'onDetach', report);
  }

  private _disown(system: System): void {
    if (systemOwners.get(system) === this) {
      systemOwners.delete(system);
    }
  }

  /**
   * Let another registry take `system`: possible only while it is removed but
   * not yet finalized, which then happens at once. Returns whether the system
   * is free now. @internal
   */
  public _release(system: System): boolean {
    const registration = this._registrations.get(system);

    if (registration === undefined || registration.active) {
      return false;
    }

    this._dropPendingRemoval(registration);

    try {
      this._finalizeRemoval(registration);
    } catch (error) {
      this._report(error);
    }

    return true;
  }

  /** Run a lifecycle hook other than `onAttach`, reporting a failure instead of throwing. Returns whether it succeeded. */
  private _runHook(system: System, hook: LifecycleHook, report: (error: unknown) => void = this._report): boolean {
    if (system[hook] === undefined) {
      return true;
    }

    try {
      const result = system[hook]?.() as unknown;

      if (result !== undefined) {
        requireSynchronousLifecycleHook(result, system, hook);
      }

      return true;
    } catch (error) {
      report(error);

      return false;
    }
  }

  private readonly _report = (error: unknown): void => {
    if (this._owner !== null) {
      this._owner.reportError(error);

      return;
    }

    logger.error('A system lifecycle hook threw.', { source: 'SystemRegistry', ...(error instanceof Error && { error }) });
  };

  private _assertAcyclic(registration: SystemRegistration, options: SystemRegistrationOptions | undefined): void {
    const { system } = registration;
    const phases: Array<[SystemPhase, SystemRegistration[], boolean]> = [
      ['preFrame', this._preFrameList, system.preFrame !== undefined],
      ['fixedUpdate', this._fixedList, system.fixedUpdate !== undefined],
      ['update', this._updateList, system.update !== undefined],
      ['draw', this._drawList, system.draw !== undefined],
      ['postFrame', this._postFrameList, system.postFrame !== undefined],
    ];

    for (const [phase, list, implemented] of phases) {
      if (implemented && wantsPhase(options, phase)) {
        const active = list.filter(entry => entry.active);

        active.push(registration);
        sortRegistrations(active, this._registrations);
      }
    }
  }

  /** Drop a queued removal so the frame boundary does not finalize it a second time. */
  private _dropPendingRemoval(registration: SystemRegistration): void {
    const index = this._pending.findIndex(mutation => !isPendingAdd(mutation) && mutation.registration === registration);

    if (index !== -1) {
      this._pending.splice(index, 1);
    }
  }

  /** Structural delete, `onRemove`, then detach - which happens even when an `onRemove` listener throws. */
  private _finalizeRemoval(registration: SystemRegistration): void {
    this._registrations.delete(registration.system);

    if (this._frameActive) {
      // A phase may be iterating these lists right now; splicing would skip the
      // entry after this one. The inactive entry is skipped until the sweep.
      this._sweepPending = true;
    } else {
      removeRegistration(this._preFrameList, registration);
      removeRegistration(this._fixedList, registration);
      removeRegistration(this._updateList, registration);
      removeRegistration(this._drawList, registration);
      removeRegistration(this._postFrameList, registration);
    }

    try {
      this.onRemove.dispatch(registration.system);
    } finally {
      this._detach(registration);
    }
  }
}
