// Ambient globals for the AudioWorkletGlobalScope. Deliberately hand-rolled and
// self-contained rather than pulled from `lib.dom`/`lib.webworker` — neither
// TypeScript lib declares `AudioWorkletProcessor` as a constructible value or
// `registerProcessor`/`sampleRate`/`currentTime`/`currentFrame` as globals (they
// only appear in `lib.dom` as JSDoc references on unrelated interfaces), and
// `dom`/`webworker` cannot be combined in one `lib` array anyway (duplicate
// globals). Included exclusively by `../../tsconfig.worklets.json`, which
// typechecks converted `*.worklet.ts` files against just this scope — no DOM —
// so accidental `window`/`document`/etc. usage is a compile error, not a
// runtime surprise inside the real AudioWorkletGlobalScope.

interface AudioWorkletProcessorPort {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

interface AudioParamDescriptor {
  name: string;
  automationRate?: 'a-rate' | 'k-rate';
  minValue?: number;
  maxValue?: number;
  defaultValue?: number;
}

declare class AudioWorkletProcessor {
  public constructor(options?: unknown);
  public readonly port: AudioWorkletProcessorPort;
  public process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: (new (options?: unknown) => AudioWorkletProcessor) & {
    parameterDescriptors?: AudioParamDescriptor[];
  },
): void;

declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;
