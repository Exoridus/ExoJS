import type { TextureSource } from '#core/types';

/** One composed frame ready to be displayed. @internal */
export interface DecodedSequenceFrame {
  readonly image: NonNullable<TextureSource>;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  /** Frees decoder-owned memory behind {@link image}; called once the frame is no longer displayed. */
  release(): void;
}

/**
 * Produces the composed frames of one animated image. Frames are requested in
 * order, wrapping to 0 at the end of a loop.
 * @internal
 */
export interface SequenceDecoder {
  readonly frameCount: number;
  /** Repeats after the first play; Infinity repeats forever. */
  readonly repetitions: number;
  decode(index: number): Promise<DecodedSequenceFrame>;
  close(): void;
}
