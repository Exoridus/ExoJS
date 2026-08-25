import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { median, percentile } from '../../shared/timing';
import type { GpuFrameTimer } from '../page/gpuFrameTimer';
import { createWebGl2GpuTimer, createWebGpuGpuTimer, noopGpuTimer } from '../page/gpuFrameTimer';
import type { RenderTextureAcquirer, RestoreInstrumentation, TargetRecorder } from './instrumentation';
import { createTargetRecorder, instrumentAcquireRenderTexture, instrumentCacheTexture } from './instrumentation';
import type { InternalTargetRecord, ProbeCell, ProbeCellResult, ProbeMode, ProbeSceneId } from './matrix';
import { internalToMainPixelRatio } from './matrix';
import type { ProbeScene } from './scenes';
import { createProbeScene } from './scenes';

/** Backend the tester can ask the probe for. */
export type ProbeBackendRequest = 'auto' | 'webgl2' | 'webgpu';

/** Frames rendered before the measured window opens, for every cell alike. */
export const WARMUP_FRAMES = 40;

/** Default length of a cell's measured window, in milliseconds; the useful range is 5-10 s. */
export const DEFAULT_MEASURE_MS = 6_000;

/** Length of the optional single-cell sustained run. */
export const SUSTAINED_MEASURE_MS = 60_000;

/**
 * Smallest non-zero `performance.now()` delta this device will report.
 *
 * Recorded with every capture because it decides whether the per-frame CPU
 * numbers mean anything: WebKit coarsens the clock outside a cross-origin
 * isolated context, and a 1 ms floor quantises a 2 ms frame into "1 or 2". A
 * capture that does not say which regime it was taken in cannot be read later.
 */
export const measureTimerResolutionMs = (): number => {
  let smallest = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 20_000; i++) {
    const before = performance.now();
    const after = performance.now();
    const delta = after - before;

    if (delta > 0 && delta < smallest) {
      smallest = delta;
    }
  }

  return Number.isFinite(smallest) ? smallest : 0;
};

/**
 * Replace `#stage` with a pristine canvas.
 *
 * A fresh element per cell, exactly as the matrix harness does it:
 * `getContext` freezes its attribute dictionary on the first call, so a reused
 * canvas would hand the next `Application` a context configured for the previous
 * one. The outgoing context is force-lost first, because removing the element
 * only drops the reference and leaves the context alive until GC - across a
 * 32-cell run that would pile up past the browser's live-context cap.
 */
const freshStageCanvas = (host: HTMLElement): HTMLCanvasElement => {
  const previous = host.querySelector('canvas');

  if (previous !== null) {
    const gl = previous.getContext('webgl2') ?? previous.getContext('webgl');

    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    previous.remove();
  }

  const canvas = document.createElement('canvas');

  canvas.id = 'stage';
  host.append(canvas);

  return canvas;
};

/** A booted engine instance plus the handles the runner drives it through. */
interface ProbeApplication {
  readonly app: Application;
  readonly canvas: HTMLCanvasElement;
  readonly backendType: string;
  readonly gpuTimer: GpuFrameTimer;
  /** True when a WebGPU device granted `timestamp-query`; `null` off the WebGPU backend. */
  readonly webgpuTimestampQuery: boolean | null;
}

/**
 * Boot one `Application` at an explicit pixel ratio and wire a hardware GPU
 * timer to it when the platform offers one.
 *
 * `pixelRatio` is passed EXPLICITLY, which is the only way to reach 3 - the
 * engine's `auto` policy is `min(devicePixelRatio, 2)`, and that clamp is one of
 * the things under measurement here rather than something to work around
 * silently.
 */
