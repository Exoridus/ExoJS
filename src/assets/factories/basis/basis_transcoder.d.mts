interface Ktx2File {
  isValid(): boolean;
  isETC1S(): boolean;
  isUASTC(): boolean;
  getWidth(): number;
  getHeight(): number;
  getLevels(): number;
  getHasAlpha(): boolean;
  startTranscoding(): boolean;
  getImageTranscodedSizeInBytes(level: number, layer: number, face: number, target: number): number;
  transcodeImage(
    destination: Uint8Array,
    level: number,
    layer: number,
    face: number,
    target: number,
    alpha: number,
    channel0: number,
    channel1: number,
  ): boolean;
  close(): void;
  delete(): void;
}
interface BasisModule {
  initializeBasis(): void;
  KTX2File: new (bytes: Uint8Array) => Ktx2File;
}
export default function createBasis(options: { wasmBinary: Uint8Array }): Promise<BasisModule>;
