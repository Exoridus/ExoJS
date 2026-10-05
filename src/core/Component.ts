import type { Scene } from '#core/scene/Scene';

import type { ComponentRuntime } from './ComponentRuntime';
import type { SceneNode } from './SceneNode';
import { hookOwnerName, requireSynchronousHook } from './syncHooks';
import type { Synchronous } from './types';

const hookRemedy = 'Component hooks run synchronously and are never awaited; start asynchronous work from them and keep its handle instead.';

/** The thenable guard every component hook result passes through. @internal */
export const requireSynchronousComponentHook = (component: object, hook: string, result: unknown): void => {
  if (result !== undefined) {
    requireSynchronousHook(result, `${hookOwnerName(component, 'Component')}.${hook}()`, hookRemedy);
  }
};

/**
 * Any concrete or abstract component class: the token {@link SceneNode.getComponent}
 * and {@link Scene.query} look components up by. Matching is by exact class
 * identity - a subclass is a different token.
 */
export type ComponentClass<C extends Component = Component> = abstract new (...args: never[]) => C;

/**
 * The node type a component requires as its host - what a compile error names
 * when {@link SceneNode.addComponent} is given a component for another kind of
 * node. No value has this shape; it only appears in diagnostics.
 */
export interface ComponentHost<H> {
  readonly [componentHostRequirement]: H;
}

/**
 * Accepts a component of type `C` on a node of type `H` when `H` is the
 * component's declared host type or a subtype of it, and otherwise requires a
 * {@link ComponentHost} no component carries. A conditional rather than a
 * contravariant function member, so the check also holds for consumers that
 * compile without `strictFunctionTypes`.
 */
export type ComponentHostCheck<H, C extends Component> = H extends C[typeof componentHost] ? unknown : ComponentHost<C[typeof componentHost]>;

/** Errors raised by teardown steps that must not stop the steps after them. */
const rethrowFirst = (errors: readonly unknown[]): void => {
  if (errors.length > 0) {
    throw errors[0];
  }
};

/**
 * A unit of state or capability attached to a {@link SceneNode}: a tag, a
 * stat block, an event-driven helper. A component is constructed by the caller
 * and attached with {@link SceneNode.addComponent}; the node keeps at most one
 * instance per exact component class.
 *
 * A plain component is never called per frame. Behaviour that must run every
 * frame derives from {@link BehaviorComponent} instead, or is written as a
 * system over a {@link Scene.query}.
 *
 * Lifecycle, as seen from the hooks:
 *
 * - {@link onAttach} when the component is attached to a node, and
 *   {@link onDetach} when it is removed from it. They concern the node alone:
 *   `onAttach` can run while the node is not in any scene yet.
 * - {@link onEnable} once the component is attached, {@link enabled}, and its
 *   node belongs to the root or UI layer of an active scene; {@link onDisable}
 *   when any of that stops being true - the component is disabled, its node
 *   leaves the scene, the scene is retained or ends. Pausing the scene is not
 *   one of them: a paused scene's components stay enabled.
 * - {@link onDestroy} once, after {@link destroy}.
 *
 * Every hook must be synchronous, exactly like {@link Scene.update}.
 *
 * `N` is the node type this component may be attached to: a component written
 * for sprites declares `Component<Sprite>`, and attaching it to a plain
 * container is a compile error.
 *
 * @example
 * ```ts
 * class Health extends Component {
 *   public current = 100;
 * }
 *
 * const health = enemy.addComponent(new Health());
 * enemy.getComponent(Health)?.current; // 100
 * ```
 */
export abstract class Component<N extends SceneNode = SceneNode> {
  /** Type-only carrier of the accepted host type, read by {@link ComponentHostCheck}. Never present at runtime. */
  declare public readonly [componentHost]: N;

  private _node: N | null = null;
  private _enabled = true;
  private _active = false;
  private _destroyed = false;

  /**
   * The runtime of the scene this component belongs to, while its node is under
   * that scene's root or UI layer. Owned by that runtime.
   * @internal
   */
  public _runtime: ComponentRuntime | null = null;
  /** Whether {@link _runtime} has published this component to its index. @internal */
  public _member = false;
  /** Monotonic stamp of the publication; iterations started earlier skip it. @internal */
  public _joinStamp = 0;
  /** Whether a frame dispatch list may call this component this frame. @internal */
  public _ticking = false;
  /** Whether an entry for this component sits in the runtime's update list. @internal */
  public _inUpdateList = false;
  /** Whether an entry for this component sits in the runtime's fixed-update list. @internal */
  public _inFixedList = false;

