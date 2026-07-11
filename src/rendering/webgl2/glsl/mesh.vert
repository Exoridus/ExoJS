#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
layout(location = 6) in uint a_nodeIndex;

uniform mat3 u_projection;
uniform mat3 u_group;
uniform sampler2D u_transforms;

out vec2 v_texcoord;
out vec4 v_color;
out vec4 v_tint;

void main(void) {
    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0); // a,b,c,d
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0); // tx,ty,0,0
    mat3 transform = mat3(
        m0.x, m0.z, 0.0,
        m0.y, m0.w, 0.0,
        m1.x, m1.y, 1.0
    );

    gl_Position = vec4((u_projection * u_group * transform * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_texcoord = a_texcoord;
    v_color = a_color;
    v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}
