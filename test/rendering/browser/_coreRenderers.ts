import type { RenderingApplicationOptions } from '#core/application/ApplicationOptions';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { DrawableConstructor } from '#rendering/Renderer';

/**
 * Wire the built-in core renderers (Sprite, Mesh, Text/BitmapText, Video) into
 * a bare backend created directly in a browser test.
 *
 * Production code registers these via `materializeRendererBindings` inside
 * `Application.createBackend`. Browser tests that construct a backend directly
 * (bypassing Application) must do the same explicitly - the backend no longer
 * self-registers core renderers.
 *
 * Focused fixtures may supply `targets` to materialize only the bindings their
 * scene uses. A shared multi-target binding stays intact. The default remains
 * the complete core renderer set.
 */
export const wireCoreRenderers = (
  backend: RenderBackend,
  rendering: RenderingApplicationOptions = {},
  targets?: readonly DrawableConstructor[],
): void => {
  const bindings = buildCoreRendererBindings(rendering);

  materializeRendererBindings(
    backend,
    targets === undefined ? bindings : bindings.filter(binding => binding.targets.some(target => targets.includes(target))),
  );
};
