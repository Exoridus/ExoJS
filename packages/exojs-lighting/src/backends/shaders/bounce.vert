// Vertex stage of the bounce quad: the camera's own view rectangle drawn into
// the emission field, so that each fragment lands where the frame's pixel is
// in the world. The instance transform maps the unit quad onto that
// rectangle, and the quad's own corners are the frame's texture coordinates.
out vec2 v_texcoord;
out vec4 v_tint;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    // The corners run 0..1 from clip -1 to +1 on both axes, which on WebGL2 is
    // the frame's own texture space, bottom-up. The WGSL half flips v.
    v_texcoord = a_texcoord;
    v_tint = exoInstanceTint(a_nodeIndex);
}
