struct ProjectionUniforms {
    matrix: mat4x4<f32>,
    group: mat4x4<f32>,
    viewport: vec4<f32>,        // device-pixel snap rect (x, y, width, height)
};
struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
};

@group(0) @binding(0) var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1) var<storage, read> transforms: array<TransformSlot>;
@group(1) @binding(0) var spriteTexture: texture_2d<f32>;
@group(1) @binding(1) var spriteSampler: sampler;

struct VOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv:    vec2<f32>,
    @location(1) color: vec4<f32>,
};

// Render-only pixel snapping (slot.m1.z: 0 = none, non-zero = snap origin).
// Snap the node ORIGIN's device-pixel position and rigid-shift the whole
// primitive by the same delta. floor(x + 0.5) matches the CPU Math.round
// policy; WGSL round() is half-to-even. Grid alignment is independent of the
// y-axis convention because the staged viewport rect is whole device pixels.
fn snapPosition(position: vec4<f32>, slot: TransformSlot) -> vec4<f32> {
    if (slot.m1.z == 0.0) {
        return position;
    }
    let originClip = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
    let originDevice = projection.viewport.xy + (originClip.xy * 0.5 + vec2<f32>(0.5)) * projection.viewport.zw;
    let snapDelta = (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(projection.viewport.zw, vec2<f32>(1.0));
    return vec4<f32>(position.xy + snapDelta, position.z, position.w);
}

// Round one local boundary coordinate to the device grid along an axis whose
// local-to-device scale is scale: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two quads sharing a boundary snap identically — seams stay
// closed. Degenerate scales pass the value through unchanged.
fn snapBoundary(localValue: f32, scale: f32) -> f32 {
    if (abs(scale) < 1e-6) {
        return localValue;
    }
    return floor(localValue * scale + 0.5) / scale;
}

// Per-axis device scale for the geometry boundary snap, derived from the
// composed pipeline: device positions of the local origin and the two local
// unit axes. Returns (scaleX, scaleY,
// axisAligned) where axisAligned is 1.0 only when the cross-terms vanish (safe
// to boundary-snap), else 0.0.
fn deviceSnapScale(slot: TransformSlot) -> vec3<f32> {
    let vp = projection.viewport.zw;
    let dO = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
    let devO = projection.viewport.xy + (dO.xy * 0.5 + vec2<f32>(0.5)) * vp;
    let dX = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.x, slot.m1.y + slot.m0.z, 0.0, 1.0);
    let dY = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.y, slot.m1.y + slot.m0.w, 0.0, 1.0);
    let devX = projection.viewport.xy + (dX.xy * 0.5 + vec2<f32>(0.5)) * vp;
    let devY = projection.viewport.xy + (dY.xy * 0.5 + vec2<f32>(0.5)) * vp;
    let axisAligned = select(0.0, 1.0, abs(devX.y - devO.y) < 1e-3 && abs(devY.x - devO.x) < 1e-3);
    return vec3<f32>(devX.x - devO.x, devY.y - devO.y, axisAligned);
}
