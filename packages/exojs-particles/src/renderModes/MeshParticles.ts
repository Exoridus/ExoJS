import type { AttributeType, GeometryAttribute, Material } from '@codexo/exojs';
import { Geometry, ShaderSource } from '@codexo/exojs';

import type { ParticleSystem } from '#ParticleSystem';

import fragmentSource from '../renderers/glsl/particle.frag';
import { instanceAttributes, instanceStrideBytes, ParticleInstanceWriter } from './ParticleInstanceWriter';
import { ParticleMaterial } from './ParticleMaterial';
import { ParticleRenderMode } from './ParticleRenderMode';

/** Floats one entry of the baked mesh vertex table occupies: x, y, u, v. */
const floatsPerMeshVertex = 4;

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
   * per-particle scale and rotation are applied. Read once, at construction:
   * mutating it afterwards does not re-bake the shader.
   *
   * Its position attribute (`a_position`/`position`) supplies the vertex
   * positions and its texcoord attribute (`a_texcoord`/`texcoord`/`a_uv`/`uv`)
   * the UVs. See {@link MeshParticles} for what a geometry without the latter
   * renders as.
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
 * Reads a mesh geometry's (x, y, u, v) per vertex into one flat table.
 *
 * `Geometry` guarantees a position attribute exists — it resolves one in its
 * own constructor and throws otherwise — so the same resolution order is
 * mirrored here rather than re-validated. A geometry without a texcoord
 * attribute leaves the UV columns at zero.
 */
const readMeshTable = (mesh: Geometry): Float32Array => {
  const { attributes, stride, vertexData } = mesh;
  const vertexCount = mesh.vertexCount;
  const table = new Float32Array(vertexCount * floatsPerMeshVertex);
  const view =
    vertexData instanceof Float32Array ? new DataView(vertexData.buffer, vertexData.byteOffset, vertexData.byteLength) : new DataView(vertexData);

  const position =
    attributes.find(attribute => positionAttributeNames.has(attribute.name)) ??
    attributes.find(attribute => attribute.name.toLowerCase().includes('position'))!;
  const texcoord = attributes.find(attribute => texcoordAttributeNames.has(attribute.name)) ?? null;

  for (let i = 0; i < vertexCount; i++) {
    const vertexStart = i * stride;
    const out = i * floatsPerMeshVertex;

    table[out + 0] = readComponent(view, position, vertexStart + position.offset);
    table[out + 1] = readComponent(view, position, vertexStart + position.offset + componentByteSizes[position.type]);

    if (texcoord !== null) {
      table[out + 2] = readComponent(view, texcoord, vertexStart + texcoord.offset);
      table[out + 3] = readComponent(view, texcoord, vertexStart + texcoord.offset + componentByteSizes[texcoord.type]);
    }
  }

  return table;
};

/**
 * Render a number as a shader float literal. Both GLSL ES 3.00 and WGSL accept
 * exponent forms as written, but an integral value needs the decimal point to
 * read as a float rather than an int.
 */
const formatFloat = (value: number): string => {
  const text = String(value);

  return /[.eE]/.test(text) ? text : `${text}.0`;
};

const glslMeshTable = (table: Float32Array): string => {
  const count = table.length / floatsPerMeshVertex;
  const entries: string[] = [];

  for (let i = 0; i < count; i++) {
    const o = i * floatsPerMeshVertex;

    entries.push(`    vec4(${formatFloat(table[o]!)}, ${formatFloat(table[o + 1]!)}, ${formatFloat(table[o + 2]!)}, ${formatFloat(table[o + 3]!)})`);
  }

  return `const vec4 c_meshVertices[${count}] = vec4[${count}](\n${entries.join(',\n')}\n);`;
};

const wgslMeshTable = (table: Float32Array): string => {
  const count = table.length / floatsPerMeshVertex;
  const entries: string[] = [];

  for (let i = 0; i < count; i++) {
    const o = i * floatsPerMeshVertex;

    entries.push(
      `    vec4<f32>(${formatFloat(table[o]!)}, ${formatFloat(table[o + 1]!)}, ${formatFloat(table[o + 2]!)}, ${formatFloat(table[o + 3]!)})`,
    );
  }

  return `var<private> meshVertices: array<vec4<f32>, ${count}> = array<vec4<f32>, ${count}>(\n${entries.join(',\n')}\n);`;
};

/**
 * GLSL vertex stage for {@link MeshParticles}, baked around one mesh's vertex
 * table. Line for line the quad's `glsl/particle.vert` with two substitutions:
 * the corner derived from `gl_VertexID` becomes a lookup into the table at
 * `gl_VertexID`, and the corner-selected UV becomes a mix across the whole
 * mesh UV.
 *
 * Generated rather than shipped as a `.vert` file because the table is
 * per-mesh: the executors bind exactly one vertex buffer, which the
 * per-instance data already occupies, and neither backend lets a mode
 * contribute a uniform of its own. Baking the mesh into the source is what
 * keeps this mode inside the seam. The fragment stage needs no baking, so it
 * is the shipped quad fragment shader unchanged.
 */
