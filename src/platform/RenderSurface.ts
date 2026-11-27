/**
 * Anything a render backend can acquire a drawing context from and size in
 * device pixels.
 *
 * Deliberately narrow: a surface has a backing-store size and hands out a
 * WebGL2 or WebGPU context, and that is the whole contract the backends need.
 * Focus, cursor, pointer capture, CSS, layout and the surrounding document are
 * interaction concerns and live on {@link PlatformAdapter} instead, because an
 * `OffscreenCanvas` has none of them and faking them would only move the
 * failure later.
 */
export type RenderSurface = HTMLCanvasElement | OffscreenCanvas;

type DomBrand = 'HTMLCanvasElement' | 'HTMLImageElement' | 'HTMLVideoElement' | 'OffscreenCanvas';

/**
 * Whether `value` is a platform object of the interface `brand`, whichever realm
 * created it.
 *
 * Not `instanceof`: that compares against the constructors of the realm the
 * check runs in, so an element from a same-origin iframe's document fails it,
 * and a worker defines none of the element constructors at all.
 * @internal
 */
export const hasDomBrand = <B extends DomBrand>(value: unknown, brand: B): value is InstanceType<(typeof globalThis)[B]> =>
  typeof value === 'object' && value !== null && Object.prototype.toString.call(value) === `[object ${brand}]`;

/**
 * Whether `surface` is a canvas element in a document, and so carries the DOM
 * affordances (style, layout box, event target, parent element) that an
 * `OffscreenCanvas` does not.
 *
 * A canvas from another frame's document qualifies; in a worker the answer is
 * always `false`.
 */
export const isDomCanvas = (surface: RenderSurface): surface is HTMLCanvasElement => hasDomBrand(surface, 'HTMLCanvasElement');

/**
 * The 2D context of either canvas kind, or `null` when the surface is already
 * bound to a different context type.
 *
 * The branch is not redundant: `getContext` is overloaded per canvas kind, and
 * calling it on the union collapses the result to the widest context type the
 * host's DOM typings know.
 */
export const get2dContext = (surface: RenderSurface): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null =>
  isDomCanvas(surface) ? surface.getContext('2d') : surface.getContext('2d');

/** The WebGL2 context of either canvas kind. See {@link get2dContext}. */
export const getWebGl2Context = (surface: RenderSurface, attributes?: WebGLContextAttributes): WebGL2RenderingContext | null =>
  isDomCanvas(surface) ? surface.getContext('webgl2', attributes) : surface.getContext('webgl2', attributes);

/** The WebGPU context of either canvas kind. See {@link get2dContext}. */
export const getWebGpuContext = (surface: RenderSurface): GPUCanvasContext | null =>
  isDomCanvas(surface) ? surface.getContext('webgpu') : surface.getContext('webgpu');