  /**
   * The node this component is attached to.
   *
   * @throws If the component is not attached - before {@link SceneNode.addComponent},
   *   after {@link SceneNode.removeComponent}, or once destroyed.
   */
  public get node(): N {
    if (this._node === null) {
      throw new Error(
        `${this.constructor.name || 'Component'}.node was read while the component is not attached to a node. ` +
          'Attach it with node.addComponent(...) first, and check `attached` where it may have been removed.',
      );
    }

    return this._node;
  }

  /** Whether the component is attached to a node. */
  public get attached(): boolean {
    return this._node !== null;
  }

  /**
   * The component's own switch. `true` by default. Turning it off disables
   * an active component (and stops a {@link BehaviorComponent}'s frame hooks)
   * without detaching it: it stays on its node and in {@link Scene.query}
   * results. Turning it back on enables it again once its node is in an active
   * scene - during a frame, from the next frame on.
   */
  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(value: boolean) {
    if (this._enabled === value) {
      return;
    }

    this._enabled = value;
    this._runtime?.onEnabledChanged(this);
  }

  /**
   * Whether the component is enabled in an active scene right now: between its
   * {@link onEnable} and {@link onDisable}. Stays `true` while the scene is
   * paused.
   */
  public get active(): boolean {
    return this._active;
  }

  /** Whether {@link destroy} has run. A destroyed component cannot be attached again. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * The scene whose root or UI layer the component's node belongs to, or
   * `null` while it belongs to none. A retained scene still counts.
   */
  public get scene(): Scene | null {
    return this._runtime?.scene ?? null;
  }

  /**
   * End the component for good: disable it if active, detach it from its node
   * if attached, then run {@link onDestroy}. Idempotent. Destroying a node
   * destroys every component still attached to it.
   *
   * Every step runs even when a hook throws; the first error is rethrown
   * afterwards.
   */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    const errors: unknown[] = [];

    if (this._node !== null) {
      try {
        this._node.removeComponent(this);
      } catch (error) {
        errors.push(error);
      }
    }

    try {
      requireSynchronousComponentHook(this, 'onDestroy', this.onDestroy());
    } catch (error) {
      errors.push(error);
    }

    rethrowFirst(errors);
  }

  /** Called after the component was attached to {@link node}. The node may not be in any scene yet. */
  protected onAttach(): Synchronous {
    // Override in subclass.
  }

  /** Called after the component was removed from its node; {@link node} is no longer readable. */
  protected onDetach(): Synchronous {
    // Override in subclass.
  }

  /** Called when the component becomes {@link active}. Release in {@link onDisable} what this acquires. */
  protected onEnable(): Synchronous {
    // Override in subclass.
  }

  /** Called when the component stops being {@link active}. */
  protected onDisable(): Synchronous {
    // Override in subclass.
  }

  /** Called once, at the end of {@link destroy}. */
  protected onDestroy(): Synchronous {
    // Override in subclass.
  }

  /** Bind to `node` and run {@link onAttach}; rolls the binding back if the hook throws. @internal */
  public _attachTo(node: SceneNode, rollback: () => void): void {
    this._node = node as N;

    try {
      requireSynchronousComponentHook(this, 'onAttach', this.onAttach());
    } catch (error) {
      this._node = null;
      rollback();
      throw error;
    }
  }

  /** Unbind from the node and run {@link onDetach}. @internal */
  public _detachFromNode(): void {
    this._node = null;
    requireSynchronousComponentHook(this, 'onDetach', this.onDetach());
  }

  /** Mark active and run {@link onEnable}; a throwing hook leaves it inactive. @internal */
  public _enable(): void {
    this._active = true;

    try {
      requireSynchronousComponentHook(this, 'onEnable', this.onEnable());
    } catch (error) {
      this._active = false;
      throw error;
    }
  }

  /** Mark inactive and run {@link onDisable}. @internal */
  public _disable(): void {
    this._active = false;
    requireSynchronousComponentHook(this, 'onDisable', this.onDisable());
  }
}

/**
 * Key for {@link Component}'s host-type carrier. Deliberately not exported:
 * nothing outside the component contract can fabricate a matching key, so an
 * object only satisfies a component type by actually being one.
 */
declare const componentHost: unique symbol;

/** Key of {@link ComponentHost}; never carried by any value. */
declare const componentHostRequirement: unique symbol;
