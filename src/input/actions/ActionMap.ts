import type { AxisAction } from './AxisAction';
import type { ButtonAction } from './ButtonAction';
import type { ActionSample } from './types';
import type { VectorAction } from './VectorAction';

/** Any of the three action kinds an {@link ActionMap} can hold. */
export type Action = ButtonAction | AxisAction | VectorAction;

/** The shape an {@link ActionMap} is built from. */
export type ActionRecord = Readonly<Record<string, Action>>;

/** Owner an action map detaches itself from. @internal */
export interface ActionMapOwner {
  _detachActionMap(map: ActionMapBase<ActionRecord>): void;
}

/**
 * A named group of actions updated as a unit. The actions are exposed directly
 * on the instance, so a map reads like the control scheme it describes.
 *
 * A map does nothing until it is attached to an input owner —
 * `app.input.attach(map)` for application lifetime, or `scene.inputs.attach(map)`
 * to have it detached automatically when the scene ends.
 *
 * @example
 * ```ts
 * const controls = new ActionMap({
 *   jump: new ButtonAction([Keyboard.Space, GamepadButton.South]),
 *   move: new VectorAction({ up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D }),
 * });
 *
 * scene.inputs.attach(controls);
 *
 * if (controls.jump.pressed) {
 *   player.jump();
 * }
 * ```
 */
class ActionMapBase<T extends ActionRecord> {
  /** The actions this map owns, in declaration order. */
  public readonly actions: readonly Action[];

  private _owner: ActionMapOwner | null = null;

  public constructor(actions: T) {
    this.actions = Object.values(actions);
    Object.assign(this, actions);
  }

  /** `true` while this map is attached to an input owner and being updated. */
  public get attached(): boolean {
    return this._owner !== null;
  }

  /**
   * Detach from the owner it was attached to, leaving every action at its
   * current values. Idempotent.
   */
  public detach(): void {
    const owner = this._owner;

    if (owner === null) {
      return;
    }

    this._owner = null;
    owner._detachActionMap(this);
  }

  /**
   * Bind this map to an owner. Detaches from a previous owner first, so a map
   * is only ever updated once per frame.
   *
   * @internal
   */
  public _attach(owner: ActionMapOwner): void {
    this.detach();
    this._owner = owner;
  }

  /** Sample every action against this frame's channel state. @internal */
  public _update(sample: ActionSample): void {
    for (const action of this.actions) {
      action._update(sample);
    }
  }

  /** Clear every action's state — used when an owner stops feeding the map. @internal */
  public _reset(): void {
    for (const action of this.actions) {
      action._reset();
    }
  }
}

/**
 * Constructing an `ActionMap` returns the map's own members *and* the actions
 * it was built from. TypeScript cannot express that through `extends` on a
 * generic parameter, so the merged shape is applied to the constructor here.
 */
type ActionMapConstructor = new <T extends ActionRecord>(actions: T) => ActionMapBase<T> & Readonly<T>;

export const ActionMap = ActionMapBase as unknown as ActionMapConstructor;

/** A constructed action map together with its actions. */
export type ActionMap<T extends ActionRecord = ActionRecord> = ActionMapBase<T> & Readonly<T>;
