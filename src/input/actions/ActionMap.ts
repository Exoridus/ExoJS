import type { AxisAction } from './AxisAction';
import type { ButtonAction } from './ButtonAction';
import type { ActionSample } from './types';
import { ActionOwnership } from './types';
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
 * Own members of {@link ActionMapBase} — the constructor assigns every action
 * directly onto the instance (`Object.assign(this, actions)`), so an action
 * named after one of these would silently overwrite it (`actions` collapsing
 * from the internal array to a single Action being the most damaging: it
 * breaks `_update`/`_reset` for every action the map owns, not just the
 * colliding one) instead of throwing anywhere near the mistake.
 */
const reservedActionMapNames: ReadonlySet<string> = new Set(['actions', 'attached', 'detach', '_owner', '_attach', '_update', '_reset']);

/**
 * Every action instance ever bound into an {@link ActionMap}, for the
 * lifetime of the process. An action's ownership is exclusive and permanent
 * — see {@link ActionMapBase}'s own doc comment — so a `WeakSet` needs no
 * removal path: an action is never legitimately reclaimed by a different
 * map, and there is no map-level `destroy()` to release it on.
 */
const claimedActions = new WeakSet<Action>();

/**
 * Claim `action` for a map being constructed, under `name`. Throws
 * immediately — not a runtime warning — the moment the SAME instance would
 * end up reachable from more than one map, or twice under different names
 * in the same one: either would silently corrupt whichever map samples it
 * second, since an action carries frame-to-frame edge memory that assumes a
 * single, exclusive caller.
 */
function claimAction(action: Action, name: string): void {
  if (claimedActions.has(action)) {
    throw new Error(
      `ActionMap: the action bound to "${name}" already belongs to another ActionMap (or is used twice, or under another name, in this one). ` +
        'Each Action instance belongs to exactly one ActionMap for its whole lifetime — construct a separate instance per map instead.',
    );
  }

  claimedActions.add(action);
}

/**
 * A named group of actions updated as a unit. The actions are exposed directly
 * on the instance, so a map reads like the control scheme it describes.
 *
 * Each action instance belongs to exactly one `ActionMap`, checked and
 * rejected at construction (see {@link claimAction}) — an action's
 * frame-to-frame state (an aggregate value, and for {@link ButtonAction} an
 * edge) is meaningful only when exactly one caller samples it once per real
 * frame; two maps sharing an instance would silently corrupt whichever
 * samples it second. The MAP itself, in contrast, may freely move between
 * owners (`app.input.attach`, `scene.inputs.attach`, or a later re-attach to
 * either) — {@link ActionMapBase._update} baselines it against the new
 * owner's live channel state rather than replaying batches that belong to
 * an unrelated buffer, exactly as a fresh, never-before-attached map's very
 * first update does too.
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
  private readonly _ownership = new ActionOwnership();

  public constructor(actions: T) {
    for (const [name, action] of Object.entries(actions)) {
      if (reservedActionMapNames.has(name)) {
        throw new Error(
          `ActionMap: "${name}" collides with ActionMap's own API and cannot be used as an action name. Reserved names: ${[...reservedActionMapNames].sort().join(', ')}.`,
        );
      }

      claimAction(action, name);
    }

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

  /**
   * Sample every action against this frame's channel state. Ownership is
   * resolved once here, for the whole map, rather than once per action — see
   * {@link ActionOwnership}'s doc comment for why that is enough now that an
   * action belongs to exactly one map: a fresh attach or a legitimate move to
   * a different owner baselines every action against the live channel state
   * (no synthetic edges) instead of replaying this frame's batches, which —
   * for a first-ever attach — never recorded a channel's already-current
   * value in the first place, and — for a genuine owner change — belong to
   * an unrelated buffer.
   *
   * @internal
   */
  public _update(sample: ActionSample): void {
    const resolution = this._ownership.resolve(sample);

    if (resolution === 'duplicate') {
      return;
    }

    if (resolution === 'baseline') {
      // Force every action to re-baseline against the live channel state on
      // its own very next _update call below, rather than trusting whatever
      // frame-to-frame state it carries from a previous, unrelated owner —
      // see ButtonAction._reset's doc comment.
      for (const action of this.actions) {
        action._reset();
      }
    }

    for (const action of this.actions) {
      action._update(sample);
    }
  }

  /** Clear every action's state — used when an owner stops feeding the map. @internal */
  public _reset(): void {
    for (const action of this.actions) {
      action._reset();
    }

    this._ownership.reset();
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
