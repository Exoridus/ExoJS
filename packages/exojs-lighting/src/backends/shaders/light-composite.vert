out vec2 v_texcoord;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    // The quad spans the frame, so its own corners are the texture coordinates.
    v_texcoord = a_texcoord;
}
