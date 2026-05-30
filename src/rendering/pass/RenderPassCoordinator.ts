import type { Matrix } from '@/math/Matrix';
import type { Rectangle } from '@/math/Rectangle';

import type { Geometry } from '../geometry/Geometry';
import type { RenderTarget } from '../RenderTarget';
import type { View } from '../View';
import type { RenderPassDescriptor, RenderPassLoad } from './RenderPassDescriptor';

/**
 * Internal, backend-owned owner of render-pass lifecycle: target / view / clear
 * orchestration, the scissor and stencil-clip stacks, and — on WebGPU, from
 * phase 12D — the active `GPURenderPassEncoder`.
 *
 * There is no public RenderPass API. This abstraction exists so the WebGL2 and
 * WebGPU backends can share the orchestration shape that geometric stencil
 * clipping needs, while each maps it onto its own state model: WebGL2 onto
 * ambient GL state (bound framebuffer, viewport, scissor, stencil), WebGPU onto
 * explicit render passes built up front with their attachments.
 * @internal
 */
export interface RenderPassCoordinator {
  /** The target the active pass draws into (the backend root when idle). */
  readonly activeTarget: RenderTarget;
  /** The view the active pass renders with. */
  readonly activeView: View;
  /** Whether a pass is currently open. */
  readonly hasActivePass: boolean;

  /** Open a pass for `descriptor`, applying its target / view / clear / stencil state. */
  beginPass(descriptor: RenderPassDescriptor): void;
  /** Close the active pass, flushing any pending draws into it. */
  endPass(): void;
  /**
   * Run `body` inside a child pass described by `descriptor`, restoring the
   * previous target and view afterwards — even if `body` throws. Preserves the
   * save / restore semantics of {@link RenderTargetPass}.
   */
  withChildPass(descriptor: RenderPassDescriptor, body: () => void): void;

  /** Push an axis-aligned scissor rectangle; nested rectangles intersect. */
  pushScissorRect(bounds: Rectangle): void;
  /** Pop the most recently pushed scissor rectangle. */
  popScissorRect(): void;

  /** Push a geometric stencil clip — the `shape` silhouette under `transform`. */
  pushStencilClip(shape: Geometry, transform: Matrix): void;
  /** Pop the most recently pushed stencil clip. */
  popStencilClip(): void;

  /**
   * Decide whether `target` should be cleared or loaded given an explicit clear
   * request. Centralizes the clear-vs-load / content-preservation decision so a
   * render texture's contents survive across multiple passes in one frame.
   */
  resolveLoad(target: RenderTarget, clearRequested: boolean): RenderPassLoad;
}