export const meshParticleVertexGlsl = (table: Float32Array): string => `#version 300 es
precision highp float;
precision highp int;

// Per-instance attributes (one entry per particle, 40 bytes total).
layout(location = 0) in vec2 a_position;         // particle position in system-local space
layout(location = 1) in vec2 a_scale;            // particle scale
layout(location = 2) in float a_rotation;        // particle rotation in degrees
layout(location = 3) in vec4 a_color;            // RGBA tint
layout(location = 4) in vec2 a_uvMin;            // top-left UV (u, v) — pre-resolved per instance
layout(location = 5) in vec2 a_uvMax;            // bottom-right UV (u, v) — pre-resolved per instance

uniform mat3 u_projection;
uniform mat3 u_systemTransform;

// The mesh's own vertices as (x, y, u, v), addressed by the value the index
// buffer supplies — the same role gl_VertexID plays for the quad's corners.
${glslMeshTable(table)}

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    vec4 meshVertex = c_meshVertices[gl_VertexID];
    vec2 local = meshVertex.xy;

    // Per-particle scale + rotation, identical to the quad's.
    vec2 rotation = vec2(sin(radians(a_rotation)), cos(radians(a_rotation)));
    vec2 transformed = vec2(
        (local.x * (a_scale.x * rotation.y)) + (local.y * (a_scale.y * rotation.x)),
        (local.x * (a_scale.x * -rotation.x)) + (local.y * (a_scale.y * rotation.y))
    );

    vec3 worldPos = vec3(transformed + a_position, 1.0);

    gl_Position = vec4((u_projection * u_systemTransform * worldPos).xy, 0.0, 1.0);

    // The mesh's own UVs address the particle's frame rather than the whole
    // texture, so a mesh particle still selects an atlas frame.
    v_texcoord = mix(a_uvMin, a_uvMax, meshVertex.zw);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}
`;

/**
 * WGSL counterpart of {@link meshParticleVertexGlsl} plus the quad's fragment
 * stage. Vertex and fragment entry points share one source per WGSL
 * convention, and the per-instance attributes bind by `@location`, matching
 * the declaration order and byte offsets of `instanceAttributes`.
 *
 * The uniform struct is the one the WebGPU particle renderer writes for every
 * mode, so `localBounds` and `uvBounds` are declared but unused here: a mesh
 * carries its own local footprint rather than taking it from the texture frame.
 */
export const meshParticleWgsl = (table: Float32Array): string => `
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

// The mesh's own vertices as (x, y, u, v), addressed by the value the index
// buffer supplies — the same role vertex_index plays for the quad's corners.
${wgslMeshTable(table)}

// Per-instance attributes (one entry per particle, 40 bytes total).
struct VertexInput {
    @builtin(vertex_index) vertexIndex: u32,
    @location(0) translation: vec2<f32>,
    @location(1) scale: vec2<f32>,
    @location(2) rotation: f32,
    @location(3) color: vec4<f32>,
    @location(4) uvMin: vec2<f32>,            // pre-resolved frame UV (top-left)
    @location(5) uvMax: vec2<f32>,            // pre-resolved frame UV (bottom-right)
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let meshVertex = meshVertices[input.vertexIndex];
    let localPosition = meshVertex.xy;

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
    output.texcoord = mix(input.uvMin, input.uvMax, meshVertex.zw);
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
 * **The mesh is baked into the shader**, read once at construction. Its
 * vertices become a constant `(x, y, u, v)` table addressed by the vertex
 * index, which is the same thing the quad does with its four corners — from the
 * shader's side a mesh is just a quad with more vertices. Consequences worth
 * knowing:
 *
 * - One `MeshParticles` instance means one compiled program per backend, so
 *   share a single instance across the systems that draw the same shape rather
 *   than constructing one per system.
 * - Mutating the geometry after construction changes nothing. Construct a new
 *   mode instead.
 * - The table is shader source, so a mesh of a few hundred vertices is the
 *   sensible ceiling; this mode is for sparks, shards, leaves and petals, not
 *   for detailed models.
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
   * The base geometry the executors draw with. It carries the mesh's topology
   * and index buffer — that is what turns the mesh's vertices into triangles —
   * while its attributes describe the per-instance buffer {@link build} fills,
   * because that buffer is the only one bound. The placeholder `vertexData` is
   * sized to the mesh's vertex count so a mesh without indices still draws all
   * of its vertices per instance.
   */
  public readonly geometry: Geometry;

  private readonly _meshTable: Float32Array;
  private readonly _writer = new ParticleInstanceWriter();

  private _material: ParticleMaterial | null = null;
  private _float32 = new Float32Array(this.data);
  private _uint32 = new Uint32Array(this.data);

  public constructor(options: MeshParticlesOptions) {
    super();

    const mesh = options.geometry;

    this.mesh = mesh;
    this._meshTable = readMeshTable(mesh);
    this.geometry = new Geometry({
      attributes: instanceAttributes,
      vertexData: new ArrayBuffer(mesh.vertexCount * instanceStrideBytes),
      stride: instanceStrideBytes,
      indices: mesh.indices,
      topology: mesh.topology,
      usage: 'stream',
    });
  }

  /**
   * Built on first read rather than in the constructor: a system may be
   * simulated without ever being drawn, and the shader pair is only needed
   * once a backend actually compiles it.
   */
  public get material(): Material {
    this._material ??= new ParticleMaterial({
      shader: new ShaderSource({
        glsl: { vertex: meshParticleVertexGlsl(this._meshTable), fragment: fragmentSource },
        wgsl: meshParticleWgsl(this._meshTable),
      }),
    });

    return this._material;
  }

  public build(system: ParticleSystem): void {
    // Must precede the view reads below: growing swaps in fresh typed-array
    // views over a new backing buffer.
    this._ensureCapacity(system.liveCount * instanceStrideBytes);

    this._setCount(this._writer.write(system, this._float32, this._uint32));
  }

  public override destroy(): void {
    this._material?.destroy();
    this._material = null;
    this.geometry.destroy();
  }

  protected override _onBufferGrown(data: ArrayBuffer): void {
    this._float32 = new Float32Array(data);
    this._uint32 = new Uint32Array(data);
  }
}
