/**
 * Anything carrying the destroyed flag. Structural on purpose: `RenderTexture`
 * descends from `RenderTarget`, not from `Texture`, yet both reach the backend
 * through the same texture-binding entry point.
 */
interface Destroyable {
  readonly destroyed: boolean;
}

/**
 * Guards against handing a destroyed GPU resource back to a backend.
 *
 * Both assertions throw in **every** build, not just under `__DEV__`. Using a
 * released resource is undefined behaviour at the driver level: WebGL2 silently
 * renders nothing or samples garbage, WebGPU raises a validation error on a
 * later frame, and either way the symptom surfaces far from the call that
 * caused it. Stripping the check in production would remove it from exactly the
 * builds where the resulting bug is hardest to trace.
 *
 * This matches what the rest of the engine already does - `Sprite.setTexture()`
 * and `Container.addChildAt()` both throw unconditionally on a destroyed input.
 *
 * Cost is a single branch on a path that already binds GPU state, so it does
 * not register against the surrounding work.
 */

export const assertLiveTexture = (texture: Destroyable): void => {
  if (texture.destroyed) {
    throw new Error(
      'Cannot bind a destroyed texture. It was passed to a renderer after `destroy()` had already run — ' +
        'check whether something released it while a node still referenced it. ' +
        'A RenderTexture returned by `RenderingContext.capture()` belongs to the caller; one obtained from ' +
        "the backend's temporary pool must be handed back with `releaseRenderTexture()` rather than destroyed.",
    );
  }
};

export const assertLiveRenderTarget = (target: Destroyable): void => {
  if (target.destroyed) {
    throw new Error(
      'Cannot render into a destroyed render target. It was activated after `destroy()` had already run — ' +
        'check whether something released it while a render pass still referenced it.',
    );
  }
};