const bootProbeApplication = async (canvas: HTMLCanvasElement, stage: StageSize, pixelRatio: number, backend: ProbeBackendRequest): Promise<ProbeApplication> => {
  const app = new Application({
    canvas: { element: canvas, width: stage.width, height: stage.height, pixelRatio },
    backend: { type: backend },
    clearColor: new Color(12, 16, 22),
    hello: false,
  });

  // Full production init, then stop the engine's own rAF loop: the probe owns
  // frame cadence so warmup and the measured window are identical across cells.
  await app.start();
  app.stop();

  const rendering = app.backend;

  if (rendering.backendType === RenderBackendType.WebGpu) {
    const device = (rendering as WebGpuBackend).device;
    const timer = createWebGpuGpuTimer(device);

    return { app, canvas, backendType: rendering.backendType, gpuTimer: timer, webgpuTimestampQuery: timer.available };
  }

  const gl = canvas.getContext('webgl2');

  return {
    app,
    canvas,
    backendType: rendering.backendType,
    gpuTimer: gl === null ? noopGpuTimer : createWebGl2GpuTimer(gl),
    webgpuTimestampQuery: null,
  };
};

/** Wait for one animation frame, resolving with its timestamp. */
const nextFrame = async (): Promise<number> =>
  new Promise<number>(resolve => {
    requestAnimationFrame(resolve);
  });

/** Everything {@link runProbeCell} needs beyond the cell itself. */
/** Logical (CSS) stage every cell in a run renders at. Fixed for the whole run. */
export interface StageSize {
  readonly width: number;
  readonly height: number;
}

export interface RunProbeCellOptions {
  readonly cell: ProbeCell;
  readonly backend: ProbeBackendRequest;
  /** Logical stage, captured once at run start so the cells stay comparable. */
  readonly stage: StageSize;
  /** DOM element the stage canvas is (re)created inside. */
  readonly host: HTMLElement;
  /** Position in the run order, copied into the result. */
  readonly index: number;
  /** `performance.now()` of the whole run's start, for {@link ProbeCellResult.startOffsetMs}. */
  readonly runStartedAt: number;
  /** Length of the measured window. */
  readonly measureMs?: number;
}

/**
 * Capture errors that escape the cell's own `try` for as long as it runs.
 *
 * Load-bearing, and learned the hard way: the engine reports some failures by
 * THROWING out of an internal listener rather than by rejecting the promise the
 * cell awaits. A `WebGl2ShaderProgram` compile failure reached the page as an
 * uncaught error while `runProbeCell` returned a full set of plausible timings
 * for a scene that had drawn nothing. A cell that failed must say so, or the
 * capture is worse than no capture.
 */
