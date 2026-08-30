#version 300 es
precision lowp float;

layout(location = 0) out vec4 fragColor;

// Color writes are masked off while the stencil silhouette is drawn, so this
// output is discarded; it exists only to make the program link.
void main(void) {
    fragColor = vec4(0.0);
}
