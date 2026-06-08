import type { Color } from '#core/Color';
import type { RenderTarget } from '#rendering/RenderTarget';
import type { View } from '#rendering/View';

/**
 * Whether a render pass carries a stencil attachment.
 *
 * WebGL2 stencil is ambient per-target GL state, so this flag is largely
 * informational there; the WebGPU backend uses it to
 * decide whether a pass descriptor needs a `depthStencilAttachment`.
 * @internal
 */
export enum StencilAttachmentMode {
  None = 0,
  Enabled = 1,
}

/** Load behaviour for a pass's colour attachment. @internal */
export type RenderPassLoad = 'clear' | 'load';

/**
 * Backend-agnostic description of a single render pass: which target and view
 * it draws into, whether it clears or loads its colour attachment, and whether
 * it carries a stencil attachment.
 *
 * WebGL2 maps this onto ambient framebuffer / viewport / scissor / stencil
 * state; WebGPU maps it onto a `GPURenderPassEncoder`.
 * @internal
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
  /** Whether this pass carries a stencil attachment. */
  readonly stencil: StencilAttachmentMode;
}

/**
 * Snapshot of the pass currently open on a {@link RenderPassCoordinator}. The
 * WebGPU coordinator exposes the live encoder alongside these fields from phase
 * 12D; the shared shape lives here so both backends agree on it.
 * @internal
 */
export interface ActiveRenderPass {
  readonly view: View;
  readonly stencilEnabled: boolean;
}
