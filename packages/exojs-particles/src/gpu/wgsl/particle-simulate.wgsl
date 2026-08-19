@compute @workgroup_size({{workgroupSize}})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= sim.liveCount) { return; }

    let dt = sim.dt;

    // Skip dead particles (lifetime sentinel < 0). Write zero-scale instance
    // so the renderer doesn't accidentally draw them.
    if (timing[idx].y < 0.0) {
        let outBaseDead = idx * 10u;
        for (var k: u32 = 0u; k < 10u; k++) { instanceOutput[outBaseDead + k] = 0u; }
        return;
    }

    // Integration.
    positions[idx] = positions[idx] + velocities[idx] * dt;
    rotInfo[idx].x = rotInfo[idx].x + rotInfo[idx].y * dt;
    timing[idx].x = timing[idx].x + dt;

    // Module bodies (in registration order).
{{moduleBodies}}

    // Resolve frame UVs. Anything that is not a valid explicit index shows
    // frame 0, which is what the CPU packer does and what a slot whose index
    // was never set already shows — `textureIndex` is zero-initialised.
    // Clamping to the last frame instead would be animation-hold semantics,
    // and this is a frame selector rather than an animation cursor.
    let rawFrameIndex = textureIndex[idx];
    let frameIndex = select(0u, rawFrameIndex, rawFrameIndex < {{frameCount}}u);
    let frameUvBounds = frameUv.frames[frameIndex];

    // Pack interleaved instance data (10 u32s per particle):
    //   x, y, scaleX, scaleY, rotation (f32×5) + color (u32) + uvMin.xy (f32×2) + uvMax.xy (f32×2)
    let outBase = idx * 10u;
    instanceOutput[outBase + 0u] = bitcast<u32>(positions[idx].x);
    instanceOutput[outBase + 1u] = bitcast<u32>(positions[idx].y);
    instanceOutput[outBase + 2u] = bitcast<u32>(scales[idx].x);
    instanceOutput[outBase + 3u] = bitcast<u32>(scales[idx].y);
    instanceOutput[outBase + 4u] = bitcast<u32>(rotInfo[idx].x);
    instanceOutput[outBase + 5u] = color[idx];
    instanceOutput[outBase + 6u] = bitcast<u32>(frameUvBounds.x);
    instanceOutput[outBase + 7u] = bitcast<u32>(frameUvBounds.y);
    instanceOutput[outBase + 8u] = bitcast<u32>(frameUvBounds.z);
    instanceOutput[outBase + 9u] = bitcast<u32>(frameUvBounds.w);
}
