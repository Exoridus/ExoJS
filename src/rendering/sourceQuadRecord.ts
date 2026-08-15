/**
 * Floats one drawable's canonical quad record occupies: local bounds
 * `(left, top, right, bottom)` followed by normalised UV
 * `(uMin, vMin, uMax, vMax)`, with the texture's flip already applied.
 *
 * Both halves are properties of the DRAWABLE, not of any backend — the same
 * eight numbers are what a WebGL2 instance record and a WebGPU one are each
 * built from — which is what lets a persistent render source hold them without
 * becoming backend-bound.
 * @internal
 */
export const SOURCE_QUAD_FLOATS = 8;
