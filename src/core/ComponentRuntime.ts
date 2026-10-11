import type { Scene } from '#core/scene/Scene';

import { BehaviorComponent } from './BehaviorComponent';
import type { Component, ComponentClass } from './Component';
import { requireSynchronousComponentHook } from './Component';
import { ComponentQuery } from './ComponentQuery';
import type { SceneNode } from './SceneNode';
import type { Seconds } from './units';

/** What a {@link ComponentRuntime} needs of the scene activation that owns it. @internal */
export interface ComponentRuntimeHost {
  readonly scene: Scene;
  /** Whether components may be active: the scene is `Active`, paused or not. */
  isLive(): boolean;
  /** Whether behaviours may be called right now: `Active` and not paused. */
  isTicking(): boolean;
  reportError(error: unknown): void;
}

/**
 * The top of a component-carrying tree that a scene owns - its root or its UI
 * layer - resolving the component runtime of that scene's current activation.
 * @internal
 */
export interface ComponentAnchor {
  /** The runtime, created on demand when `create` is set; `null` while the scene has no activation that can hold one. */
  componentRuntime(create: boolean): ComponentRuntime | null;
}

type HookTask = () => void;

// `instanceof` alone narrows to `BehaviorComponent<any>`; the host type is irrelevant to dispatch.
const isBehavior = (component: Component): component is BehaviorComponent => component instanceof BehaviorComponent;

const overrides = (component: BehaviorComponent, hook: 'update' | 'fixedUpdate'): boolean =>
  component[hook] !== BehaviorComponent.prototype[hook];

/**
 * Component membership, activation and frame dispatch for one scene
 * activation. Created lazily by its scene scope the first time a component
 * appears under the scene's root or UI layer, or a query is made; a scene
 * without components never builds one.
 *
 * Membership follows structure: a component is a member while its node is
 * under one of the scene's two anchors. The index maps each exact component
 * class to the nodes carrying it, so a query visits candidates instead of the
 * scene graph.
 *
 * Mutation is frame-scoped, mirroring {@link SystemRegistry}: inside a frame
 * window a new member, and any activation, is published at the frame
 * boundary; leaving, disabling and destroying take effect at once, so a later
 * phase or query row in the same frame never sees them. Outside a frame
 * everything applies immediately.
 *
 * Lifecycle hooks never nest: a hook that triggers another component's hook
 * through this runtime has that hook run after it returns.
 * @internal
 */
export class ComponentRuntime {
  public readonly scene: Scene;

  private readonly _host: ComponentRuntimeHost;
  private readonly _index = new Map<ComponentClass, Set<SceneNode>>();
  private readonly _members = new Set<Component>();
  private readonly _pendingJoins = new Set<Component>();
  private readonly _pendingActivations = new Set<Component>();
  private readonly _updateList: BehaviorComponent[] = [];
  private readonly _fixedList: BehaviorComponent[] = [];
  private readonly _hookQueue: HookTask[] = [];
  private readonly _queries: Array<ComponentQuery<readonly ComponentClass[]>> = [];
  private _draining = false;
  private _holes = false;
  private _frameActive = false;
  private _dispatching = 0;
  private _stamp = 0;
  private _generation = 0;
  private _disposed = false;

  public constructor(host: ComponentRuntimeHost) {
    this._host = host;
    this.scene = host.scene;
  }

  /** Incremented at every frame boundary; an iteration started before it is stale. */
  public get generation(): number {
    return this._generation;
  }

  /** The newest publication stamp; an iteration skips members published after it started. */
  public get stamp(): number {
    return this._stamp;
  }

  /** Whether the owning scene has ended and this runtime holds nothing any more. */
  public get disposed(): boolean {
    return this._disposed;
  }

  /** The nodes carrying a member of exactly `type`, or `undefined` when none does. */
  public nodesOf(type: ComponentClass): ReadonlySet<SceneNode> | undefined {
    return this._index.get(type);
  }

