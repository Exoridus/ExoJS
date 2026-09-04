#version 300 es
precision highp float;

// Placeholder. The renderer owns the vertex stage of every sprite material and
// never compiles this source; `ShaderSource` requires a GLSL vertex string, so
// one has to exist. Nothing here reaches the GPU.
void main(void) {
    gl_Position = vec4(0.0);
}
