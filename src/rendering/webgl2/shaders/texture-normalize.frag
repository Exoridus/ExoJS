#version 300 es
precision highp float;

// Managed-colour alpha normalization: one unblended, 1:1 pass per authored mip
// level.
//
// The staging texture holds the STRAIGHT source in the destination's own
// storage format, so sampling it already yields linear RGB and the alpha
// arrives untouched. Multiplying by that alpha therefore premultiplies in linear
// light, and writing into a same-format destination re-encodes on store: an sRGB
// destination keeps E(linearRGB * alpha), not E(linearRGB) * alpha.
//
// The multiply belongs here, before any filtering. A draw-time multiply would
// filter straight RGB independently of alpha and let a fully transparent
// pixel's hidden colour bleed across the edge - the fringe this pass exists to
// remove, and one no shader multiply can undo afterwards. The draw itself is
// NEAREST and 1:1, so no texel is resampled.

uniform sampler2D u_source;
// Fraction of the staging texture this level fills. A level smaller than the
// base level lands in the staging texture's top-left corner and must sample only
// its own sub-rectangle, or it would read the base level's texels.
uniform vec2 u_levelScale;

in vec2 vUv;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 texel = texture(u_source, vUv * u_levelScale);

    fragColor = vec4(texel.rgb * texel.a, texel.a);
}
