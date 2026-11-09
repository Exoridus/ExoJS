import type { FrameTimeSource } from '../competitive/metrics';
import type { GpuFrameSamples } from './page/gpuFrameTimer';

/** Timing disables graphics probes; gpu adds hardware queries; deep adds CPU splits and API counters. */
export type MeasurementProfile = 'timing' | 'gpu' | 'deep';

export interface MeasurementOptions {
  readonly profile: MeasurementProfile;
  readonly cycle?: number;
}

export interface HeapSample {
  readonly phase: 'before-scene' | 'after-warmup' | 'measurement' | 'after-measurement' | 'after-teardown';
  readonly frame: number;
  readonly elapsedMs: number;
  readonly usedJSHeapBytes: number | null;
}

/** API calls observed after initialization, not engine logical counters or physical device execution counts. */
export interface ApiCounters {
  bufferUploadCalls: number;
  bufferUploadBytes: number;
  bufferAllocationCalls: number;
  bufferAllocationBytes: number;
  textureUploadCalls: number;
  programBinds: number;
  pipelineBinds: number;
  renderPasses: number;
  queueSubmits: number;
  buffersCreated: number;
  buffersDestroyed: number;
  texturesCreated: number;
  texturesDestroyed: number;
  shaderCompilations: number;
  pipelineCreations: number;
}

export interface CellTelemetry {
  readonly schemaVersion: 1;
  readonly profile: MeasurementProfile;
  readonly frameTimeSource: FrameTimeSource;
  readonly cpuMs: readonly number[];
  readonly updateMs: readonly number[] | null;
  readonly submissionMs: readonly number[] | null;
  readonly rafMs: readonly number[];
  readonly gpu: GpuFrameSamples;
  readonly api: Readonly<ApiCounters> | null;
  /** Unnormalized API invocation totals over the timed window, not engine logical counts. */
  readonly structuralTotals?: { readonly drawCalls: number; readonly textureBinds: number; readonly bufferUploads: number } | null;
  readonly heap: readonly HeapSample[];
  readonly warmup: { readonly requestedFrames: number; readonly completedFrames: number; readonly elapsedMs: number };
  readonly measurementElapsedMs: number;
  readonly mutation: {
    readonly nominalFraction: number;
    readonly selectedCount: number;
    readonly signature: string;
    readonly verified: boolean;
  };
  readonly viewport: { readonly width: number; readonly height: number; readonly dpr: number };
}

/** Chromium's optional heap estimate is coarse and page/process-dependent; it is never VRAM or proof of a leak. */
export const readHeapBytes = (): number | null => {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  const bytes = memory?.usedJSHeapSize;

  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
};
