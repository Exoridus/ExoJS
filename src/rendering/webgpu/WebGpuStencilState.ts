/// <reference types="@webgpu/types" />

import { stencilAttachmentFormat } from './WebGpuStencilClipper';

const stencilContentFace: GPUStencilFaceState = {
  compare: 'equal',
  failOp: 'keep',
  depthFailOp: 'keep',
  passOp: 'keep',
};

/**
 * The `depthStencil` pipeline state for a content pipeline (sprite / mesh / text
 * / particle) rendered while a geometric stencil clip is active. Tests
 * `stencil == reference` (the reference is set per-pass via
 * `setStencilReference`), never writes the stencil aspect, and leaves depth
 * inert (matching the clip pass's `depthReadOnly` attachment).
 *
 * Returned fresh per call because `GPURenderPipelineDescriptor` consumers may
 * retain the object. Pipelines that omit this state (no active clip) must run in
 * a pass without a depth/stencil attachment — the two variants are never
 * interchangeable, so callers key their pipeline cache on the stencil flag.
 * @internal
 */
export function stencilContentDepthStencilState(): GPUDepthStencilState {
  return {
    format: stencilAttachmentFormat,
    depthWriteEnabled: false,
    depthCompare: 'always',
    stencilFront: stencilContentFace,
    stencilBack: stencilContentFace,
    stencilReadMask: 0xff,
    stencilWriteMask: 0,
  };
}
