import type { Application } from '#core/Application';
import type { Destroyable } from '#core/types';
import type { InputBinding, InputBindingOptions, InputChannel } from '#input/InputBinding';

/**
 * Scene-bound input facade. Bindings created here are automatically unbound
 * when the owning scene ends permanently. Access via {@link Scene.inputs}.
 *
 * Delegates to `app.input` for every binding — this facade adds no second
 * input clock, it only tracks what it created so it can unbind on teardown.
 * Pause-aware availability (the `when` binding option) is introduced by a
 * later slice; today every binding behaves exactly like an `app.input`
 * binding, just auto-cleaned-up with the scene.
 */
export class SceneInputs implements Destroyable {
  private readonly _bindings = new Set<InputBinding>();

  public constructor(private readonly _app: Application) {}

  public onStart(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    return this._track(this._app.input.onStart(channel, callback, options));
  }

  public onActive(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    return this._track(this._app.input.onActive(channel, callback, options));
  }

  public onStop(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    return this._track(this._app.input.onStop(channel, callback, options));
  }

  public onTrigger(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    return this._track(this._app.input.onTrigger(channel, callback, options));
  }

  /**
   * Disable every tracked binding without unbinding it. Reserved for
   * retention (suspend/resume) — a later slice wires this to actual
   * suspend/restore transitions. No-op today beyond bookkeeping-free
   * pass-through, since nothing suspends a scene yet.
   * @internal
   */
  public suspend(): void {
    // Wired by a later slice alongside retained-scene suspension.
  }

  /** Restore normal dispatch after {@link SceneInputs.suspend}. @internal */
  public resume(): void {
    // Wired by a later slice alongside retained-scene suspension.
  }

  public destroy(): void {
    for (const binding of this._bindings) {
      binding.unbind();
    }

    this._bindings.clear();
  }

  private _track(binding: InputBinding): InputBinding {
    this._bindings.add(binding);

    return binding;
  }
}
