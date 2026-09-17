#version 300 es
// highp throughout: the march walks world coordinates that can be thousands of
// units from the origin, and a 10-bit mantissa turns a step of one texel into
// no step at all out there.
precision highp float;
precision highp int;

// The occluder mask, covering the camera's view.
uniform sampler2D uTexture;
// One column per light: row 0 is (x, y, reach, 0), row 1 is (axisX, axisY, 0, 0).
uniform highp sampler2D uLights;

in vec2 vUv;
out vec4 fragColor;

const float PI = 3.14159265359;
/** Hard ceiling on the walk, so a degenerate reach cannot hang the driver. */
const int MAX_STEPS = 2048;

void main() {
    // The destination is `bins` wide with one row per light, so the fragment's
    // own place in it IS the (bin, light) pair the CPU builder indexes by.
    int bin = int(floor(vUv.x * uniforms.uBins));
    int row = int(floor(vUv.y * uniforms.uRows));

    vec4 light = texelFetch(uLights, ivec2(row, 0), 0);
    vec4 axis = texelFetch(uLights, ivec2(row, 1), 0);
    float reach = light.z;

    if (reach <= 0.0) {
        fragColor = vec4(1.0, 0.0, 0.0, 1.0);

        return;
    }

    // Bin centres, the same ones the CPU builder samples at, so the two agree
    // to within the step rather than to within half a bin plus a step.
    float angle = -PI + (float(bin) + 0.5) * (2.0 * PI / uniforms.uBins);
    vec2 local = vec2(cos(angle), sin(angle));
    // The rows are built in the light's own frame, so the bin's direction has to
    // be turned back into the world by the light's axis.
    vec2 direction = vec2(axis.x * local.x - axis.y * local.y, axis.y * local.x + axis.x * local.y);
    float walked = reach;

    for (int taken = 1; taken <= MAX_STEPS; taken++) {
        float distance = float(taken) * uniforms.uStep;

        if (distance >= reach) {
            break;
        }

        vec2 uv = (light.xy + direction * distance - uniforms.uViewMin) / uniforms.uViewSize;

        // Outside the mask nothing is known to block, and the ray may well come
        // back in - so this skips the sample rather than ending the walk.
        // Clamping to the edge instead would smear whatever sits on the border
        // across everything beyond it.
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            // Flipped on v because WebGL2 writes a render target bottom-up and
            // the mask is one. The WGSL half needs no flip.
            if (texture(uTexture, vec2(uv.x, 1.0 - uv.y)).a > 0.5) {
                walked = distance;

                break;
            }
        }
    }

    fragColor = vec4(walked / reach, 0.0, 0.0, 1.0);
}
