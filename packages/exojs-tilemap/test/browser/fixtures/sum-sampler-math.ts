/**
 * The sampled value the real-Worker suite expects at an absolute tile coordinate.
 *
 * Imported by both the worker fixture and the spec asserting on its output, so a
 * green run also proves the `?worker` bundle really carried a transitive import
 * across the Blob-URL boundary - a stubbed or import-dropping build would leave
 * the worker throwing on an undefined function rather than quietly agreeing.
 */
export const packSampleValue = (tx: number, ty: number): number => tx + ty;
