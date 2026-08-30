#version 300 es
precision lowp float;
precision lowp int;

// Multi-texture sprite batching: up to 16 textures bound per draw call,
// each fragment selects its source via a flat-interpolated slot index.
// WebGL2 guarantees MAX_TEXTURE_IMAGE_UNITS >= 16, so all 16 samplers fit
// the fragment stage; the shared transform buffer texture binds on the
// next unit (16), which fits within the >= 32 combined-unit guarantee.
//
// GLSL ES 3.0 forbids non-constant array-of-sampler indexing unless the
// expression is dynamically uniform — which a per-vertex slot is not
// once different triangles in the same batch carry different slots. The
// if/else chain below dispatches statically and dodges that constraint.

uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform sampler2D u_texture2;
uniform sampler2D u_texture3;
uniform sampler2D u_texture4;
uniform sampler2D u_texture5;
uniform sampler2D u_texture6;
uniform sampler2D u_texture7;
uniform sampler2D u_texture8;
uniform sampler2D u_texture9;
uniform sampler2D u_texture10;
uniform sampler2D u_texture11;
uniform sampler2D u_texture12;
uniform sampler2D u_texture13;
uniform sampler2D u_texture14;
uniform sampler2D u_texture15;

// UVs need full precision on mobile GLES: the file-level lowp default would
// quantise texture coordinates (visible as swimming/snapping texels on large
// atlases). The color varying stays lowp — 8-bit output needs no more.
in highp vec2 v_texcoord;
in vec4 v_color;
flat in uint v_textureSlot;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 sampleColor;

    if (v_textureSlot == 0u) {
        sampleColor = texture(u_texture0, v_texcoord);
    } else if (v_textureSlot == 1u) {
        sampleColor = texture(u_texture1, v_texcoord);
    } else if (v_textureSlot == 2u) {
        sampleColor = texture(u_texture2, v_texcoord);
    } else if (v_textureSlot == 3u) {
        sampleColor = texture(u_texture3, v_texcoord);
    } else if (v_textureSlot == 4u) {
        sampleColor = texture(u_texture4, v_texcoord);
    } else if (v_textureSlot == 5u) {
        sampleColor = texture(u_texture5, v_texcoord);
    } else if (v_textureSlot == 6u) {
        sampleColor = texture(u_texture6, v_texcoord);
    } else if (v_textureSlot == 7u) {
        sampleColor = texture(u_texture7, v_texcoord);
    } else if (v_textureSlot == 8u) {
        sampleColor = texture(u_texture8, v_texcoord);
    } else if (v_textureSlot == 9u) {
        sampleColor = texture(u_texture9, v_texcoord);
    } else if (v_textureSlot == 10u) {
        sampleColor = texture(u_texture10, v_texcoord);
    } else if (v_textureSlot == 11u) {
        sampleColor = texture(u_texture11, v_texcoord);
    } else if (v_textureSlot == 12u) {
        sampleColor = texture(u_texture12, v_texcoord);
    } else if (v_textureSlot == 13u) {
        sampleColor = texture(u_texture13, v_texcoord);
    } else if (v_textureSlot == 14u) {
        sampleColor = texture(u_texture14, v_texcoord);
    } else {
        sampleColor = texture(u_texture15, v_texcoord);
    }

    fragColor = sampleColor * v_color;
}
