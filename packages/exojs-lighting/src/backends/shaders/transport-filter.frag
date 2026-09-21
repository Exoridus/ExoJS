#version 300 es
precision highp float;
precision highp int;

// The filter's own input: the cascade above for a level, and nothing a
// visibility pass reads.
uniform sampler2D uTexture;

in vec2 vUv;
out vec4 fragColor;
