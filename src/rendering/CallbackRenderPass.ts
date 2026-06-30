import type { Color } from '#core/Color';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

import { BackendTargetPass } from './BackendTargetPass';
import type { RenderingContext } from './RenderingContext';
import { RenderPass, type RenderPassOptions } from './RenderPass';
import type { View } from './View';

/** Options for {@link CallbackRenderPass}. @advanced */
export interface CallbackRenderPassOptions extends RenderPassOptions {
  /** View applied while the callback runs. Only meaningful with `target`. Default: `target.view`. */
  readonly view?: View;
  /**
   * Off-screen destination. When set, the callback runs redirected into this {@link RenderTexture} (save / restore).
   * `null` / omitted → the active target. Inside a target redirect, draw via `context.backend` (the active view is
   * the target's); `context.render(node)` would reset the view to `context.view`. Caller-owned and stable; never
   * allocated, pooled, resized, or destroyed by the pass.
   */
  readonly target?: RenderTexture | null;
  /** Clear the destination to this colour immediately before the callback runs. */
  readonly clear?: Color;
}

/**
 * Runs a user callback as one pass. The callback receives the {@link RenderingContext} (high-level:
 * `context.render(node)`, `context.backend` immediate draws, etc.). Set `options.target` to redirect the callback's
 * output into an off-screen {@link RenderTexture} (immediate-mode "scene" → texture).
 *
 * To run a low-level {@link BackendRenderPass} inside a pipeline, bridge it here:
 * `new CallbackRenderPass((context) => context.backend.execute(myBackendPass))`.
 *
 * `view`/`target`/`clear` are fixed at construction; the off-screen redirect is built once and reused every frame
 * (no per-frame allocation). `execute` is not re-entrant — a callback must not re-run the same pass instance; the
 * reentrancy guard keeps the redirect's active context from being clobbered. If your callback closes over owned GPU
 * resources, subclass {@link RenderPass} instead so you can override `destroy()`.
 * @advanced
 */
export class CallbackRenderPass extends RenderPass {
  private readonly _callback: (context: RenderingContext) => void;
  private readonly _clear: Color | null;
  private readonly _redirect: BackendTargetPass | null;
  private _activeContext: RenderingContext | null = null;
  private _executing = false;

  public constructor(callback: (context: RenderingContext) => void, options?: CallbackRenderPassOptions) {
    super(options);

    this._callback = callback;
    this._clear = options?.clear ?? null;

    const target = options?.target ?? null;

    this._redirect =
      target !== null
        ? new BackendTargetPass(() => this._runCallback(), {
            target,
            view: options?.view ?? target.view,
            ...(this._clear !== null && { clearColor: this._clear }),
          })
        : null;
  }

  public override execute(context: RenderingContext): void {
    if (this._executing) {
      throw new Error('CallbackRenderPass.execute is not re-entrant.');
    }

    this._executing = true;

    try {
      if (this._redirect !== null) {
        // Bridge the context into the prebuilt redirect; the reentrancy guard above guarantees this slot is
        // never overwritten while a callback is in flight.
        this._activeContext = context;

        try {
          context.backend.execute(this._redirect);
        } finally {
          this._activeContext = null;
        }

        return;
      }

      if (this._clear !== null) {
        context.backend.clear(this._clear);
      }

      this._callback(context);
    } finally {
      this._executing = false;
    }
  }

  private _runCallback(): void {
    if (this._activeContext !== null) {
      this._callback(this._activeContext);
    }
  }
}
