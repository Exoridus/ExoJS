// Vertex stage of one occluder segment rasterised into the mask. The instance
// transform maps the unit quad onto the segment, two texels wide, and the
// fragment stage fades the coverage across that width.
out float v_across;

void main() {
    gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
    // The quad's own y runs -0.5..0.5 across the segment, which the transform
    // makes a texel to either side of the edge.
    v_across = a_position.y * 2.0;
}
