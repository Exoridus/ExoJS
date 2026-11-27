// The occluder mask, covering the camera's view and a margin around it.
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
// One column per light: row 0 is (x, y, reach, 0), row 1 is (axisX, axisY, 0, 0).
// The filter binds a sampler of its own beside it at binding 2; the march reads
// texels by index and never samples between them.
@group(1) @binding(1) var uLights: texture_2d<f32>;

const PI: f32 = 3.14159265359;
/** Hard ceiling on the walk, so a degenerate step cannot hang the device. */
const MAX_STEPS: i32 = 2048;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    // Two texels per bin, one row per light; see `shadow-march.frag`.
    let texel = floor(vUv.x * uniforms.uBins * 2.0);
    let bin = i32(floor(texel * 0.5));

    if (texel > f32(bin) * 2.0 + 0.5) {
        return vec4<f32>(1.0, 0.0, 0.0, 0.0);
    }

    let row = i32(floor(vUv.y * uniforms.uRows));

    let light = textureLoad(uLights, vec2<i32>(row, 0), 0);
    let axis = textureLoad(uLights, vec2<i32>(row, 1), 0);
    let reach = light.z;

    // A row past the last active light, and a light with no reach at all: both
    // read as "nothing blocks" rather than as a shadow over everything.
    if (reach <= 0.0) {
        return vec4<f32>(1.0, 0.0, 1.0, 1.0);
    }

    // Bin centres, where the CPU builder measures a bin an occluder covers
    // whole. The march cannot tell a partly covered bin, so its silhouettes
    // stay accurate to half a bin plus a step.
    let angle = -PI + (f32(bin) + 0.5) * (2.0 * PI / uniforms.uBins);
    let local = vec2<f32>(cos(angle), sin(angle));
    // The rows are built in the light's own frame, so the bin's direction has to
    // be turned back into the world by the light's axis.
    let direction = vec2<f32>(axis.x * local.x - axis.y * local.y, axis.y * local.x + axis.x * local.y);

    var walked = reach;

    for (var taken: i32 = 1; taken <= MAX_STEPS; taken = taken + 1) {
        let distance = f32(taken) * uniforms.uStep;

        if (distance >= reach) {
            break;
        }

        let world = light.xy + direction * distance;
        // Through the mask's own projection, which turns and scales as the
        // camera does; WebGPU writes a render target top-down, so clip +1 is
        // the first row.
        let clip = vec2<f32>(dot(uniforms.uToField.xy, world), dot(uniforms.uToField.zw, world)) + uniforms.uFieldOffset;
        let uv = vec2<f32>(clip.x, -clip.y) * 0.5 + 0.5;

        // Outside the mask nothing is known to block, and the ray may well come
        // back in - so this skips the sample rather than ending the walk.
        // Clamping to the edge instead would smear whatever sits on the border
        // across everything beyond it.
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            if (textureSampleLevel(uTexture, uSampler, uv, 0.0).a > 0.5) {
                walked = distance;

                break;
            }
        }
    }

    // The light shader's texel layout (see `buildShadowRow`): the march only
    // knows whole bins, so the distance covers all of it and no part is partial.
    return vec4<f32>(walked / reach, 0.0, walked / reach, walked / reach);
}
