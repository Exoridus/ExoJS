/// <reference types="@webgpu/types" />

/**
 * The portable depth/stencil attachment format: 24-bit depth plus an 8-bit
 * stencil aspect, and the only combined format guaranteed without a device
 * feature. Both the geometric stencil clip and a target's sampleable depth
 * attachment use it, so a clipped target pays nothing extra for opting into
 * depth.
 */
export const depthStencilAttachmentFormat: GPUTextureFormat = 'depth24plus-stencil8';

const stencilContentFace: GPUStencilFaceState = {
  compare: 'equal',
  failOp: 'keep',
  depthFailOp: 'keep',
  passOp: 'keep',
};

const inertFace: GPUStencilFaceState = {
  compare: 'always',
  failOp: 'keep',
  depthFailOp: 'keep',
  passOp: 'keep',
};

/**
 * The `depthStencil` pipeline state for a content pipeline (sprite / mesh / text
 * / particle) rendered into a pass that carries a depth/stencil attachment.
 *
 * `stencil` selects the geometric clip behaviour: test `stencil == reference`
 * (the reference is set per-pass via `setStencilReference`) instead of letting
 * every fragment through. The stencil aspect is never written either way.
 *
 * `depthWrite` lets the draw's window-space depth reach the attachment. The
 * comparison stays `always`, so depth never decides visibility - draw order
 * still does.
 *
 * Returned fresh per call because `GPURenderPipelineDescriptor` consumers may
 * retain the object. Pipelines that omit this state must run in a pass without a
 * depth/stencil attachment - the variants are never interchangeable, so callers
 * key their pipeline cache on both flags.
 */
export const contentDepthStencilState = (stencil: boolean, depthWrite: boolean): GPUDepthStencilState => ({
  format: depthStencilAttachmentFormat,
  depthWriteEnabled: depthWrite,
  depthCompare: 'always',
  stencilFront: stencil ? stencilContentFace : inertFace,
  stencilBack: stencil ? stencilContentFace : inertFace,
  stencilReadMask: 0xff,
  stencilWriteMask: 0,
});

/** {@link contentDepthStencilState} for a clipped draw that leaves depth alone. */
export const stencilContentDepthStencilState = (): GPUDepthStencilState => contentDepthStencilState(true, false);
