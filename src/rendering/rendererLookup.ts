import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';

/**
 * The renderer registry as the frame path is willing to see it: present or not,
 * and answering with something whose type nobody here commits to.
 *
 * `RenderBackend.rendererRegistry` is declared as required and typed, so this
 * looks redundant - but the plan and material paths run against whatever object
 * a caller passes as a backend, including a partial one from a test, and they
 * have to survive a missing registry rather than throw on property access. The
 * result stays `unknown` because each call site is interested in a different
 * optional member of the renderer, not in `Renderer` itself.
 */
export interface RendererLookup {
  resolve(drawable: Drawable): unknown;
}

/** The lookup a backend offers, or `null` when it has none usable. */
export const rendererLookupOf = (backend: RenderBackend | null): RendererLookup | null => {
  const registry = (backend as { readonly rendererRegistry?: RendererLookup } | null)?.rendererRegistry;

  return registry && typeof registry.resolve === 'function' ? registry : null;
};

/**
 * The renderer registered for `drawable`, or `null` when there is no usable
 * registry or resolution fails.
 *
 * Resolution throwing is ordinary: a custom drawable with no registered
 * renderer reaches here on the normal path, and every caller answers that the
 * same way it answers a missing registry - with the conservative default.
 */
export const resolveRendererFor = (backend: RenderBackend | null, drawable: Drawable): unknown => {
  const registry = rendererLookupOf(backend);

  if (registry === null) return null;

  try {
    return registry.resolve(drawable);
  } catch {
    return null;
  }
};
