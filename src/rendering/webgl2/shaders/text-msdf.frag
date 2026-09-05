#version 300 es
// The edge math runs in fp32 even though nothing else here needs it: the
// antialiased band is a few thousandths of the field wide, while fp16's spacing
// around the 0.5 threshold is 2^-11. A driver that honours `mediump` as real
// half-float would therefore quantise the ramp itself rather than the value
// being ramped, which reads as a hard edge on a magnified glyph. Desktop ANGLE
// and SwiftShader compute `mediump` at fp32 regardless, so this is a guarantee
// for hardware that honours the qualifier, not a fix for a defect visible on a
// workstation.
precision highp float;

uniform sampler2D u_nodeData;  // RGBA32F per-node data (see WebGl2TextRenderer)
uniform float     u_pageSize;  // atlas page size in px (for shadow UV conversion)

flat in int   v_nodeIndex;
flat in uint  v_decoration;
flat in vec4  v_pxAxes;
     in vec2  v_texcoord;
     in vec2  v_gradUV;

layout(location = 0) out vec4 fragColor;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

// ── Gradient ramp ────────────────────────────────────────────────────────────
//
// The stops live in the node's own packed row: colours in texels 10..17, their
// offsets packed four to a texel in 18 and 19. Walked in order and interpolated
// pairwise, which is the same evaluation the CPU-side `Gradient` performs, so a
// baked ramp and a text one cannot disagree about a colour.

float gradientStopOffset(int ni, int index) {
  vec4 packed = texelFetch(u_nodeData, ivec2(18 + (index >> 2), ni), 0);
  int lane = index & 3;

  if (lane == 0) return packed.x;
  if (lane == 1) return packed.y;
  if (lane == 2) return packed.z;
  return packed.w;
}

vec4 evalTextGradient(int ni, int stopCount, float t) {
  float position   = clamp(t, 0.0, 1.0);
  float prevOffset = gradientStopOffset(ni, 0);
  vec4  prevColor  = texelFetch(u_nodeData, ivec2(10, ni), 0);

  for (int i = 1; i < 8; i++) {
    if (i >= stopCount) break;

    float offset = gradientStopOffset(ni, i);
    vec4  color  = texelFetch(u_nodeData, ivec2(10 + i, ni), 0);

    if (position <= offset) {
      // Coincident stops are a hard colour break, not a division by zero.
      float span = max(offset - prevOffset, 1e-6);

      return mix(prevColor, color, clamp((position - prevOffset) / span, 0.0, 1.0));
    }

    prevOffset = offset;
    prevColor  = color;
  }

  return prevColor;
}

void main(void) {
  int ni = v_nodeIndex;

  // Same node data layout as text-sdf.frag
  // texel 2: fillColor
  // texel 3: outlineColor
  // texel 4: (outlineMin, shadowAlpha, shadowBlur, gradientStopCount)
  //          outlineMin = 0.5 → disabled; outlineMin < 0.5 → enabled
  // texel 5: shadowColor
  // texel 6: (shadowOffX_px, shadowOffY_px, 0, sdfRadius_logical)
  // texel 7: (gradAxisX, gradAxisY, gradBias, 0)
  // texels 10-19: gradient stop colours and offsets
  vec4 tFill    = texelFetch(u_nodeData, ivec2(2, ni), 0);
  vec4 tOutline = texelFetch(u_nodeData, ivec2(3, ni), 0);
  vec4 tParams  = texelFetch(u_nodeData, ivec2(4, ni), 0);
  vec4 tShadow  = texelFetch(u_nodeData, ivec2(5, ni), 0);
  vec4 tShadow2 = texelFetch(u_nodeData, ivec2(6, ni), 0);
  vec4 tGradAxis = texelFetch(u_nodeData, ivec2(7, ni), 0);

  float outlineMin   = tParams.x;
  float shadowAlpha  = tParams.y;
  float blur         = tParams.z;
  int   gradStops    = int(tParams.w + 0.5);
  vec2  shadowOffset = tShadow2.xy / u_pageSize;

  vec3  msd  = sampleBase(v_textureSlot, v_texcoord).rgb;
  float sd   = median(msd.r, msd.g, msd.b);

  // See text-sdf.frag: the edge fades over one DEVICE pixel rather than over a
  // constant in field units. An MSDF atlas is built offline and carries no
  // distance range in its font data, so its field scale is unknown here and the
  // width has to come from the hardware derivative.
  float aa   = max(fwidth(sd) * 0.5, 0.0001);
  float fill = smoothstep(0.5 - aa, 0.5 + aa, sd);

  float outline = outlineMin < 0.5
    ? smoothstep(outlineMin - aa, outlineMin + aa, sd) * (1.0 - fill)
    : 0.0;

  float shadowSoft = max(aa, blur);
  vec3  shadowMsd  = sampleBase(v_textureSlot, v_texcoord - shadowOffset).rgb;
  float shadowSd   = median(shadowMsd.r, shadowMsd.g, shadowMsd.b);
  float shadow     = smoothstep(0.5 - shadowSoft, 0.5 + shadowSoft, shadowSd)
                     * shadowAlpha * (1.0 - fill) * (1.0 - outline);

  vec4 fillColor;
  if (gradStops > 0) {
    // gradUV runs 0..1 across the ink box; the packed axis and bias turn that
    // into the ramp position for whatever angle the style asked for.
    fillColor = evalTextGradient(ni, gradStops, dot(v_gradUV, tGradAxis.xy) + tGradAxis.z);
  } else {
    fillColor = tFill;
  }

  // A rule samples solid ink, so it would otherwise be coloured exactly like a
  // glyph interior - which is the default, and the reason an underline picks up
  // the gradient for free. An explicit decoration colour overrides it here.
  if (v_decoration == 1u && tShadow2.z > 0.5) {
    fillColor = texelFetch(u_nodeData, ivec2(8, ni), 0);
  }

  fragColor = fillColor * fill
            + tOutline  * outline
            + tShadow   * shadow;
}
