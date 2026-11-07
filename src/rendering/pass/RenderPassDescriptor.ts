import type { Color } from '#core/Color';
import type { RenderTarget } from '#rendering/RenderTarget';
import type { View } from '#rendering/View';

/**
 * Whether a render pass declares a stencil attachment.
 *
 * WebGPU attaches a stencil aspect when enabled. WebGL2 ignores this flag:
 * its stencil state follows the active target's geometric clip stack.
 * Geometric clips independently require stencil state and restrict draws
 * to the clipped region.
 */
export enum StencilAttachmentMode {
  None = 0,
  Enabled = 1,
}

/** Load behaviour for a pass's colour attachment. */
export type RenderPassLoad = 'clear' | 'load';

/**
 * Backend-agnostic description of a single render pass: which target and view
 * it draws into, whether it clears or loads its colour attachment, and whether
 * it carries a stencil attachment.
 *
 * WebGL2 maps this onto ambient framebuffer / viewport / scissor / stencil
 * state; WebGPU maps it onto a `GPURenderPassEncoder`.
 */
export interface RenderPassDescriptor {
  /** Target to draw into. `null` selects the backend's root (canvas) target. */
  readonly target: RenderTarget | null;
  /** View to render with. `null` inherits the target's current view. */
  readonly view: View | null;
  /** Whether the colour attachment is cleared or preserved when the pass begins. */
  readonly load: RenderPassLoad;
  /** Clear colour used when `load === 'clear'`. `null` keeps the backend's current clear colour. */
  readonly clearColor: Color | null;
  /** WebGPU stencil attachment request; ignored by WebGL2. */
  readonly stencil: StencilAttachmentMode;
}

/**
 * Snapshot of the state shared by an open pass on a
 * {@link RenderPassCoordinator}: the view it renders with and whether a stencil
 * attachment is active. The WebGPU coordinator's own active-pass object also
 * carries the live encoder.
 * @internal
 */
export interface ActiveRenderPass {
  readonly view: View;
  readonly stencilEnabled: boolean;
}
