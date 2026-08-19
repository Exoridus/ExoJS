#version 300 es

precision mediump float;

// exojs-build-demo-fragment
in vec2 vUv;
uniform float u_time;

out vec4 fragColor;

void main() {
  fragColor = vec4(vUv, abs(sin(u_time)), 1.0);
}
