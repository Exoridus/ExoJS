/**
 * The public rendering features the conformance matrix speaks about.
 *
 * Kept by hand on purpose. Deriving the list from the scenes that happen to
 * exist would make the matrix structurally incapable of saying "this feature
 * is unverified" - the row would simply not appear, and absence of a claim
 * would look identical to absence of a problem. Listing features first and
 * filling them from measurements second is what lets the table show its own
 * gaps.
 *
 * Adding a feature here without a scene is therefore correct and expected: it
 * turns an invisible gap into a visible one.
 */

export interface RenderFeature {
  /** Matches `Scene.feature` for every scene that exercises it. */
  readonly name: string;
  /** One line, aimed at someone deciding whether they can rely on it. */
  readonly summary: string;
}

export const RENDER_FEATURES: readonly RenderFeature[] = [
  { name: 'Sprite', summary: 'Textured quads, the workhorse primitive.' },
  { name: 'NineSlice', summary: 'Nine-quad scaling that keeps corners intact.' },
  { name: 'RepeatingSprite', summary: 'Tiled fills via UV wrapping.' },
  { name: 'Mesh', summary: 'Arbitrary triangle geometry with per-vertex UVs.' },
  { name: 'Transform', summary: 'Position, rotation, scale, and parent composition.' },
  { name: 'Text', summary: 'SDF and bitmap glyph rendering.' },
  { name: 'Graphics', summary: 'Filled and stroked vector primitives.' },
  { name: 'Tilemap', summary: 'Chunked tile layers from the tilemap package.' },
  { name: 'Particles', summary: 'CPU and GPU particle systems.' },
  { name: 'RenderTexture', summary: 'Rendering into a texture and sampling it back.' },
  { name: 'Mask', summary: 'Stencil and alpha clipping.' },
  { name: 'Filter', summary: 'Post-processing passes over a rendered region.' },
  { name: 'BlendMode', summary: 'Separable and backdrop-aware blending.' },
  { name: 'Tint', summary: 'Per-node colour modulation.' },
  { name: 'Video', summary: 'Video frames uploaded as textures.' },
];
