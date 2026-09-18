#version 300 es
precision mediump float;

// Distance across the segment, in texels, -1..1.
in float v_across;

out vec4 fragColor;

void main() {
    // Full coverage on the edge, none a texel away, and linear between: the
    // distance field reads a texel's coverage back as where inside it the edge
    // runs, so the edge is placed to a fraction of a texel rather than snapped
    // to the grid - and a wall at an angle casts a straight shadow instead of a
    // stepped one. Lifted a little above the ramp, so that a segment lying
    // exactly on a texel boundary - a tile edge, most of the time - still
    // seeds the texels on both sides rather than neither: at half a texel out
    // the coverage is then six tenths, not the threshold itself.
    float coverage = clamp(1.1 - abs(v_across), 0.0, 1.0);

    fragColor = vec4(coverage, coverage, coverage, coverage);
}
