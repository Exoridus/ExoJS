out vec2 v_texcoord;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    // The quad spans the frame, so its own corners are the texture coordinates
    // - flipped on v, because WebGL2 writes a render target bottom-up and both
    // the frame and the light field are render targets. The WGSL half needs no
    // such flip: WebGPU writes them top-down.
    v_texcoord = vec2(a_texcoord.x, 1.0 - a_texcoord.y);
}
