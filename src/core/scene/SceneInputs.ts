import type { Application } from '#core/Application';
import { SceneAvailability } from '#core/SceneAvailability';
import { SceneState } from '#core/SceneState';
import type { Destroyable } from '#core/types';
import type { ActionMap, ActionRecord, AnyActionMap } from '#input/actions/ActionMap';
import type { InputScope } from '#input/actions/InputScope';
import { scopeOfActionMap } from '#input/actions/InputScope';
import { ScopeLevel } from '#input/actions/ScopeLevel';
import type { ActionSample } from '#input/actions/types';
import type { Gamepad } from '#input/Gamepad';
import type { InputBinding, InputBindingOptions, InputChannel } from '#input/InputBinding';

/** Construction options for every {@link SceneInputs} factory method. */
export interface SceneInputBindingOptions extends InputBindingOptions {
  /** Visible scene states in which this binding may dispatch. Default: `'active'`. */
  readonly when?: SceneAvailability;
}

/** Availability policy for a scene-owned ActionMap. */
export interface SceneActionMapOptions {
  /** Visible scene states in which this map may sample. Default: `'active'`. */
  readonly when?: SceneAvailability;
}

const gatedStates = new Set<SceneState>([SceneState.Preparing, SceneState.Ready, SceneState.Suspended, SceneState.Destroying, SceneState.Destroyed]);

const whenPolicyAllows = (when: SceneAvailability, state: SceneState, paused: boolean): boolean => {
  if (gatedStates.has(state)) {
    return false;
  }

  if (when === SceneAvailability.Always) {
    return true;
  }

  return when === SceneAvailability.Active ? !paused : paused;
};

type BindingKind = 'onStart' | 'onActive' | 'onStop' | 'onTrigger';

/**
 * Every `SceneInputs.onXxx()` call must construct exactly one underlying
 * {@link InputBinding} (via a single `app.input` factory call) and wire the
 * edge-rule bookkeeping onto that one binding's own `onStart`/`onActive`/
 * `onStop`/`onTrigger` signals - `InputManager.onStart`/`onActive`/`onStop`/
 * `onTrigger` each construct a *fresh, independent* `InputBinding` internally
 * (confirmed in `src/input/InputManager.ts`), so calling two different
 * `SceneInputs` factories for "the same" channel would silently create two
 * unrelated bindings with two unrelated edge-rule sessions. `onStart` is used
 * as the anchor factory call below purely to obtain the binding object -
 * every one of the four `InputManager` factories constructs an identical
 * binding underneath (`createBinding(channel, options)`), so which one is
 * used to obtain the reference makes no behavioral difference.
 */

/**
 * Scene-bound input facade. Bindings created here are automatically unbound
 * when the owning scene ends permanently. Access via {@link Scene.inputs}.
 *
 * Delegates to `app.input` for every binding - this facade adds no second
 * input clock, it only tracks what it created so it can unbind on teardown.
 * Every factory accepts a `when` option (default `'active'`) controlling
 * which {@link SceneState}s the binding may dispatch in; a trigger only
 * fires when both its press and release edges occurred in an allowed state.
 */
