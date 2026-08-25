import type { MockInstance } from 'vitest';
import { vi } from 'vitest';

/**
 * Route every `HTMLCanvasElement.getContext(...)` call to a freshly built 2D
 * stub, and return the spy so the caller can restore it.
 *
 * The cast is not optional: `getContext` is overloaded, and TypeScript resolves
 * a spy against the LAST declared overload, which is the WebGPU one contributed
 * by `@webgpu/types` - not the `'2d'` one a canvas stub satisfies.
 */
export const stubCanvas2dContext = (create: () => CanvasRenderingContext2D): MockInstance =>
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => create() as unknown as GPUCanvasContext);
