struct VsOut {
    @builtin(position) position: vec4<f32>,
    @location(0) vUv: vec2<f32>,
};

@vertex
fn vertexMain(@location(0) aPosition: vec2<f32>, @location(1) aUv: vec2<f32>) -> VsOut {
    var out: VsOut;
    out.position = vec4<f32>(aPosition, 0.0, 1.0);
    out.vUv = aUv;
    return out;
}
