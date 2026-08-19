// exojs-build-demo-wgsl
struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};

@vertex
fn vertexMain(@location(0) position: vec2<f32>) -> VsOut {
  var out: VsOut;

  out.position = vec4<f32>(position, 0.0, 1.0);
  out.vUv = position * 0.5 + 0.5;

  return out;
}

@fragment
fn fragmentMain(in: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.vUv, 0.25, 1.0);
}