export class SceneInputs implements Destroyable {
  private readonly _bindings = new Set<InputBinding>();
  /**
   * Maps attached directly with {@link SceneInputs.attach}. They sit BELOW
   * every pushed scope, so ordinary gameplay controls need no wrapper scope for
   * an overlay pushed on top of them to take priority.
   */
  private readonly _base = new ScopeLevel();
  private readonly _scopes: InputScope[] = [];
  private readonly _scopeLevels = new Map<InputScope, ScopeLevel>();
  private readonly _scopeAvailability = new Map<InputScope, SceneAvailability>();
  /** Reused across frames so a per-frame claim pass allocates nothing. */
  private readonly _masked = new Set<number>();
  private _tracked = false;
  private _suspended = false;

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
    private readonly _getPaused: () => boolean,
  ) {}

  /** The four gamepad slot mailboxes, the same ones `app.input.gamepads` exposes. */
  public get gamepads(): readonly [Gamepad, Gamepad, Gamepad, Gamepad] {
    return this._app.input.gamepads;
  }

  /** Currently connected pads, in slot order. */
  public get connectedGamepads(): readonly Gamepad[] {
    return this._app.input.connectedGamepads;
  }

  /** One gamepad slot mailbox. The slot exists whether or not a pad is plugged in. */
  public getGamepad(slot: 0 | 1 | 2 | 3): Gamepad {
    return this._app.input.getGamepad(slot);
  }

  /** The input scope stack, bottom first. The last entry has priority. */
  public get scopes(): readonly InputScope[] {
    return this._scopes;
  }

  /**
   * Put `scope` on top of this scene's scope stack.
   *
   * From now until it is popped, the controls its maps bind are invisible to
   * every scope below it and to maps attached with {@link SceneInputs.attach}.
   * Controls it does not bind still reach them.
   *
   * Its maps are attached here and detached on pop, so a scope's maps live and
   * die with their place on the stack.
   *
   * @throws {Error} If `scope` is already on this stack.
   */
  public pushScope(scope: InputScope, options: SceneActionMapOptions = {}): InputScope {
    if (this._scopeLevels.has(scope)) {
      throw new Error('SceneInputs: this InputScope is already on the stack.');
    }

    this._scopes.push(scope);
    this._scopeLevels.set(scope, new ScopeLevel());
    this._scopeAvailability.set(scope, options.when ?? SceneAvailability.Active);
    this._syncScope(scope);
    this._track();

    return scope;
  }

  /**
   * Take `scope` - or the topmost one when omitted - off the stack and detach
   * its maps. Returns the removed scope, or `null` when it was not on the
   * stack.
   *
   * Every level that regains a control the scope was claiming re-baselines
   * against the live channel state, so a button still held when a menu closes
   * does not read as a fresh press underneath it.
   */
  public popScope(scope?: InputScope): InputScope | null {
    const target = scope ?? this._scopes.at(-1);

    if (target === undefined) {
      return null;
    }

    const index = this._scopes.indexOf(target);

    if (index === -1) {
      return null;
    }

    this._scopes.splice(index, 1);

    const level = this._scopeLevels.get(target);

    this._scopeLevels.delete(target);
    this._scopeAvailability.delete(target);

    if (level !== undefined) {
      for (const map of [...level.maps]) {
        level.delete(map);
        map.detach();
      }
    }

    return target;
  }

  /**
   * Sample every level of the stack for this frame, top first, masking each
   * lower level with everything the levels above it claim.
   *
   * @internal
   */
  public _updateScopes(sample: ActionSample): void {
    if (this._suspended) {
      return;
    }

    const masked = this._masked;

    masked.clear();

    for (let i = this._scopes.length - 1; i >= 0; i--) {
      const scope = this._scopes[i]!;

      this._syncScope(scope);
      this._scopeLevels.get(scope)?.update(this, sample, masked);
      scope._claimChannels(masked);
    }

    this._base.update(this, sample, masked);
  }

  /**
   * Attach maps that were added to `scope` after it was pushed, and drop maps
   * that were removed from it. A scope is a live collection, so membership is
   * reconciled rather than snapshotted at push time.
   */
  private _syncScope(scope: InputScope): void {
    const level = this._scopeLevels.get(scope);

    if (level === undefined) {
      return;
    }

    const when = this._scopeAvailability.get(scope) ?? SceneAvailability.Active;

    for (const map of scope.maps) {
      if (level.maps.has(map)) {
        continue;
      }

      if (this._base.maps.has(map)) {
        throw new Error('SceneInputs: this ActionMap is already attached directly. Detach it before putting it in an InputScope.');
      }

      map._attach(this, () => this._allowedNow(when));
      level.add(map);
    }

    for (const map of [...level.maps]) {
      if (!scope.maps.includes(map)) {
        level.delete(map);
        map.detach();
      }
    }
  }

  /**
   * Register with the one input clock, once, as soon as there is anything to
   * sample. A facade that only creates `on*` bindings never reaches the clock
   * at all - those are driven by the manager's own binding list.
   */
  private _track(): void {
    if (this._tracked || this._suspended || (this._base.maps.size === 0 && this._scopes.length === 0)) {
      return;
    }

    this._tracked = true;
    this._app.input._trackScopeHost(this);
  }

  /**
   * Update `map` for as long as this scene lives, then detach it. A suspended
   * scene stops feeding its maps and resets every action, so a key held across
   * the suspend does not surface as a fresh press on resume.
   */
  public attach<T extends ActionRecord>(map: ActionMap<T>, options: SceneActionMapOptions = {}): ActionMap<T> {
    const when = options.when ?? SceneAvailability.Active;

    // A map sits on exactly one level of the stack. On two, it would be
    // sampled twice per frame against two different (masked and unmasked)
    // samples, which reads to its ownership tracker as a fresh owner every
    // single frame and re-baselines every action forever.
    if (scopeOfActionMap(map) !== undefined) {
      throw new Error('SceneInputs: this ActionMap belongs to an InputScope. Push the scope instead of attaching the map directly.');
    }

    map._attach(this, () => this._allowedNow(when));
    this._base.add(map);
    this._track();

    return map;
  }

  /**
   * Browser-default capture is forwarded, never held here: the manager keeps
   * the single refcount, so a key bound by a scene map and by a direct binding
   * is one entry with two claims rather than two ledgers that can disagree.
   *
   * @internal
   */
  public _retainActionMapCapture(map: AnyActionMap): void {
    this._app.input._retainActionMapCapture(map);
  }

  /** @internal */
  public _refreshActionMapCapture(map: AnyActionMap): void {
    this._app.input._refreshActionMapCapture(map);
  }

  /** @internal */
  public _releaseActionMapCapture(map: AnyActionMap): void {
    this._app.input._releaseActionMapCapture(map);
  }

  /** Stop updating `map`. Called by {@link ActionMap.detach}. @internal */
  public _detachActionMap(map: AnyActionMap): void {
    if (this._base.delete(map)) {
      return;
    }

    for (const level of this._scopeLevels.values()) {
      if (level.delete(map)) {
        return;
      }
    }
  }

  /**
   * Whether `when` currently permits dispatch - suspend and the director's
   * transition gate override every policy unconditionally, `when` itself is
   * then resolved against the live scene state/paused flag by
   * {@link whenPolicyAllows}. The single source of truth for both a
   * scene-owned {@link ActionMap} (see {@link SceneInputs.attach}) and every
   * `on*` binding (see {@link SceneInputs._bind}) - the two must never drift
   * apart, so neither inlines this check itself.
   */
  private _allowedNow(when: SceneAvailability): boolean {
    return !this._suspended && !this._app.scenes._transitionGateOpen && whenPolicyAllows(when, this._getState(), this._getPaused());
  }

  /**
   * Forwards to the underlying `InputManager` - see
   * `InputManager._currentBatchSequence`'s doc comment. Implementing this
   * lets a map attached here (rather than directly on `app.input`) get the
   * same mid-frame-attach protection.
   *
   * @internal
   */
  public _currentBatchSequence(): number {
    return this._app.input._currentBatchSequence();
  }

  /**
   * Forwards to the underlying `InputManager` - see
   * `InputManager._snapshotActionChannels`'s doc comment. Lets a map
   * attached here get the same attach-time baseline truth as one attached
   * directly on `app.input`.
   *
   * @internal
   */
  public _snapshotActionChannels(): Float32Array {
    return this._app.input._snapshotActionChannels();
  }

  /**
   * Fire `callback` on the channel's press edge (value crosses above the
   * threshold), gated by `options.when` (default `'active'`) and the
   * director's transition gate. Unbound automatically when the owning scene
   * ends permanently.
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value. Optional, as in {@link SceneInputs.onActive}.
   * @param options - Binding options, including the `when` policy.
   * @returns The binding, so it can be polled or unbound.
   */
  public onStart(channel: InputChannel | readonly InputChannel[], callback?: (value: number) => void, options?: SceneInputBindingOptions): InputBinding {
    return this._bind('onStart', channel, callback, options);
  }

  /**
   * Fire `callback` every frame the channel stays held above the threshold,
   * same `when`/edge-rule gating as {@link SceneInputs.onStart}.
   *
   * The callback is optional: with none, this just creates and tracks the
   * binding, which is the idiomatic way to poll an input per frame - read
   * {@link InputBinding.active} / {@link InputBinding.value} in your own
   * `update()` instead of tracking held-state in a callback.
   *
   * Note that polling reads the raw binding state, which the `when` policy
   * does not gate - only callback dispatch is gated. A scene that polls while
   * paused must check its own state.
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value, once per frame while active.
   * @param options - Binding options, including the `when` policy.
   * @returns The binding, so it can be polled or unbound.
   *
   * @example
   * ```ts
   * const right = this.inputs.onActive([Keyboard.D, Keyboard.Right]);
   * // later, in update():
   * if (right.active) this.x += speed * delta;
   * ```
   */
  public onActive(channel: InputChannel | readonly InputChannel[], callback?: (value: number) => void, options?: SceneInputBindingOptions): InputBinding {
    return this._bind('onActive', channel, callback, options);
  }

  /**
   * Fire `callback` on the channel's release edge, same `when`/edge-rule
   * gating as {@link SceneInputs.onStart}.
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value. Optional, as in {@link SceneInputs.onActive}.
   * @param options - Binding options, including the `when` policy.
   * @returns The binding, so it can be polled or unbound.
   */
  public onStop(channel: InputChannel | readonly InputChannel[], callback?: (value: number) => void, options?: SceneInputBindingOptions): InputBinding {
    return this._bind('onStop', channel, callback, options);
  }

  /**
   * Fire `callback` once a press-then-release completes within the
   * threshold window - a "tap" or "click" gesture. Both the press and
   * release edges must have occurred in a `when`-allowed state for the
   * trigger to fire: pressing while allowed, then the
   * scene pausing before release, does not trigger.
   *
   * @param channel - Channel, or channels, to watch.
   * @param callback - Receives the channel value. Optional, as in {@link SceneInputs.onActive}.
   * @param options - Binding options, including the `when` policy.
   * @returns The binding, so it can be polled or unbound.
   */
  public onTrigger(channel: InputChannel | readonly InputChannel[], callback?: (value: number) => void, options?: SceneInputBindingOptions): InputBinding {
    return this._bind('onTrigger', channel, callback, options);
  }

  /**
   * Disable every tracked binding's dispatch without unbinding it. Reserved
   * for retention (suspend/resume). Independent of the `when` policy - a
   * suspended facade dispatches nothing regardless of `when`.
   */
  public suspend(): void {
    this._suspended = true;

    if (this._tracked) {
      this._tracked = false;
      this._app.input._detachScopeHost(this);
    }

    this._base.reset();

    for (const level of this._scopeLevels.values()) {
      level.reset();
    }
  }

  /**
   * Restore normal `when`-policy dispatch after {@link SceneInputs.suspend}.
   * Each map is resynced against the current real channel state before it
   * resumes being sampled - a source still held across the suspend must not
   * surface as a synthetic press the instant this scene wakes back up.
   */
  public resume(): void {
    this._suspended = false;
    this._track();

    if (!this._tracked) {
      return;
    }

    const sample = this._app.input._actionSample();
    const masked = this._masked;

    masked.clear();

    for (let i = this._scopes.length - 1; i >= 0; i--) {
      const scope = this._scopes[i]!;

      this._syncScope(scope);
      this._scopeLevels.get(scope)?.resync(this, sample, masked);
      scope._claimChannels(masked);
    }

    this._base.resync(this, sample, masked);
  }

  /** Unbind every tracked binding. Called automatically when the owning scene ends permanently. */
  public destroy(): void {
    for (const binding of this._bindings) {
      binding.unbind();
    }

    for (const map of [...this._base.maps]) {
      map.detach();
    }

    for (const level of this._scopeLevels.values()) {
      for (const map of [...level.maps]) {
        map.detach();
      }
    }

    if (this._tracked) {
      this._tracked = false;
      this._app.input._detachScopeHost(this);
    }

    this._bindings.clear();
    this._base.clear();
    this._scopes.length = 0;
    this._scopeLevels.clear();
    this._scopeAvailability.clear();
    this._masked.clear();
  }

  private _bind(
    kind: BindingKind,
    channel: InputChannel | readonly InputChannel[],
    callback: ((value: number) => void) | undefined,
    options?: SceneInputBindingOptions,
  ): InputBinding {
    const when = options?.when ?? SceneAvailability.Active;
    const forwarded: InputBindingOptions | undefined =
      options === undefined
        ? undefined
        : {
            ...(options.threshold !== undefined && { threshold: options.threshold }),
            ...(options.gamepadSlot !== undefined && { gamepadSlot: options.gamepadSlot }),
          };

    let primed = false;

    const allowedNow = (): boolean => this._allowedNow(when);

    // Anchor call - see the BindingKind comment above for why `onStart`
    // specifically is used regardless of `kind`.
    const binding = this._app.input.onStart(
      channel,
      (value: number) => {
        primed = allowedNow();

        if (kind === 'onStart' && primed) {
          callback?.(value);
        }
      },
      forwarded,
    );

    binding.onActive.add((value: number) => {
      if (!allowedNow()) {
        primed = false;

        return;
      }

      if (kind === 'onActive' && primed) {
        callback?.(value);
      }
    });

    binding.onStop.add((value: number) => {
      // Both the press edge (primed) and the release edge (allowedNow(),
      // checked live) must be allowed for the trigger to fire
      // - checked live here since a same-frame disallow-then-release
      // with no intervening onActive tick would otherwise be missed.
      //
      // `primed` is intentionally NOT reset here: the real InputBinding
      // dispatches onTrigger (if the release is within the threshold)
      // immediately after onStop within the same synchronous update() call,
      // and it needs to see the same `primed` value this onStop handler
      // just read. The next press's onStart handler always overwrites
      // `primed` unconditionally, so a stale value between releases and the
      // next press is harmless - nothing else reads it in between (the real
      // InputBinding cannot dispatch onActive/onStop/onTrigger again without
      // a fresh onStart first).
      if (kind === 'onStop' && primed && allowedNow()) {
        callback?.(value);
      }
    });

    binding.onTrigger.add((value: number) => {
      if (kind === 'onTrigger' && primed && allowedNow()) {
        callback?.(value);
      }
    });

    this._bindings.add(binding);

    return binding;
  }
}
