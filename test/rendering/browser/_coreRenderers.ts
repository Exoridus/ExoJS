import type { RenderingApplicationOptions } from '#core/Application';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import type { RenderBackend } from '#rendering/RenderBackend';

/**
 * Wire the built-in core renderers (Sprite, Mesh, Text/BitmapText) into a bare
 * backend created directly in a browser test.
 *
 * Production code registers these via `materializeRendererBindings` inside
 * `Application.createBackend`. Browser tests that construct a backend directly
 * (bypassing Application) must do the same explicitly — the backend no longer
 * self-registers core renderers.
 */
export function wireCoreRenderers(backend: RenderBackend, rendering: RenderingApplicationOptions = {}): void {
  materializeRendererBindings(backend, buildCoreRendererBindings(rendering));
}
