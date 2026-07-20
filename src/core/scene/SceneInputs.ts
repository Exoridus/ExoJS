import type { Application } from '#core/Application';
import { SceneState } from '#core/SceneState';
import type { Destroyable } from '#core/types';
import type { InputBinding, InputBindingOptions, InputChannel } from '#input/InputBinding';

/** Visible-scene states in which a {@link SceneInputs} binding may dispatch. Default: `'active'`. */
export type SceneInputAvailability = 'active' | 'paused' | 'always';

/** Construction options for every {@link SceneInputs} factory method. */
export interface SceneInputBindingOptions extends InputBindingOptions {
  /** Visible scene states in which this binding may dispatch. Default: `'active'`. */
  readonly when?: SceneInputAvailability;
}

const gatedStates = new Set<SceneState>([SceneState.Preparing, SceneState.Suspended, SceneState.Destroying, SceneState.Destroyed]);

function whenPolicyAllows(when: SceneInputAvailability, state: SceneState): boolean {
  if (gatedStates.has(state)) {
    return false;
  }

  if (when === 'always') {
    return true;
  }

  return when === 'active' ? state === SceneState.Active : state === SceneState.Paused;
}

type BindingKind = 'onStart' | 'onActive' | 'onStop' | 'onTrigger';

/**
 * Every `SceneInputs.onXxx()` call must construct exactly one underlying
 * {@link InputBinding} (via a single `app.input` factory call) and wire the
 * edge-rule bookkeeping onto that one binding's own `onStart`/`onActive`/
 * `onStop`/`onTrigger` signals — `InputManager.onStart`/`onActive`/`onStop`/
 * `onTrigger` each construct a *fresh, independent* `InputBinding` internally
 * (confirmed in `src/input/InputManager.ts`), so calling two different
 * `SceneInputs` factories for "the same" channel would silently create two
 * unrelated bindings with two unrelated edge-rule sessions. `onStart` is used
 * as the anchor factory call below purely to obtain the binding object —
 * every one of the four `InputManager` factories constructs an identical
 * binding underneath (`createBinding(channel, options)`), so which one is
 * used to obtain the reference makes no behavioral difference.
 */

/**
 * Scene-bound input facade. Bindings created here are automatically unbound
 * when the owning scene ends permanently. Access via {@link Scene.inputs}.
 *
 * Delegates to `app.input` for every binding — this facade adds no second
 * input clock, it only tracks what it created so it can unbind on teardown.
 * Every factory accepts a `when` option (default `'active'`) controlling
 * which {@link SceneState}s the binding may dispatch in; a trigger only
 * fires when both its press and release edges occurred in an allowed state
 * (definition §13.2).
 */
export class SceneInputs implements Destroyable {
  private readonly _bindings = new Set<InputBinding>();
  private _suspended = false;

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
  ) {}

  public onStart(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: SceneInputBindingOptions): InputBinding {
    return this._bind('onStart', channel, callback, options);
  }

  public onActive(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: SceneInputBindingOptions): InputBinding {
    return this._bind('onActive', channel, callback, options);
  }

  public onStop(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: SceneInputBindingOptions): InputBinding {
    return this._bind('onStop', channel, callback, options);
  }

  public onTrigger(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: SceneInputBindingOptions): InputBinding {
    return this._bind('onTrigger', channel, callback, options);
  }

  /**
   * Disable every tracked binding's dispatch without unbinding it. Reserved
   * for retention (suspend/resume). Independent of the `when` policy — a
   * suspended facade dispatches nothing regardless of `when`.
   */
  public suspend(): void {
    this._suspended = true;
  }

  /** Restore normal `when`-policy dispatch after {@link SceneInputs.suspend}. */
  public resume(): void {
    this._suspended = false;
  }

  public destroy(): void {
    for (const binding of this._bindings) {
      binding.unbind();
    }

    this._bindings.clear();
  }

  private _bind(
    kind: BindingKind,
    channel: InputChannel | readonly InputChannel[],
    callback: (value: number) => void,
    options?: SceneInputBindingOptions,
  ): InputBinding {
    const when = options?.when ?? 'active';
    const forwarded: InputBindingOptions | undefined =
      options === undefined ? undefined : { ...(options.threshold !== undefined && { threshold: options.threshold }), ...(options.gamepadSlot !== undefined && { gamepadSlot: options.gamepadSlot }) };

    let primed = false;

    const allowedNow = (): boolean => !this._suspended && !this._app.scenes._transitionGateOpen && whenPolicyAllows(when, this._getState());

    // Anchor call — see the BindingKind comment above for why `onStart`
    // specifically is used regardless of `kind`.
    const binding = this._app.input.onStart(
      channel,
      (value: number) => {
        primed = allowedNow();

        if (kind === 'onStart' && primed) {
          callback(value);
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
        callback(value);
      }
    });

    binding.onStop.add((value: number) => {
      // Both the press edge (primed) and the release edge (allowedNow(),
      // checked live) must be allowed for the trigger to fire (definition
      // §13.2) — checked live here since a same-frame disallow-then-release
      // with no intervening onActive tick would otherwise be missed.
      //
      // `primed` is intentionally NOT reset here: the real InputBinding
      // dispatches onTrigger (if the release is within the threshold)
      // immediately after onStop within the same synchronous update() call,
      // and it needs to see the same `primed` value this onStop handler
      // just read. The next press's onStart handler always overwrites
      // `primed` unconditionally, so a stale value between releases and the
      // next press is harmless — nothing else reads it in between (the real
      // InputBinding cannot dispatch onActive/onStop/onTrigger again without
      // a fresh onStart first).
      if (kind === 'onStop' && primed && allowedNow()) {
        callback(value);
      }
    });

    binding.onTrigger.add((value: number) => {
      if (kind === 'onTrigger' && primed && allowedNow()) {
        callback(value);
      }
    });

    this._bindings.add(binding);

    return binding;
  }
}
