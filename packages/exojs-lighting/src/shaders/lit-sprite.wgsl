// Forward point lighting for one sprite fragment. The engine prepends its
// sprite-material prologue, which declares `VertexOutput`, the group(0)
// projection, the group(1) base-texture slot table and `sampleBase()`.
//
// group(2) binding 0 is the engine's user-uniform buffer, unused here: the
// light count and the ambient term travel in the light texture, so this
// material has no per-frame uniform to write.
@group(2) @binding(1) var u_normalMap: texture_2d<f32>;
@group(2) @binding(2) var u_normalMapSampler: sampler;
@group(2) @binding(3) var u_lights: texture_2d<f32>;
@group(2) @binding(4) var u_lightsSampler: sampler;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let base = sampleBase(input.textureSlot, input.texcoord);

    // Rotate the tangent-space normal by the instance's local-to-world basis so
    // a spinning or mirrored sprite keeps its bumps facing the right way.
    let tangentNormal = textureSample(u_normalMap, u_normalMapSampler, input.texcoord).xyz * 2.0 - 1.0;
    let axisX = normalize(vec2<f32>(input.basis.x, input.basis.z));
    let axisY = normalize(vec2<f32>(input.basis.y, input.basis.w));
    let normal = normalize(vec3<f32>(axisX * tangentNormal.x + axisY * tangentNormal.y, tangentNormal.z));

    let count = i32(textureLoad(u_lights, vec2<i32>(0, 0), 0).x);
    var lit = textureLoad(u_lights, vec2<i32>(0, 1), 0).rgb;

    for (var index = 0; index < count; index = index + 1) {
        let light = textureLoad(u_lights, vec2<i32>(index + 1, 0), 0);
        let tint = textureLoad(u_lights, vec2<i32>(index + 1, 1), 0);
        let toLight = light.xy - input.worldPosition;
        let falloff = clamp(1.0 - length(toLight) / light.z, 0.0, 1.0);
        let direction = normalize(vec3<f32>(toLight, tint.w));

        lit = lit + tint.rgb * (max(dot(normal, direction), 0.0) * falloff * falloff * light.w);
    }

    return vec4<f32>(base.rgb * lit, base.a) * input.color;
}
