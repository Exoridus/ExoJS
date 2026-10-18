/**
 * Frame lifecycle under the color-managed rendering pipeline: the engine-owned
 * working target a frame is drawn into, the sample count an antialias request
 * negotiates for it, and the resolve that publishes its frame into the texture
 * the rest of the pipeline samples.
 *
 * The working-target half runs against a recording backend double, so the
 * ordering contract is asserted without a device. The storage half runs the
 * real {@link WebGl2Backend} against the fake GL context, so the allocation,
 * the resolve blit and the teardown are the real code paths.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { Application } from '#core/Application';
import { resolveRenderingOptions } from '#core/application/ApplicationOptions';
import type { ApplicationSizing } from '#core/application/ApplicationSizing';
import { logger } from '#core/Logger';
import type { BackendRenderPass } from '#rendering/BackendRenderPass';
import type { RenderBackend } from '#rendering/RenderBackend';
import { type RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { GlEventLog } from '../perf/rendering/fakeWebGl2';
import { createWebGl2Harness, type WebGl2Harness } from '../perf/rendering/harness';
import { createRenderBackendDouble } from '../support/render-backend-double';

/** One recorded step of the frame, in the order the engine performed it. */
type FrameEvent = 'target:offscreen' | 'target:root' | 'scene' | 'resolve' | 'passes' | 'present';

interface WorkingTargetHarness {
  readonly app: Application;
  readonly backend: RenderBackend;
  /** Working target the frame was drawn into, as the backend saw it. */
  readonly working: () => RenderTexture | null;
  drawFrame(): void;
  commitGeometry(logicalWidth: number, logicalHeight: number): void;
  events: FrameEvent[];
  release(): void;
}

/**
 * An {@link Application} reduced to the frame path: no canvas, no scene graph,
 * no scheduler. Every collaborator the colour-managed frame touches is either a
 * recorder or one of the real classes under test.
 */
const createWorkingTargetHarness = (
  options: { readonly antialias?: boolean; readonly passes?: boolean; readonly sampleCounts?: readonly number[] } = {},
): WorkingTargetHarness => {
  const events: FrameEvent[] = [];
  const base = createRenderBackendDouble();
  const backend: RenderBackend = {
    ...base,
    setRenderTarget(target: RenderTarget | null) {
      events.push(target === base.renderTarget || target === null ? 'target:root' : 'target:offscreen');

      return this;
    },
    getColorFormatCapabilities() {
      return { renderable: true, filterable: true, blendable: true, sampleCounts: options.sampleCounts ?? [1] };
    },
    resolveRenderTarget() {
      events.push('resolve');

      return;
    },
    execute(pass: BackendRenderPass) {
      // A double has no pass coordinator, so `BackendTargetPass` runs its legacy
      // body - which is the branch that reaches `setRenderTarget` above.
      pass.execute(backend);

      return this;
    },
  };

  const app = Object.create(Application.prototype) as Application;
  const record = app as unknown as Record<string, unknown>;
  const sizing = { width: 100, height: 50, pixelRatio: 1 } as unknown as ApplicationSizing;

  record['options'] = { rendering: resolveRenderingOptions(options.antialias === true ? { webglAttributes: { antialias: true } } : {}) };
  record['_backend'] = backend;
  record['_rendering'] = { resize: (): void => {} };
  record['onResize'] = { dispatch: (): void => {} };
  record['_geometry'] = sizing;
  record['_autoClear'] = true;
  record['_frameTexture'] = null;
  record['_framePasses'] =
    options.passes === true
      ? {
          size: 1,
          execute: (): void => {
            events.push('passes');
          },
          resize: (): void => {},
        }
      : null;
  record['_frameRedirect'] = null;
  record['_outputPassesRedirect'] = null;
  record['_outputTexture'] = null;
  record['_workingSampleCountCache'] = null;
  record['_transparentCanvas'] = false;
  record['_outputTransform'] = {
    present: (): void => {
      events.push('present');
    },
    destroy: (): void => {},
  };

  // The scene, the systems and the transition are somebody else's contract;
  // here they are one recorded step between the redirect and the resolve.
  record['_drawSceneAndSystems'] = (): void => {
    events.push('scene');
  };

  return {
    app,
    backend,
    working: () => (record['_outputTexture'] as RenderTexture | null) ?? null,
    drawFrame(): void {
      (app as unknown as { _drawFrame: () => void })._drawFrame();
    },
    commitGeometry(logicalWidth: number, logicalHeight: number): void {
      (sizing as unknown as { width: number; height: number }).width = logicalWidth;
      (sizing as unknown as { width: number; height: number }).height = logicalHeight;
      (app as unknown as { _onGeometryCommit: (width: number, height: number) => void })._onGeometryCommit(logicalWidth, logicalHeight);
    },
    events,
    release(): void {
      (app as unknown as { _releaseOutputTarget: () => void })._releaseOutputTarget();
    },
  };
};

