/**
 * Textured mesh scenes over a coordinate-encoding texture.
 *
 * Sprites carry their UVs implicitly from a texture frame; a mesh states them
 * per vertex. That makes this the scene where a backend's UV interpolation and
 * winding order are actually under test rather than assumed.
 *
 * Both meshes are axis-aligned quads drawn 1:1, so under nearest sampling each
 * output pixel still resolves to exactly one texel.
 */

import { Container } from '#rendering/Container';
import { Mesh } from '#rendering/mesh/Mesh';

import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import type { Scene } from '../types';

const FIXTURE = 32;
const CANVAS = 64;

const quadAt = (x: number, y: number, uvs: Float32Array): Container => {
  const root = new Container();
  const mesh = new Mesh({
    vertices: new Float32Array([x, y, x + FIXTURE, y, x + FIXTURE, y + FIXTURE, x, y + FIXTURE]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    uvs,
    texture: buildCoordinateTexture(FIXTURE),
  });

  root.addChild(mesh);

  return root;
};

/** Corner order matching the vertex order above: top-left, top-right, bottom-right, bottom-left. */
const IDENTITY_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

/** Horizontally mirrored: the exact mistake a coordinate texture is built to catch. */
const MIRRORED_UVS = new Float32Array([1, 0, 0, 0, 0, 1, 1, 1]);

export const meshScenes: readonly Scene[] = [
  {
    name: 'mesh/textured-quad',
    feature: 'Mesh',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => quadAt(8, 8, IDENTITY_UVS),
  },
  {
    // Deliberately mirrored UVs. Both backends must mirror *identically* — the
    // point is not that the image is right, but that neither backend quietly
    // flips it back. A solid texture could not tell the two apart at all.
    name: 'mesh/mirrored-uvs',
    feature: 'Mesh',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    build: () => quadAt(8, 8, MIRRORED_UVS),
  },
];
