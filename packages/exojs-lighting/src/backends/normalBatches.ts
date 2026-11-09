import {
  BlendModes,
  type Geometry,
  INSTANCE_TRANSFORM_GLSL,
  INSTANCE_TRANSFORM_WGSL,
  MeshMaterial,
  RenderBatch,
  type RenderTexture,
  Shader,
  type Texture,
} from '@codexo/exojs';

import normalPrepassFragment from './shaders/normal-prepass.frag';
import normalPrepassVertex from './shaders/normal-prepass.vert';
import normalPrepassWgsl from './shaders/normal-prepass.wgsl';

type NormalBatches = Map<Texture | RenderTexture, Map<Texture, RenderBatch>>;

/** The batch for one albedo/normal-map pair, reused while registered surfaces reference it. */
export const acquireNormalBatch = (
  batches: NormalBatches,
  geometry: Geometry,
  albedo: Texture | RenderTexture,
  normalMap: Texture,
): RenderBatch => {
  let byNormal = batches.get(albedo);

  if (byNormal === undefined) {
    byNormal = new Map();
    batches.set(albedo, byNormal);
  }

  const existing = byNormal.get(normalMap);

  if (existing !== undefined) {
    return existing;
  }

  const material = new MeshMaterial({
    shader: new Shader({
      glsl: {
        vertex: `#version 300 es
${INSTANCE_TRANSFORM_GLSL}
${normalPrepassVertex}`,
        fragment: normalPrepassFragment,
      },
      wgsl: `${INSTANCE_TRANSFORM_WGSL}
${normalPrepassWgsl}`,
    }),
    // Declaration order is the group(2) binding order on WebGPU: albedo at
    // bindings 1/2, normal map at 3/4, matching `normal-prepass.wgsl`.
    textures: { u_albedo: albedo, u_normalMap: normalMap },
    blendMode: BlendModes.Normal,
  });
  const batch = new RenderBatch(geometry, material, {
    instanceAttributes: [
      { name: 'a_frame', format: 'float32x4' },
      { name: 'a_basis', format: 'float32x4' },
    ],
  });

  byNormal.set(normalMap, batch);

  return batch;
};

/** Release unreferenced pairs after collection, without destroying their borrowed geometry or textures. */
export const releaseUnusedNormalBatches = (batches: NormalBatches, inactive: ReadonlySet<RenderBatch>): void => {
  for (const [albedo, byNormal] of batches) {
    for (const [normalMap, batch] of byNormal) {
      if (batch.count === 0 && !inactive.has(batch)) {
        batch.material?.destroy();
        batch.destroy();
        byNormal.delete(normalMap);
      }
    }

    if (byNormal.size === 0) {
      batches.delete(albedo);
    }
  }
};