describe('working frame target', () => {
  test('keeps one working target across repeated geometry commits, resized in place', () => {
    const harness = createWorkingTargetHarness();

    harness.drawFrame();

    const first = harness.working()!;

    expect(first).toBeInstanceOf(RenderTexture);
    expect([first.width, first.height]).toEqual([100, 50]);
    expect(first.format).toBe(TextureFormat.Rgba8Srgb);

    harness.commitGeometry(200, 120);
    harness.drawFrame();

    const second = harness.working()!;

    expect(second).toBe(first);
    expect([second.width, second.height]).toEqual([200, 120]);

    // Texels follow the backing store, the view stays in logical units, so a
    // device-pixel-ratio change resizes the same target rather than replacing it.
    harness.commitGeometry(200, 120);
    harness.drawFrame();

    expect(harness.working()).toBe(first);

    harness.release();
  });

  test('resolves the working target after the scene and before the output transform', () => {
    const harness = createWorkingTargetHarness();

    harness.drawFrame();

    expect(harness.events).toEqual(['target:offscreen', 'scene', 'target:root', 'resolve', 'present']);
  });

  test('resolves the frame target before the frame passes read it', () => {
    const harness = createWorkingTargetHarness({ passes: true });

    harness.drawFrame();

    expect(harness.events).toEqual([
      'target:offscreen',
      'scene',
      'target:root',
      'resolve',
      'target:offscreen',
      'passes',
      'target:root',
      'present',
    ]);
  });

  test('multisamples the scene frame, not the filter pipeline it feeds', () => {
    const harness = createWorkingTargetHarness({ antialias: true, passes: true, sampleCounts: [1, 2, 4] });

    harness.drawFrame();

    const record = harness.app as unknown as Record<string, unknown>;
    const frame = record['_frameTexture'] as RenderTexture;
    const output = harness.working()!;

    // The passes render into the output target, so a multisample one would make
    // every filter in the chain pay the sample cost. Only the scene's own frame
    // target carries the count, and it is resolved before the chain reads it.
    expect(frame.sampleCount).toBe(4);
    expect(output.sampleCount).toBe(1);

    harness.release();
  });

  test('multisamples the output target when the frame is drawn straight into it', () => {
    const harness = createWorkingTargetHarness({ antialias: true, sampleCounts: [1, 2, 4] });

    harness.drawFrame();

    expect(harness.working()!.sampleCount).toBe(4);

    harness.release();
  });
});