  /** Whether `component` is a member here, published no later than `stamp`. */
  public isVisible(component: Component | undefined, stamp: number): boolean {
    return component !== undefined && component._runtime === this && component._member && component._joinStamp <= stamp;
  }

  /** The cached query for exactly this class tuple, created on first use. */
  public query<T extends readonly ComponentClass[]>(types: T): ComponentQuery<T> {
    for (const query of this._queries) {
      if (query._matches(types)) {
        return query as unknown as ComponentQuery<T>;
      }
    }

    const query = new ComponentQuery<T>(this, types);

    this._queries.push(query);

    return query;
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  /** A subtree carrying components entered one of this scene's anchors. */
  public attachSubtree(root: SceneNode): void {
    root._forEachComponent(component => this.join(component));
  }

  /** A subtree carrying components left this scene's anchors. */
  public detachSubtree(root: SceneNode): void {
    root._forEachComponent(component => this.leave(component));
  }

  public join(component: Component): void {
    if (this._disposed || component._runtime === this) {
      return;
    }

    component._runtime?.leave(component);
    component._runtime = this;

    if (this._frameActive) {
      this._pendingJoins.add(component);
    } else {
      this._publish(component);
    }
  }

  public leave(component: Component): void {
    if (component._runtime !== this) {
      return;
    }

    this._pendingJoins.delete(component);
    this._pendingActivations.delete(component);

    if (component.active) {
      this._deactivate(component);
    }

    if (component._member) {
      component._member = false;
      this._members.delete(component);

      const nodes = this._index.get(component.constructor as ComponentClass);

      if (nodes !== undefined) {
        nodes.delete(component.node);

        if (nodes.size === 0) {
          this._index.delete(component.constructor as ComponentClass);
        }
      }
    }

    component._runtime = null;
  }

  private _publish(component: Component): void {
    if (component._runtime !== this || component._member) {
      return;
    }

    component._member = true;
    component._joinStamp = ++this._stamp;
    this._members.add(component);

    const type = component.constructor as ComponentClass;
    let nodes = this._index.get(type);

    if (nodes === undefined) {
      nodes = new Set<SceneNode>();
      this._index.set(type, nodes);
    }

    nodes.add(component.node);
    this._tryActivate(component);
  }

  // -------------------------------------------------------------------------
  // Activation
  // -------------------------------------------------------------------------

  /** The scene became able (or stopped being able) to have active components. */
  public setLive(live: boolean): void {
    if (live) {
      for (const component of [...this._members]) {
        this._tryActivate(component);
      }

      return;
    }

    this._pendingActivations.clear();

    for (const component of [...this._members]) {
      if (component.active) {
        this._deactivate(component);
      }
    }
  }

  public onEnabledChanged(component: Component): void {
    if (component.enabled) {
      this._tryActivate(component);
    } else {
      this._pendingActivations.delete(component);

      if (component.active) {
        this._deactivate(component);
      }
    }
  }

  private _tryActivate(component: Component): void {
    if (!component._member || !component.enabled || component.active || !this._host.isLive() || this._disposed) {
      return;
    }

    if (this._frameActive) {
      this._pendingActivations.add(component);

      return;
    }

    this._runHook(() => {
      // Re-checked: an earlier hook in the queue may have changed any of it.
      if (!component._member || component._runtime !== this || !component.enabled || component.active || !this._host.isLive()) {
        return;
      }

      try {
        component._enable();
      } catch (error) {
        this._host.reportError(error);

        return;
      }

      if (component.active && component._member && isBehavior(component)) {
        this._schedule(component);
      }
    });
  }

  private _deactivate(component: Component): void {
    this._unschedule(component);

    this._runHook(() => {
      if (!component.active) {
        return;
      }

      try {
        component._disable();
      } catch (error) {
        this._host.reportError(error);
      }
    });
  }

  private _runHook(task: HookTask): void {
    this._hookQueue.push(task);

    if (this._draining) {
      return;
    }

    this._draining = true;

    try {
      for (let i = 0; i < this._hookQueue.length; i++) {
        this._hookQueue[i]!();
      }
    } finally {
      this._hookQueue.length = 0;
      this._draining = false;
    }
  }

  // -------------------------------------------------------------------------
  // Frame dispatch
  // -------------------------------------------------------------------------

  private _schedule(component: BehaviorComponent): void {
    component._ticking = true;

    if (!component._inUpdateList && overrides(component, 'update')) {
      component._inUpdateList = true;
      this._updateList.push(component);
    }

    if (!component._inFixedList && overrides(component, 'fixedUpdate')) {
      component._inFixedList = true;
      this._fixedList.push(component);
    }
  }

  private _unschedule(component: Component): void {
    if (!component._ticking) {
      return;
    }

    component._ticking = false;
    this._holes = true;

    if (this._dispatching === 0 && !this._frameActive) {
      this._compact();
    }
  }

  private _compact(): void {
    if (!this._holes) {
      return;
    }

    this._holes = false;
    compactList(this._updateList, component => (component._inUpdateList = false));
    compactList(this._fixedList, component => (component._inFixedList = false));
  }

  public beginFrame(): void {
    this._frameActive = true;
  }

  /** Publish what the frame buffered, in the order it happened. */
  public endFrame(): void {
    this._frameActive = false;
    this._generation++;
    this._compact();

    if (this._pendingJoins.size > 0) {
      const joins = [...this._pendingJoins];

      this._pendingJoins.clear();

      for (const component of joins) {
        this._publish(component);
      }
    }

    if (this._pendingActivations.size > 0) {
      const activations = [...this._pendingActivations];

      this._pendingActivations.clear();

      for (const component of activations) {
        this._tryActivate(component);
      }
    }
  }

  public fixedUpdate(step: Seconds): void {
    if (this._fixedList.length > 0) {
      this._dispatch(this._fixedList, 'fixedUpdate', step);
    }
  }

  public update(delta: Seconds): void {
    if (this._updateList.length > 0) {
      this._dispatch(this._updateList, 'update', delta);
    }
  }

  private _dispatch(list: readonly BehaviorComponent[], hook: 'update' | 'fixedUpdate', delta: Seconds): void {
    this._dispatching++;

    try {
      // Read once: an activation during this pass is deferred or appended, and
      // either way is not this pass's to run.
      const count = list.length;

      for (let i = 0; i < count; i++) {
        const component = list[i]!;

        if (!component._ticking) {
          continue;
        }

        // A behaviour that paused, retained or ended its scene stops the rest.
        if (!this._host.isTicking()) {
          break;
        }

        const result = component[hook](delta) as unknown;

        if (result !== undefined) {
          requireSynchronousComponentHook(component, hook, result);
        }
      }
    } finally {
      this._dispatching--;

      if (this._dispatching === 0 && !this._frameActive) {
        this._compact();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  /**
   * The owning scene ended. Every member has already been disabled by
   * {@link setLive} and has left with its node; whatever is left is dropped
   * without hooks, and queries made here report the scene as gone.
   */
  public dispose(): void {
    if (this._disposed) {
      return;
    }

    for (const component of [...this._members, ...this._pendingJoins]) {
      this.leave(component);
    }

    this._disposed = true;
    this._index.clear();
    this._members.clear();
    this._pendingJoins.clear();
    this._pendingActivations.clear();
    this._updateList.length = 0;
    this._fixedList.length = 0;
    this._queries.length = 0;
  }
}

/** Drop the entries whose component no longer ticks, keeping the order of the rest. */
const compactList = (list: BehaviorComponent[], release: (component: BehaviorComponent) => void): void => {
  let write = 0;

  for (let read = 0; read < list.length; read++) {
    const component = list[read]!;

    if (component._ticking) {
      list[write++] = component;
    } else {
      release(component);
    }
  }

  list.length = write;
};
