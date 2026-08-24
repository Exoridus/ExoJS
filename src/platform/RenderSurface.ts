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

/**
 * Whether `surface` is a canvas element in a document, and so carries the DOM
 * affordances (style, layout box, event target, parent element) that an
 * `OffscreenCanvas` does not.
 *
 * Realm-safe: `HTMLCanvasElement` is not defined in a worker, where the answer
 * is always `false`.
 */
export const isDomCanvas = (surface: RenderSurface): surface is HTMLCanvasElement =>
  typeof HTMLCanvasElement !== 'undefined' && surface instanceof HTMLCanvasElement;

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
