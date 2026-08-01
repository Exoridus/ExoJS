import type { AxisAction } from './AxisAction';
import type { ButtonAction } from './ButtonAction';
import type { ChordAction } from './ChordAction';
import type { SequenceAction } from './SequenceAction';
import type { ActionSample } from './types';
import { ActionOwnership } from './types';
import type { VectorAction } from './VectorAction';

/** Any action kind an {@link ActionMap} can hold. */
export type Action = ButtonAction | AxisAction | VectorAction | ChordAction | SequenceAction;

/** The shape an {@link ActionMap} is built from. */
export type ActionRecord = Readonly<Record<string, Action>>;

/**
 * Owner an action map detaches itself from. @internal
 *
 * `_currentBatchSequence` is optional so a stub/legacy owner still satisfies
 * this interface: {@link ActionMapBase._attach} falls back to `0` when it is
 * absent, which reproduces the OLD (pre-watermark) behavior for that owner —
 * replay every batch in the first post-attach sample rather than filtering
 * out anything that predates the attach. A real owner (an `InputManager`)
 * always implements it.
 */
export interface ActionMapOwner {
  _detachActionMap(map: ActionMapBase<ActionRecord>): void;
  _currentBatchSequence?(): number;
  /**
   * Immutable snapshot of every live channel at the observation boundary
   * (attach or resync) — optional for the same reason
   * `_currentBatchSequence` is: a stub/legacy owner without it reproduces
   * the OLD (watermark-only) behavior, see {@link ActionOwnership.arm}'s doc
   * comment. A real owner (an `InputManager`) always implements it.
   */
  _snapshotActionChannels?(): Float32Array;
}

/**
 * Every action instance ever bound into an {@link ActionMap}, for the
 * lifetime of the process. An action's ownership is exclusive and permanent
 * — see {@link ActionMapBase}'s own doc comment — so a `WeakSet` needs no
 * removal path: an action is never legitimately reclaimed by a different
 * map, and there is no map-level `destroy()` to release it on.
 */
const claimedActions = new WeakSet<Action>();

/**
 * Assert `action` (declared under `name`) is claimable by a map under
 * construction, given the OTHER actions already validated earlier in the
 * same call (`pending`). Throws immediately — not a runtime warning — the
 * moment the SAME instance would end up reachable from more than one map, or
 * twice under different names in the same one: either would silently
 * corrupt whichever map samples it second, since an action carries
 * frame-to-frame edge memory that assumes a single, exclusive caller.
 *
 * Deliberately read-only: {@link ActionMapBase}'s constructor validates
 * every entry with this BEFORE committing any of them to the module-level
 * `claimedActions` set, so a later entry failing validation never leaves an
 * earlier one permanently — and incorrectly — marked claimed for a map that
 * was never actually built.
 */