const captureLooseErrors = (sink: string[]): (() => void) => {
  const onError = (event: ErrorEvent): void => {
    sink.push(`uncaught: ${event.message}`);
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason: unknown = event.reason;

    sink.push(`unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  };

  globalThis.addEventListener('error', onError);
  globalThis.addEventListener('unhandledrejection', onRejection);

  return (): void => {
    globalThis.removeEventListener('error', onError);
    globalThis.removeEventListener('unhandledrejection', onRejection);
  };
};

/** Instrumentation installed for one cell, and how to take it back off. */
const instrumentCell = (app: Application, scene: ProbeScene): { recorder: TargetRecorder; restore: RestoreInstrumentation } => {
  const recorder = createTargetRecorder();
  const restores: RestoreInstrumentation[] = [instrumentAcquireRenderTexture(app.backend as unknown as RenderTextureAcquirer, recorder)];

  for (const node of scene.cacheNodes) {
    restores.push(instrumentCacheTexture(node, recorder));
  }

  return {
    recorder,
    restore: (): void => {
      for (const undo of restores) {
        undo();
      }
    },
  };
};

/**
 * Measure one cell end to end.
 *
 * The sequence is fixed for every cell, which is what makes the four pixel
 * ratios comparable: boot → instrument → ONE recorded frame → warmup → drain →
 * timed window → collect → tear down.
 *
 * The recorded frame is the FIRST frame, not a frame in the middle, because a
 * `cacheAsTexture` node allocates its cache texture exactly once - on the bake -
 * and replays without allocating afterwards. Arming later would report "this
 * scene has no internal target", which is the opposite of true.
 */
export const runProbeCell = async (options: RunProbeCellOptions): Promise<ProbeCellResult> => {
  const { cell, backend, host, index, runStartedAt, stage } = options;
  const measureMs = options.measureMs ?? DEFAULT_MEASURE_MS;
  const errors: string[] = [];
  const canvas = freshStageCanvas(host);

  let booted: ProbeApplication | null = null;
  let scene: ProbeScene | null = null;
  let restore: RestoreInstrumentation = (): void => {
    /* nothing instrumented yet */
  };
  const stopErrorCapture = captureLooseErrors(errors);

  try {
    booted = await bootProbeApplication(canvas, stage, cell.pixelRatio, backend);
    scene = createProbeScene(cell.scene, {
      stageWidth: stage.width,
      stageHeight: stage.height,
      mode: cell.mode,
      ...(cell.textPixelRatio !== undefined && { textPixelRatio: cell.textPixelRatio }),
    });

    const { app, gpuTimer } = booted;
    const instrumentation = instrumentCell(app, scene);

    restore = instrumentation.restore;

    const renderOnce = (frame: number): void => {
      scene!.update(frame);
      app.backend.resetStats();
      app.backend.clear();
      app.rendering.render(scene!.root);
      app.backend.flush();
    };

    // Frame 0, recorded: the only frame on which a texture cache allocates.
    instrumentation.recorder.arm();
    renderOnce(0);
    instrumentation.recorder.disarm();

    for (let frame = 1; frame <= WARMUP_FRAMES; frame++) {
      renderOnce(frame);
      await nextFrame();
    }

    // Measurement boundary: let warmup's GPU work finish so none of it resolves
    // inside the first timed frames' brackets.
    await gpuTimer.drainSubmittedWork();

    const cpuSamplesMs: number[] = [];
    const rafDeltasMs: number[] = [];
    const startedAt = performance.now();
    let previousTimestamp: number | null = null;
    let frame = WARMUP_FRAMES + 1;

    while (performance.now() - startedAt < measureMs) {
      const timestamp = await nextFrame();

      if (previousTimestamp !== null) {
        rafDeltasMs.push(timestamp - previousTimestamp);
      }

      previousTimestamp = timestamp;

      gpuTimer.beginFrame();

      const before = performance.now();

      renderOnce(frame++);
      cpuSamplesMs.push(performance.now() - before);
      gpuTimer.endFrame();
    }

    const measuredMs = performance.now() - startedAt;
    const gpuSamples = await gpuTimer.collect();
    const gpuUsable = gpuTimer.available && gpuSamples.frameMs.length > 0;
    const internalTargets = instrumentation.recorder.summary();
    const backingWidth = canvas.width;
    const backingHeight = canvas.height;
    const mainPixelCount = backingWidth * backingHeight;

    return {
      index,
      startOffsetMs: startedAt - runStartedAt,
      scene: cell.scene,
      mode: cell.mode,
      configuredPixelRatio: cell.pixelRatio,
      enginePixelRatio: app.pixelRatio,
      textPixelRatio: cell.textPixelRatio ?? null,
      // Read AFTER the frames have run: a node resolves its raster density
      // while the renderer collects it, so asking before the first draw would
      // record the pre-attachment default rather than what was measured.
      textRasterPixelRatio: scene.textNodes[0]?.rasterPixelRatio ?? null,
      cssWidth: parseFloat(canvas.style.width) || canvas.clientWidth,
      cssHeight: parseFloat(canvas.style.height) || canvas.clientHeight,
      backingWidth,
      backingHeight,
      mainPixelCount,
      internalTargets,
      internalToMainPixelRatio: internalToMainPixelRatio(internalTargets, mainPixelCount),
      warmupFrames: WARMUP_FRAMES,
      measuredFrames: cpuSamplesMs.length,
      measuredMs,
      cpuMsMedian: cpuSamplesMs.length > 0 ? median(cpuSamplesMs) : null,
      cpuMsP95: cpuSamplesMs.length > 0 ? percentile(cpuSamplesMs, 95) : null,
      gpuMsMedian: gpuUsable ? median(gpuSamples.frameMs) : null,
      gpuMsP95: gpuUsable ? percentile(gpuSamples.frameMs, 95) : null,
      rafDeltaMsMedian: rafDeltasMs.length > 0 ? median(rafDeltasMs) : null,
      rafDeltaMsP95: rafDeltasMs.length > 0 ? percentile(rafDeltasMs, 95) : null,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));

    return {
      index,
      startOffsetMs: performance.now() - runStartedAt,
      scene: cell.scene,
      mode: cell.mode,
      configuredPixelRatio: cell.pixelRatio,
      enginePixelRatio: booted?.app.pixelRatio ?? null,
      textPixelRatio: cell.textPixelRatio ?? null,
      textRasterPixelRatio: scene?.textNodes[0]?.rasterPixelRatio ?? null,
      cssWidth: parseFloat(canvas.style.width) || 0,
      cssHeight: parseFloat(canvas.style.height) || 0,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      mainPixelCount: canvas.width * canvas.height,
      internalTargets: [],
      internalToMainPixelRatio: null,
      warmupFrames: WARMUP_FRAMES,
      measuredFrames: 0,
      measuredMs: 0,
      cpuMsMedian: null,
      cpuMsP95: null,
      gpuMsMedian: null,
      gpuMsP95: null,
      rafDeltaMsMedian: null,
      rafDeltaMsP95: null,
      errors,
    };
  } finally {
    stopErrorCapture();
    restore();
    scene?.dispose();
    booted?.app.destroy();
  }
};

/** Handle for a running visual (unmeasured) preview. */
export interface VisualPreview {
  /** Backing-store size the preview's surface actually got. */
  readonly backingWidth: number;
  readonly backingHeight: number;
  /** CSS size of the preview canvas. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** Backend the preview initialised. */
  readonly backendType: string;
  /** Internal targets the preview's first frame allocated. */
  readonly internalTargets: readonly InternalTargetRecord[];
  stop(): Promise<void>;
}

/**
 * Render one scene continuously so the tester can LOOK at it.
 *
 * Never used for timing, and never running while a cell is measured: one variant
 * on screen at a time, or the measurement pays for both.
 */
export const startVisualPreview = async (options: {
  scene: ProbeSceneId;
  mode: ProbeMode;
  pixelRatio: number;
  /** `Text.pixelRatio` for the previewed scene's text; omitted means inherit. */
  textPixelRatio?: number;
  stage: StageSize;
  backend: ProbeBackendRequest;
  host: HTMLElement;
}): Promise<VisualPreview> => {
  const canvas = freshStageCanvas(options.host);
  const booted = await bootProbeApplication(canvas, options.stage, options.pixelRatio, options.backend);
  const scene = createProbeScene(options.scene, {
    stageWidth: options.stage.width,
    stageHeight: options.stage.height,
    mode: options.mode,
    ...(options.textPixelRatio !== undefined && { textPixelRatio: options.textPixelRatio }),
  });
  const recorder = createTargetRecorder();
  const restores: RestoreInstrumentation[] = [instrumentAcquireRenderTexture(booted.app.backend as unknown as RenderTextureAcquirer, recorder)];

  for (const node of scene.cacheNodes) {
    restores.push(instrumentCacheTexture(node, recorder));
  }

  let running = true;
  let frame = 0;
  let handle = 0;

  const loop = (): void => {
    if (!running) {
      return;
    }

    scene.update(frame++);
    booted.app.backend.resetStats();
    booted.app.backend.clear();
    booted.app.rendering.render(scene.root);
    booted.app.backend.flush();
    handle = requestAnimationFrame(loop);
  };

  // Arm across the FIRST frame only, so the readout shows per-frame target
  // shapes and, for `cacheAsTexture`, catches the one frame that bakes.
  recorder.arm();
  loop();
  recorder.disarm();

  return {
    backingWidth: canvas.width,
    backingHeight: canvas.height,
    cssWidth: parseFloat(canvas.style.width) || canvas.clientWidth,
    cssHeight: parseFloat(canvas.style.height) || canvas.clientHeight,
    backendType: booted.backendType,
    internalTargets: recorder.summary(),
    async stop(): Promise<void> {
      running = false;
      cancelAnimationFrame(handle);
      // One frame of slack so an in-flight callback cannot touch a destroyed app.
      await nextFrame();

      for (const undo of restores) {
        undo();
      }

      scene.dispose();
      booted.app.destroy();
    },
  };
};
