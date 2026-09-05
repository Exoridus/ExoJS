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
flat in vec4  v_pxAxes;
     in vec2  v_texcoord;
     in vec2  v_gradUV;

layout(location = 0) out vec4 fragColor;

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

  float sd   = sampleBase(v_textureSlot, v_texcoord).r;

  // Antialiasing width, measured against the PROJECTED pixel footprint rather
  // than fixed in field units. A constant cannot be right everywhere at once: it
  // renders a hard, aliased step wherever the glyph is dense and a multi-pixel
  // smear wherever it is magnified.
  //
  // The field moves by 1/sdfRadius per LOCAL unit — the atlas density cancels,
  // because a denser atlas packs proportionally more texels into the same local
  // extent — so `1 / (radius * density)` is how far it moves across one device
  // pixel, and half of that puts a half-pixel of fade on either side of the
  // threshold. `fwidth` would answer the same question, but with an
  // implementation-defined derivative that makes the GLSL and WGSL stages
  // disagree on the ramp; it stays as the fallback for an atlas whose field
  // scale is unknown (an MSDF atlas carries no distance range).
  //
  // `density` is the device pixels one local unit covers ALONG THE EDGE'S OWN
  // NORMAL. Under a similarity transform every direction shares one density and
  // the x axis answers for all of them, which is the branch nearly every glyph
  // takes. Under a non-uniform scale they differ: sizing a horizontal edge
  // against the horizontal density leaves it aliased or smeared by exactly the
  // anisotropy ratio. The normal comes from the field itself — a forward
  // difference over one atlas texel — because the glyph quad maps local space to
  // UV with an axis-aligned positive scale, so a direction is the same in both.
  float radius = tShadow2.w;
  vec2  axisX  = v_pxAxes.xy;
  vec2  axisY  = v_pxAxes.zw;
  float densityX = length(axisX);
  float densityY = length(axisY);
  float aa;

  if (radius > 0.0 && densityX > 0.0) {
    float density = densityX;

    // Flat per node, so the branch is coherent across the whole draw and the two
    // extra taps cost nothing on the isotropic path.
    if (abs(densityY - densityX) > 0.001 * max(densityX, densityY)) {
      float texel = 1.0 / u_pageSize;
      float sdU = sampleBase(v_textureSlot, v_texcoord + vec2(texel, 0.0)).r;
      float sdV = sampleBase(v_textureSlot, v_texcoord + vec2(0.0, texel)).r;
      vec2  grad = vec2(sdU - sd, sdV - sd);
      float gradLength = length(grad);

      if (gradLength > 1e-6) {
        vec2 normal = grad / gradLength;

        density = max(length(axisX * normal.x + axisY * normal.y), 1e-6);
      }
    }

    aa = max(0.5 / (radius * density), 0.0001);
  } else {
    aa = max(fwidth(sd) * 0.5, 0.0001);
  }

  float fill = smoothstep(0.5 - aa, 0.5 + aa, sd);

  float outline = outlineMin < 0.5
    ? smoothstep(outlineMin - aa, outlineMin + aa, sd) * (1.0 - fill)
    : 0.0;

  // The shadow is the one edge allowed to be softer than a pixel: `shadowBlur`
  // is an authored look, stated in field units so it covers the same logical
  // distance at every raster density. It widens the edge, never sharpens it.
  float shadowSoft = max(aa, blur);
  float shadowSd   = sampleBase(v_textureSlot, v_texcoord - shadowOffset).r;
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

  fragColor = fillColor * fill
            + tOutline  * outline
            + tShadow   * shadow;
}
