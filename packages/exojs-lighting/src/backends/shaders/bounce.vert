// Vertex stage of the bounce quad: the camera's own view rectangle drawn into
// the emission field, so that each fragment lands where the frame's pixel is
// in the world. The instance transform maps the unit quad onto that
// rectangle, and the quad's own corners are the frame's texture coordinates.
out vec2 v_texcoord;
out vec2 v_history;
out vec4 v_tint;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    // The corners run 0..1 from clip -1 to +1 on both axes, which on WebGL2 is
    // the frame's own texture space, bottom-up. The WGSL half flips v.
    v_texcoord = a_texcoord;

    // Where this corner sat in the PREVIOUS frame's camera, which is the frame
    // the light field being read was gathered through. The map is affine, so
    // interpolating the corners is exact and the fragment stage needs no
    // matrix of its own.
    vec2 clip = a_texcoord * 2.0 - 1.0;
    vec2 previous = vec2(dot(uniforms.uReproject.xy, clip), dot(uniforms.uReproject.zw, clip)) + uniforms.uReprojectOffset;

    v_history = previous * 0.5 + 0.5;
    v_tint = exoInstanceTint(a_nodeIndex);
}
