import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { DrawableConstructor, Renderer } from '#rendering/Renderer';

import type { RendererBinding } from './Extension';

/**
 * The drawable type a {@link DrawableConstructor} produces. Distributes over a
 * union of constructors, so a multi-target tuple yields the union of everything
 * its renderer has to accept.
 */
type DrawableOf<Target> = Target extends DrawableConstructor<infer Drawn> ? Drawn : never;

/**
 * A {@link Renderer} whose `render` is spelled as a function-typed property.
 *
 * TypeScript compares method signatures bivariantly, which would accept a
 * renderer narrower than the binding's target union (a `Text`-only renderer for
 * `[Text, BitmapText]`). A property signature is compared contravariantly, so
 * the renderer has to accept every declared target.
 */
type TargetStrictRenderer<Target extends Drawable> = Omit<Renderer<RenderBackend, Target>, 'render'> & {
  render: (drawable: Target) => void;
};

/**
 * Build a {@link RendererBinding} whose renderer is checked against its own
 * `targets` at the construction site.
 *
 * The binding array an {@link Extension} declares is erased to
 * `RendererBinding<Drawable>`, which accepts any renderer at all; this factory
 * infers the drawable union from `targets` instead, so a renderer that does not
 * handle every target is a compile error here rather than a wrong draw call at
 * runtime. `targets` is a non-empty tuple, making the emptiness the registry
 * rejects at runtime unrepresentable.
 *
 * All targets share the single renderer `create` returns. Returning `undefined`
 * means the backend is unsupported and skips the whole binding for it.
 * @advanced
 */
export const defineRendererBinding = <const Targets extends readonly [DrawableConstructor, ...DrawableConstructor[]]>(
  targets: Targets,
  create: (backend: RenderBackend) => TargetStrictRenderer<DrawableOf<Targets[number]>> | undefined,
): RendererBinding => ({ targets, create });
