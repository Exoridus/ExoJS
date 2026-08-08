import type { AttributeType, GeometryAttribute, Material } from '@codexo/exojs';
import { Geometry, ShaderSource } from '@codexo/exojs';

import type { ParticleSystem } from '#ParticleSystem';

import fragmentSource from '../renderers/glsl/particle.frag';
import vertexSource from './glsl/mesh.vert';
import { assertVertexGeometryCompatible, ParticleBufferLayout } from './ParticleBufferLayout';
import { instanceAttributes, instanceStrideBytes, ParticleInstanceWriter } from './ParticleInstanceWriter';
import { ParticleMaterial } from './ParticleMaterial';
import { ParticleRenderMode } from './ParticleRenderMode';

/** Floats one entry of the normalised mesh vertex table occupies: x, y, u, v. */
const floatsPerMeshVertex = 4;

const meshVertexStrideBytes = floatsPerMeshVertex * Float32Array.BYTES_PER_ELEMENT;

/**
 * Layout the normalised mesh table is read back with. Named apart from the
 * per-instance attributes because both sets bind into the same shader.
 */
const meshVertexAttributes: readonly GeometryAttribute[] = [
  { name: 'a_meshPosition', size: 2, type: 'f32', normalized: false, offset: 0 },
  { name: 'a_meshTexcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
];

const componentByteSizes: Record<AttributeType, number> = {
  f32: 4,
  u8: 1,
  u16: 2,
  u32: 4,
  i32: 4,
};

const positionAttributeNames = new Set<string>(['a_position', 'position']);
const texcoordAttributeNames = new Set<string>(['a_texcoord', 'texcoord', 'a_uv', 'uv']);

/** Construction options for {@link MeshParticles}. */
export interface MeshParticlesOptions {
  /**
   * The shape one particle draws, in system-local units before the
   * per-particle scale and rotation are applied.
   *
   * Its position attribute (`a_position`/`position`) supplies the vertex
   * positions and its texcoord attribute (`a_texcoord`/`texcoord`/`a_uv`/`uv`)
   * the UVs. See {@link MeshParticles} for what a geometry without the latter
   * renders as, and for how to make a mutation take effect.
   */
  readonly geometry: Geometry;
}

/** Read one component of `attribute`, applying its normalisation. */
const readComponent = (view: DataView, attribute: GeometryAttribute, byteOffset: number): number => {
  switch (attribute.type) {
    case 'f32':
      return view.getFloat32(byteOffset, true);
    case 'u8': {
      const value = view.getUint8(byteOffset);

      return attribute.normalized ? value / 255 : value;
    }
    case 'u16': {
      const value = view.getUint16(byteOffset, true);

      return attribute.normalized ? value / 65535 : value;
    }
    case 'u32': {
      const value = view.getUint32(byteOffset, true);

      return attribute.normalized ? value / 4294967295 : value;
    }
    case 'i32': {
      const value = view.getInt32(byteOffset, true);

      return attribute.normalized ? Math.max(value / 2147483647, -1) : value;
    }
  }
};

/**
 * Read a mesh geometry's (x, y, u, v) per vertex into one flat table.
 *
 * The shader this mode ships is fixed, so it binds fixed attribute names and a
 * fixed stride, while a caller's mesh may declare any names in any supported
 * types. Normalising here is what lets one compiled program serve every mesh.
 *
 * `Geometry` guarantees a position attribute exists — it resolves one in its
 * own constructor and throws otherwise — so the same resolution order is
 * mirrored here rather than re-validated. A geometry without a texcoord
 * attribute leaves the UV columns at zero.
 *
 * @param out Table to fill; a new one is allocated when it is the wrong size,
 *   so a re-read after an in-place mutation reuses the existing allocation.
 */
const readMeshTable = (mesh: Geometry, out: Float32Array | null = null): Float32Array => {
  const { attributes, stride, vertexData } = mesh;
  const vertexCount = mesh.vertexCount;
  const table = out !== null && out.length === vertexCount * floatsPerMeshVertex ? out : new Float32Array(vertexCount * floatsPerMeshVertex);
  const view =
    vertexData instanceof Float32Array ? new DataView(vertexData.buffer, vertexData.byteOffset, vertexData.byteLength) : new DataView(vertexData);

  const position =
    attributes.find(attribute => positionAttributeNames.has(attribute.name)) ??
    attributes.find(attribute => attribute.name.toLowerCase().includes('position'))!;
  const texcoord = attributes.find(attribute => texcoordAttributeNames.has(attribute.name)) ?? null;

  for (let i = 0; i < vertexCount; i++) {
    const vertexStart = i * stride;
    const target = i * floatsPerMeshVertex;

    table[target + 0] = readComponent(view, position, vertexStart + position.offset);
    table[target + 1] = readComponent(view, position, vertexStart + position.offset + componentByteSizes[position.type]);

    if (texcoord !== null) {
      table[target + 2] = readComponent(view, texcoord, vertexStart + texcoord.offset);
      table[target + 3] = readComponent(view, texcoord, vertexStart + texcoord.offset + componentByteSizes[texcoord.type]);
    } else {
      table[target + 2] = 0;
      table[target + 3] = 0;
    }
  }

  return table;
};

/**
 * WGSL counterpart of `glsl/mesh.vert` plus the quad's fragment stage. Vertex
 * and fragment entry points share one source per WGSL convention. The
 * per-instance attributes bind at `@location(0..5)`, matching the declaration
 * order and byte offsets of {@link instanceAttributes}, and the mesh's own
 * vertices follow at `@location(6..7)` from the second vertex buffer.
 *
 * The uniform struct is the one the WebGPU particle renderer writes for every
 * mode, so `localBounds` and `uvBounds` are declared but unused here: a mesh
 * carries its own local footprint rather than taking it from the texture frame.
 */
export const meshParticleWgsl = `
struct ProjectionUniforms {
    projection: mat4x4<f32>,
    translation: mat4x4<f32>,
    flags: vec4<f32>,
    localBounds: vec4<f32>,    // quadMin.xy, quadSize.xy — unused by this mode
    uvBounds: vec4<f32>,       // uvMin.xy, uvMax.xy — unused by this mode
};

@group(0) @binding(0)
var<uniform> uniforms: ProjectionUniforms;

@group(1) @binding(0)
var particleTexture: texture_2d<f32>;

@group(1) @binding(1)
var particleSampler: sampler;

struct VertexInput {
    // Per-instance (one entry per particle, 40 bytes total).
    @location(0) translation: vec2<f32>,
    @location(1) scale: vec2<f32>,
    @location(2) rotation: f32,
    @location(3) color: vec4<f32>,
    @location(4) uvMin: vec2<f32>,            // pre-resolved frame UV (top-left)
    @location(5) uvMax: vec2<f32>,            // pre-resolved frame UV (bottom-right)
    // Per-vertex, from the mode's mesh geometry.
    @location(6) meshPosition: vec2<f32>,
    @location(7) meshTexcoord: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let localPosition = input.meshPosition;

    let radians = radians(input.rotation);
    let sinValue = sin(radians);
    let cosValue = cos(radians);
    let rotated = vec2<f32>(
        (localPosition.x * (input.scale.x * cosValue)) + (localPosition.y * (input.scale.y * sinValue)) + input.translation.x,
        (localPosition.x * (input.scale.x * -sinValue)) + (localPosition.y * (input.scale.y * cosValue)) + input.translation.y
    );

    var output: VertexOutput;

    output.position = uniforms.projection * uniforms.translation * vec4<f32>(rotated, 0.0, 1.0);
    // The mesh's own UVs address the particle's frame rather than the whole
    // texture, so a mesh particle still selects an atlas frame.
    output.texcoord = mix(input.uvMin, input.uvMax, input.meshTexcoord);
    output.color = vec4(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sampled = textureSample(particleTexture, particleSampler, input.texcoord);
    let premultipliedSample = select(sampled, vec4(sampled.rgb * sampled.a, sampled.a), uniforms.flags.x > 0.5);

    return premultipliedSample * input.color;
}
`;

/**
 * One caller-supplied mesh per particle, drawn as a single instanced draw.
 *
 * The cheap counterpart to `RibbonParticles`: the relationship stays one
 * particle, one instance, and the per-instance data is byte-identical to
 * `QuadParticles`'s — {@link instanceAttributes}, filled by the same
 * writer. Only the shape changes. That is what makes this mode **GPU-eligible**
 * without touching the compute pipeline: the pipeline emits precisely that
 * layout, so a system on the GPU path binds its instance buffer directly and
 * never calls {@link build}.
 *
 * **The mesh rides in its own vertex buffer**, alongside the per-instance one.
 * The shader is fixed and shared, so any number of `MeshParticles` compile one
 * program per backend regardless of how many distinct shapes they draw, and a
 * mesh is limited only by what a vertex buffer holds.
 *
 * **Mutating the mesh works.** Its vertices are read into a normalised
 * `(x, y, u, v)` table — the shader binds fixed names, a caller's geometry may
 * use any — and re-read whenever the geometry's `version` changes. Edit the
 * geometry in place, call `invalidate()` on it, and the next draw picks it up.
 * Changing the vertex *count* is equally fine.
 *
 * **Atlas frames still work.** The mesh's own UVs are treated exactly like the
 * quad's 0..1 corners: the shader mixes them across the particle's resolved
 * frame (`uv = mix(uvMin, uvMax, meshUV)`), so `system.frames` plus a
 * per-particle `textureIndex` selects a frame the same way. A geometry with
 * **no texcoord attribute** therefore carries UV `(0, 0)` on every vertex and
 * the mix degenerates to `uvMin` — the whole mesh samples the single texel at
 * the frame's top-left corner, which on the default 1×1 white texture is
 * exactly "untextured, tinted by the particle's `color`".
 *
 * **Sizing is the mesh's own.** Unlike the quad, which derives its footprint
 * from the texture frame, a mesh particle's footprint is whatever its vertex
 * positions say, in system-local units, multiplied by the per-particle
 * `scaleX`/`scaleY`. The texture only supplies colour.
 *
 * @example
 * const shard = new Geometry({
 *     attributes: [
 *         { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
 *         { name: 'a_uv', size: 2, type: 'f32', normalized: false, offset: 8 },
 *     ],
 *     vertexData: new Float32Array([0, -8, 0.5, 0, 6, 6, 1, 1, -6, 6, 0, 1]),
 *     stride: 16,
 * });
 *
 * const debris = new ParticleSystem(rockTexture, {
 *     capacity: 512,
 *     render: new MeshParticles({ geometry: shard }),
 * });
 *
 * debris.addUpdateModule(new RotateOverLifetime(180)); // each shard tumbles
 */
export class MeshParticles extends ParticleRenderMode {
  public override readonly gpuEligible = true;
  public readonly instanced = true;

  /**
   * The geometry this mode was constructed with — the shape one particle
   * draws. Owned by the caller: {@link destroy} leaves it alone, so one mesh
   * can back several modes.
   */
  public readonly mesh: Geometry;

  /**
   * The normalised mesh the executors bind as the per-vertex buffer: the
   * caller's {@link mesh} reduced to `(x, y, u, v)` per vertex, keeping its
   * topology and index list. Owned by this mode and disposed with it.
   */
  public override readonly vertexGeometry: Geometry;

  /** Per-instance layout, byte-identical to the quad's and to the compute output. */
  public readonly dataLayout = new ParticleBufferLayout({
    attributes: instanceAttributes,
    stride: instanceStrideBytes,
    usage: 'stream',
  });

  private readonly _writer = new ParticleInstanceWriter();

  private _meshTable: Float32Array;
  private _meshVersion: number;
  private _material: ParticleMaterial | null = null;
  private _float32 = new Float32Array(this.data);
  private _uint32 = new Uint32Array(this.data);

  public constructor(options: MeshParticlesOptions) {
    super();

    const mesh = options.geometry;

    this.mesh = mesh;
    this._meshTable = readMeshTable(mesh);
    this._meshVersion = mesh.version;
    this.vertexGeometry = new Geometry({
      attributes: meshVertexAttributes,
      vertexData: this._meshTable,
      stride: meshVertexStrideBytes,
      indices: mesh.indices,
      topology: mesh.topology,
      usage: mesh.usage,
    });

    assertVertexGeometryCompatible(this.dataLayout, this.vertexGeometry, this.instanced, 'MeshParticles');
  }

  /**
   * Built on first read rather than in the constructor: a system may be
   * simulated without ever being drawn, and the shader pair is only needed
   * once a backend actually compiles it.
   */
  public get material(): Material {
    this._material ??= new ParticleMaterial({
      shader: new ShaderSource({
        glsl: { vertex: vertexSource, fragment: fragmentSource },
        wgsl: meshParticleWgsl,
      }),
    });

    return this._material;
  }

  public build(system: ParticleSystem): void {
    this._syncMesh();

    // Must precede the view reads below: growing swaps in fresh typed-array
    // views over a new backing buffer.
    this._ensureCapacity(system.liveCount * instanceStrideBytes);

    this._setCount(this._writer.write(system, this._float32, this._uint32));
  }

  public override destroy(): void {
    this._material?.destroy();
    this._material = null;
    this.vertexGeometry.destroy();
  }

  protected override _onBufferGrown(data: ArrayBuffer): void {
    this._float32 = new Float32Array(data);
    this._uint32 = new Uint32Array(data);
  }

  /**
   * Re-read the caller's mesh when it has been mutated since the last look.
   *
   * Re-runs from {@link build} rather than from a draw so it also happens for a
   * system whose backend has not compiled a pipeline yet. A vertex count change
   * swaps the table, which is why the geometry's own `vertexData` is reassigned
   * rather than written through — the executors notice via its `version`.
   */
  private _syncMesh(): void {
    if (this._meshVersion === this.mesh.version) {
      return;
    }

    this._meshVersion = this.mesh.version;

    const table = readMeshTable(this.mesh, this._meshTable);

    if (table !== this._meshTable) {
      this._meshTable = table;
      this.vertexGeometry.vertexData = table;
    }

    this.vertexGeometry.invalidate();
  }
}
