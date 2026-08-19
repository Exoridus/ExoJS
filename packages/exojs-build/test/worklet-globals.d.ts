// The slice of the AudioWorkletGlobalScope this fixture uses. Neither
// `lib.dom` nor `lib.webworker` declares `AudioWorkletProcessor` as a
// constructible value or `registerProcessor` as a global, and the two libs
// cannot be combined in one program, so the worklet fixture is typechecked
// against this scope alone by `tsconfig.worklets.json`.

declare class AudioWorkletProcessor {
  public constructor(options?: unknown);
  public process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processorCtor: new (options?: unknown) => AudioWorkletProcessor): void;
