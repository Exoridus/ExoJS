/**
 * Node-side WebGL2 benchmark harness.
 *
 * Wires the real {@link WebGl2Backend} + core renderers to a {@link createFakeWebGl2Context}
 * recording context, then drives full render frames (`render → flush`) and snapshots
 * deterministic structural metrics from `backend.stats` + the {@link GlRecorder}.
 *
 * @internal Test/perf-only.
 */
import type { RenderNode } from '#rendering/RenderNode';
import type { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from '../../rendering/browser/_coreRenderers';
import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from './fakeWebGl2';

export interface HarnessOptions {
  readonly width?: number;
  readonly height?: number;
  readonly spriteRendererBatchSize?: number;
  readonly tileRendererBatchSize?: number;
}

/** A wired-up backend ready to render scenes against the recording fake context. */
export interface WebGl2Harness {
  readonly backend: WebGl2Backend;
  readonly recorder: GlRecorder;
  readonly view: View;
  readonly width: number;
  readonly height: number;
  destroy(): void;
}

/**
 * Deterministic, GPU-independent metrics for one rendered frame. Every field is
 * a count or byte total that depends only on CPU-side renderer decisions and the
 * recorded GL call stream — identical across machines and across WebGL2/WebGPU
 * (same plan grouping, same instance formats, same flush rules).
 */
export interface FrameMetrics {
  /** GPU draw calls issued (from `RenderStats`; cross-checked against the recorder). */
  drawCalls: number;
  /** Draw batches flushed. */
  batches: number;
  /** Total GPU instances across all draws. */
  instances: number;
  /** Drawables submitted (post-cull draw commands played). */
  visibleNodes: number;
  /** Nodes skipped by view-frustum culling. */
  culledNodes: number;
  /** Render passes executed. */
  renderPasses: number;
  /** `bindTexture(handle≠null)` calls — texture binds incl. content + transform texture. */
  textureBinds: number;
  /** `bindSampler(handle≠null)` calls. */
  samplerBinds: number;
  /** Distinct consecutive program bindings (WebGL2 pipeline-change proxy). */
  programChanges: number;
  /** Real blend-state changes (`blendFunc` issuances). */
  blendChanges: number;
  /** Buffer uploads (`bufferData` + `bufferSubData`). */
  bufferUploads: number;
  /** Buffer reallocations (`bufferData` orphaning). */
  bufferReallocations: number;
  /** Instance/index bytes uploaded to array buffers this frame. */
  uploadedBufferBytes: number;
  /** Transform-buffer rows uploaded (0 when transforms are unchanged frame-to-frame). */
  transformRows: number;
  /** Transform-texture uploads this frame (0 = skipped because unchanged). */
  transformUploads: number;
  /** Transform-buffer bytes uploaded this frame. */
  transformUploadBytes: number;
}

/**
 * Build a backend wired to the recording fake context, with the core renderers
 * registered. Construct once, render many frames.
 */
export const createWebGl2Harness = (options: HarnessOptions = {}): WebGl2Harness => {
  installFakeWebGl2Globals();

  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const recorder = new GlRecorder();
  const context = createFakeWebGl2Context(recorder);
  const canvas = createFakeCanvas(width, height, context);

  const app = {
    canvas,
    options: {
      canvas: { width, height },
      rendering: { debug: false, spriteRendererBatchSize: options.spriteRendererBatchSize },
      clearColor: undefined,
    },
  };

  const backend = new WebGl2Backend(app as unknown as ConstructorParameters<typeof WebGl2Backend>[0]);

  wireCoreRenderers(backend, { spriteRendererBatchSize: options.spriteRendererBatchSize });

  return {
    backend,
    recorder,
    view: backend.view,
    width,
    height,
    destroy(): void {
      backend.destroy();
    },
  };
};

/**
 * Render `root` for one frame against `harness` and return the structural metrics.
 * `beforeFrame` runs after stats/recorder reset but before the render — use it to
 * mutate the scene, pan the camera, etc.
 */
export const measureFrame = (harness: WebGl2Harness, root: RenderNode, beforeFrame?: () => void): FrameMetrics => {
  const { backend, recorder } = harness;

  backend.resetStats();
  recorder.reset();
  beforeFrame?.();
  backend.clear();
  root.render(backend);
  backend.flush();

  const stats = backend.stats;

  return {
    drawCalls: stats.drawCalls,
    batches: stats.batches,
    instances: recorder.instances,
    visibleNodes: stats.submittedNodes,
    culledNodes: stats.culledNodes,
    renderPasses: stats.renderPasses,
    textureBinds: recorder.textureBinds,
    samplerBinds: recorder.samplerBinds,
    programChanges: recorder.programChanges,
    blendChanges: recorder.blendChanges,
    bufferUploads: recorder.bufferUploads,
    bufferReallocations: recorder.bufferReallocations,
    uploadedBufferBytes: recorder.bufferUploadBytes,
    transformRows: recorder.transformRows,
    transformUploads: recorder.transformUploads,
    transformUploadBytes: recorder.transformUploadBytes,
  };
};

/**
 * Warm a scene to steady state (caches built, buffers grown) then return the
 * metrics of the final warmed frame. Use for structural assertions that should
 * reflect steady-state, not first-frame, behaviour.
 */
export const measureSteadyFrame = (harness: WebGl2Harness, root: RenderNode, warmupFrames = 2, beforeFrame?: () => void): FrameMetrics => {
  let metrics: FrameMetrics | null = null;

  for (let i = 0; i <= warmupFrames; i++) {
    metrics = measureFrame(harness, root, beforeFrame);
  }

  return metrics!;
};