function assertClaimable(action: Action, name: string, pending: ReadonlySet<Action>): void {
  if (claimedActions.has(action) || pending.has(action)) {
    throw new Error(
      `ActionMap: the action bound to "${name}" already belongs to another ActionMap (or is used twice, or under another name, in this one). ` +
        'Each Action instance belongs to exactly one ActionMap for its whole lifetime — construct a separate instance per map instead.',
    );
  }
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
  private _availability: (() => boolean) | null = null;
  private _wasAvailable = true;

  public constructor(actions: T) {
    // Reads every enumerable getter on `actions` exactly once. Neither
    // `this.actions` nor the instance assignment below may touch `actions`
    // again after this line — a getter that is not perfectly idempotent (or
    // that intentionally throws on a second read) would otherwise silently
    // observe a different value, or throw, purely as a side effect of how
    // many times this constructor happens to read it.
    const entries = Object.entries(actions);
    // Validated but not yet committed to the module-level `claimedActions`
    // set — see `assertClaimable`'s doc comment for why the two passes below
    // must not be collapsed into one.
    const pending = new Set<Action>();

    for (const [name, action] of entries) {
      if (reservedActionMapNames.has(name)) {
        throw new Error(
          `ActionMap: "${name}" collides with ActionMap's own API and cannot be used as an action name. Reserved names: ${[...reservedActionMapNames].sort().join(', ')}.`,
        );
      }

      assertClaimable(action, name, pending);
      pending.add(action);
    }

    // Every entry validated clean — now, and only now, commit them all.
    for (const action of pending) {
      claimedActions.add(action);
    }

    this.actions = entries.map(([, action]) => action);
    Object.assign(this, Object.fromEntries(entries));
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
    this._availability = null;
    this._wasAvailable = true;
    owner._detachActionMap(this);
  }

  /**
   * Bind this map to an owner. Detaches from a previous owner first, so a map
   * is only ever updated once per frame. Arms the ownership watermark against
   * the owner's CURRENT batch sequence — see {@link ActionOwnership.arm} —
   * so the baseline `_update` call this attach leads to replays only
   * activity that happened after this very moment, not whatever the owner's
   * shared batch log already held from earlier in the same real frame.
   *
   * @internal
   */
  public _attach(owner: ActionMapOwner, availability: (() => boolean) | null = null): void {
    this.detach();
    this._owner = owner;
    this._availability = availability;
    this._wasAvailable = true;
    this._ownership.arm(owner._currentBatchSequence?.() ?? 0, owner._snapshotActionChannels?.() ?? null);
  }

  /**
   * Re-arm the ownership watermark without a fresh `_attach` — used by
   * `InputManager._resyncActionMap` (scene resume), which resyncs a map that
   * stays with the SAME owner throughout a suspend/resume cycle and so never
   * goes through `_attach` again.
   *
   * @internal
   */
  public _armBaseline(watermark: number, baselineValues: Float32Array | null = null): void {
    this._ownership.arm(watermark, baselineValues);
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
   * A `'baseline'` resolution additionally restricts the batches handed to
   * every action to those at-or-after the ownership's watermark (see
   * {@link ActionOwnership.filterBatches}), so a map attached or resynced
   * partway through the CURRENT real frame does not replay activity that was
   * already sitting in the owner's shared batch log before it started
   * watching. Before that replay, it first seeds every action from the
   * ownership's own attach-moment channel snapshot (see
   * {@link ActionOwnership.takeBaselineSample}) with no batches at all — a
   * watermark alone tells an action which batches to SKIP, but a channel a
   * skipped batch touches is thereby excluded from that action's own
   * live-value seed too, so without this snapshot pass a channel held
   * before attach and released by the very next real batch would seed from
   * a synthetic zero instead of its true held value, silently swallowing
   * the release. This snapshot pass leaves every action `_seeded`, so the
   * following real-batch pass takes the normal incremental-replay path —
   * nothing else conditional is needed in the action classes themselves.
   *
   * @internal
   */
  public _update(sample: ActionSample): void {
    const available = this._availability?.() ?? true;

    if (!available) {
      if (this._wasAvailable) {
        this._reset();
      }
      this._wasAvailable = false;
      return;
    }

    if (!this._wasAvailable) {
      const owner = this._owner;
      this._wasAvailable = true;
      if (owner !== null) {
        this._ownership.arm(owner._currentBatchSequence?.() ?? 0, owner._snapshotActionChannels?.() ?? null);
      }
    }

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

      const baselineSample = this._ownership.takeBaselineSample(sample);

      if (baselineSample !== null) {
        for (const action of this.actions) {
          action._update(baselineSample);
        }
      }
    }

    const effectiveSample = resolution === 'baseline' ? this._ownership.filterBatches(sample) : sample;

    for (const action of this.actions) {
      action._update(effectiveSample);
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
 * Names an action cannot be declared under — the constructor assigns every
 * action directly onto the instance (`Object.assign(this, actions)`), so an
 * action named after one of these would silently overwrite it (`actions`
 * collapsing from the internal array to a single Action being the most
 * damaging: it breaks `_update`/`_reset` for every action the map owns, not
 * just the colliding one) instead of throwing anywhere near the mistake.
 *
 * `Object.getOwnPropertyNames(ActionMapBase.prototype)` covers everything
 * declared as a prototype member — `constructor`, `attached`, `detach`,
 * `_attach`, `_armBaseline`, `_update`, `_reset` — but class FIELDS
 * (`actions`, `_owner`, `_ownership`, `_availability`, `_wasAvailable`) are
 * assigned per-instance in the constructor, never on the prototype, so
 * reflection alone cannot see them; they are listed explicitly instead.
 * `__proto__` and `prototype` are listed for the same reason `constructor`
 * already is: an action map built from
 * attacker- or tool-generated config (modding, a level editor's save format)
 * must reject them exactly like any other collision rather than silently
 * reaching into the prototype chain via `Object.assign`.
 *
 * `Object.getOwnPropertyNames(Object.prototype)` covers the remaining gap:
 * `toString`, `valueOf`, `hasOwnProperty`, `__defineGetter__`, and friends
 * are never declared on `ActionMapBase.prototype` itself, but an action
 * named after one of them would still shadow the real, inherited method on
 * this very instance via `Object.assign`, silently breaking anything that
 * calls it.
 */
const reservedActionMapNames: ReadonlySet<string> = new Set([
  'actions',
  '_owner',
  '_ownership',
  '_availability',
  '_wasAvailable',
  '__proto__',
  'prototype',
  ...Object.getOwnPropertyNames(ActionMapBase.prototype),
  ...Object.getOwnPropertyNames(Object.prototype),
]);

/**
 * Constructing an `ActionMap` returns the map's own members *and* the actions
 * it was built from. TypeScript cannot express that through `extends` on a
 * generic parameter, so the merged shape is applied to the constructor here.
 */
type ActionMapConstructor = new <T extends ActionRecord>(actions: T) => ActionMapBase<T> & Readonly<T>;

export const ActionMap = ActionMapBase as unknown as ActionMapConstructor;

/** A constructed action map together with its actions. */
export type ActionMap<T extends ActionRecord = ActionRecord> = ActionMapBase<T> & Readonly<T>;