describe('working sample count negotiation', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const negotiate = (sampleCounts: readonly number[], antialias = true): number => {
    const harness = createWorkingTargetHarness({ antialias, sampleCounts });

    harness.drawFrame();

    const sampleCount = harness.working()!.sampleCount;

    harness.release();

    return sampleCount;
  };

  test('renders at one sample per pixel when no antialias was requested', () => {
    expect(negotiate([1, 2, 4], false)).toBe(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('takes the highest supported count of 1, 2 or 4 for the working format', () => {
    expect(negotiate([1, 2, 4])).toBe(4);
    expect(negotiate([1, 2, 8])).toBe(2);
    expect(negotiate([1, 4])).toBe(4);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('reports a request the backend cannot honor instead of dropping it', () => {
    expect(negotiate([1])).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/sampleCounts/);
  });
});

describe('multisample working storage', () => {
  let harness: WebGl2Harness | null = null;
  let target: RenderTexture | null = null;

  const bind = (): void => {
    harness!.backend.setRenderTarget(target);
  };

  afterEach(() => {
    target?.destroy();
    target = null;
    harness?.destroy();
    harness = null;
  });

  test('allocates colour storage at the requested count and resolves into the target texture', () => {
    harness = createWebGl2Harness({ coreRenderers: false, sampleCountSupport: [1, 2, 4] });
    target = new RenderTexture(64, 48, { format: TextureFormat.Rgba8Srgb });
    target.sampleCount = 4;
    bind();

    expect(harness.recorder.multisampleAllocations).toBe(1);
    expect(harness.recorder.multisampleSamples).toBe(4);
    expect(harness.backend.stats.gpuMemoryBytes).toBeGreaterThan(64 * 48 * 4 * 4);

    harness.backend.resolveRenderTarget(target);

    expect(harness.recorder.multisampleResolves).toBe(1);
    expect(harness.recorder.multisampleResolveBlits[0]).toMatchObject({ width: 64, height: 48 });
    // A resolve reads the multisample framebuffer and writes a different one.
    expect(harness.recorder.multisampleResolveBlits[0]?.from).not.toBe(harness.recorder.multisampleResolveBlits[0]?.to);
  });

  test('resolves once per drawn frame and not again for a second call', () => {
    harness = createWebGl2Harness({ coreRenderers: false });
    target = new RenderTexture(8, 8);
    target.sampleCount = 2;
    bind();

    harness.backend.resolveRenderTarget(target);
    harness.backend.resolveRenderTarget(target);

    expect(harness.recorder.multisampleResolves).toBe(1);
  });

  test('reuses the colour storage across frames and re-allocates it in place on resize', () => {
    harness = createWebGl2Harness({ coreRenderers: false });
    harness.recorder.log = new GlEventLog();
    target = new RenderTexture(16, 16);
    target.sampleCount = 4;
    bind();
    harness.backend.resolveRenderTarget(target);

    const renderbuffers = [...harness.recorder.log.leaked('renderbuffer')];
    const allocated = harness.recorder.multisampleAllocations;

    bind();
    harness.backend.resolveRenderTarget(target);

    expect(harness.recorder.multisampleAllocations).toBe(allocated);
    expect(harness.recorder.log.leaked('renderbuffer')).toEqual(renderbuffers);

    target.setSize(32, 24);
    bind();
    harness.backend.resolveRenderTarget(target);

    expect(harness.recorder.multisampleAllocations).toBe(allocated + 1);
    // A resize re-specifies the same handle rather than leaking a new one.
    expect(harness.recorder.log.created('renderbuffer')).toHaveLength(renderbuffers.length);
    expect(harness.recorder.log.leaked('renderbuffer')).toEqual(renderbuffers);
    expect(harness.recorder.multisampleResolveBlits.at(-1)).toMatchObject({ width: 32, height: 24 });
  });

  test('gives a stencil-clipped multisample target a matching depth/stencil allocation', () => {
    harness = createWebGl2Harness({ coreRenderers: false });
    target = new RenderTexture(16, 16);
    target.sampleCount = 4;
    bind();
    const before = harness.recorder.multisampleAllocations;

    // The clip path is what allocates the depth/stencil attachment on demand.
    (harness.backend as unknown as { _ensureTargetStencil: () => void })._ensureTargetStencil();

    expect(target.needsStencil).toBe(true);
    expect(harness.recorder.multisampleAllocations).toBe(before + 1);
    expect(harness.recorder.multisampleSamples).toBe(4);
  });

  test('releases the multisample storage when the target is destroyed', () => {
    harness = createWebGl2Harness({ coreRenderers: false });
    harness.recorder.log = new GlEventLog();
    target = new RenderTexture(16, 16);
    target.sampleCount = 4;
    bind();

    expect(harness.recorder.log.leaked('renderbuffer')).toHaveLength(1);

    target.destroy();
    target = null;

    expect(harness.recorder.log.leaked('renderbuffer')).toHaveLength(0);
  });

  test('re-allocates the multisample storage and re-probes the device after a context loss', () => {
    harness = createWebGl2Harness({ coreRenderers: false });
    target = new RenderTexture(16, 16);
    target.sampleCount = 4;
    bind();
    harness.backend.getColorFormatCapabilities(TextureFormat.Rgba8);

    expect(harness.recorder.sampleCountQueries).toBe(1);

    (harness.backend as unknown as { _reinitializeDeviceState: () => void })._reinitializeDeviceState();

    expect(harness.backend.getColorFormatCapabilities(TextureFormat.Rgba8).sampleCounts).toEqual([1, 2, 4]);
    expect(harness.recorder.sampleCountQueries).toBe(2);

    bind();

    expect(harness.recorder.multisampleSamples).toBe(4);
    harness.backend.resolveRenderTarget(target);
    expect(harness.recorder.multisampleResolves).toBe(1);
  });

  test('rejects a sample count the context never reported', () => {
    harness = createWebGl2Harness({ coreRenderers: false, sampleCountSupport: [1, 2] });
    target = new RenderTexture(8, 8);
    target.sampleCount = 4;

    expect(() => bind()).toThrow(/does not support 4x multisampling/);
  });

  test('serves a target with a sampleable depth attachment at one sample', () => {
    harness = createWebGl2Harness({ coreRenderers: false });
    target = new RenderTexture(8, 8, { depth: true });
    target.sampleCount = 4;
    bind();

    expect(harness.recorder.multisampleAllocations).toBe(0);
  });
});
