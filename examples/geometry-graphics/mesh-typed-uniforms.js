// Auto-generated from mesh-typed-uniforms.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Matrix, Mesh, MeshMaterial, Scene, ShaderSource, UniformStruct, UniformType } from '@codexo/exojs';
const UV_GRID = assets.technical.filtering.uvGrid256;
const SIZE = 420;
// The declaration is the single source of truth for names, types and layout.
// The engine lays the block out once - a nested struct aligned to 16 bytes, a
// mat3 as three 16-byte columns - and generates a matching GLSL block and WGSL
// struct, so neither shader body declares a user uniform of its own.
const shader = new ShaderSource({
  uniforms: {
    time: UniformType.Float,
    warp: new UniformStruct({ amplitude: UniformType.Float, frequency: UniformType.Float }),
    uvTransform: UniformType.Mat3,
  },
  glsl: {
    vertex: `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
uniform mat3 u_projection;
uniform mat3 u_translation;
out vec2 v_uv;
void main() {
    float wave = sin(a_position.x * uniforms.warp.frequency + uniforms.time) * uniforms.warp.amplitude;
    vec3 world = u_translation * vec3(a_position.x, a_position.y + wave, 1.0);
    gl_Position = vec4((u_projection * world).xy, 0.0, 1.0);
    v_uv = (uniforms.uvTransform * vec3(a_texcoord, 1.0)).xy;
}`,
    fragment: `#version 300 es
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_tint;
in vec2 v_uv;
out vec4 fragColor;
void main() { fragColor = texture(u_texture, v_uv) * u_tint; }`,
  },
  wgsl: `
struct MeshUniforms {
    projection: mat3x3<f32>,
    translation: mat3x3<f32>,
    tint: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u_mesh: MeshUniforms;
@group(1) @binding(0) var u_texture: texture_2d<f32>;
@group(1) @binding(1) var u_sampler: sampler;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let wave = sin(input.position.x * uniforms.warp.frequency + uniforms.time) * uniforms.warp.amplitude;
    let world = u_mesh.translation * vec3<f32>(input.position.x, input.position.y + wave, 1.0);
    let clip = u_mesh.projection * world;
    out.position = vec4<f32>(clip.xy, 0.0, 1.0);
    out.uv = (uniforms.uvTransform * vec3<f32>(input.texcoord, 1.0)).xy;
    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(u_texture, u_sampler, in.uv) * u_mesh.tint;
}`,
});
class MeshTypedUniformsScene extends Scene {
  mesh;
  material = new MeshMaterial({
    shader,
    uniforms: { warp: { amplitude: 18, frequency: 0.02 }, uvTransform: Matrix.identity },
  });
  uvRotation = new Matrix();
  time = 0;
  init() {
    const { width, height } = this.app;
    const half = SIZE / 2;
    this.mesh = new Mesh({
      vertices: new Float32Array([-half, -half, half, -half, half, half, -half, half]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      texture: this.loader.get(UV_GRID),
      material: this.material,
    });
    this.mesh.setPosition((width / 2) | 0, (height / 2) | 0);
  }
  update(delta) {
    this.time += delta;
    // Each write goes straight into the material's own block and moves its
    // revision; a value that did not change costs no upload at all.
    this.material.uniforms.time.set(this.time);
    this.material.uniforms.warp.amplitude.set(18 + Math.sin(this.time * 0.7) * 10);
    this.material.uniforms.uvTransform.set(this.uvRotation.set(1, 0, 0, 0, 1, 0, 0, 0, 1).rotate(this.time * 0.3, 0.5, 0.5));
  }
  draw(context) {
    context.render(this.mesh);
  }
}
const app = new Application({
  scenes: { MeshTypedUniformsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(MeshTypedUniformsScene);
