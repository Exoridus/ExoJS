#version 300 es
precision mediump float;

in vec4 v_tint;

out vec4 fragColor;

void main() {
    fragColor = v_tint;
}
