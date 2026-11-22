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

uniform highp sampler2D u_nodeData;  // RGBA32F per-node data (see WebGl2TextRenderer)
uniform vec2      u_pageSize;  // atlas page size in px (for shadow UV conversion)

flat in int   v_nodeIndex;
flat in uint  v_decoration;
flat in vec4  v_pxAxes;
flat in vec4  v_tileUv;
     in vec2  v_texcoord;
     in vec2  v_gradUV;

layout(location = 0) out vec4 fragColor;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

// texel-fetched node colours are authored sRGB, straight alpha - the same
// authoring convention as Color. Decode the RGB once at the point each colour
// is read: alpha is coverage/opacity, never gamma-transformed.
vec4 decodeAuthoredColor(vec4 raw) {
  return vec4(srgbToLinear(raw.rgb), raw.a);
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
  vec4  prevColor  = decodeAuthoredColor(texelFetch(u_nodeData, ivec2(10, ni), 0));

  for (int i = 1; i < 8; i++) {
    if (i >= stopCount) break;

    float offset = gradientStopOffset(ni, i);
    vec4  color  = decodeAuthoredColor(texelFetch(u_nodeData, ivec2(10 + i, ni), 0));

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

// Keep bilinear taps on this tile, including shifted shadows and normal estimates.
vec2 tileSampleUv(vec2 uv) {
  vec2 halfTexel = min(0.5 / u_pageSize, (v_tileUv.zw - v_tileUv.xy) * 0.5);

  return clamp(uv, v_tileUv.xy + halfTexel, v_tileUv.zw - halfTexel);
}

// The signed distance an MSDF texel encodes is the median of its three channels.
float sampleField(vec2 uv) {
  vec3 msd = sampleBase(v_textureSlot, tileSampleUv(uv)).rgb;

  return median(msd.r, msd.g, msd.b);
}

void main(void) {
  int ni = v_nodeIndex;

  // Same node data layout and edge math as text-sdf.frag; only the field read differs.

  // texel 2: fillColor
  // texel 3: outlineColor
  // texel 4: (outlineField, shadowAlpha, shadowBlurField, gradientStopCount)
  //          effect lengths already in field units; outlineField = 0 → no outline
  // texel 5: shadowColor
  // texel 6: (shadowOffX_texels, shadowOffY_texels, decorationOverride, fieldScale)
  // texel 7: (gradAxisX, gradAxisY, gradBias, fieldZero)
  // texels 10-19: gradient stop colours and offsets
  vec4 tFill    = decodeAuthoredColor(texelFetch(u_nodeData, ivec2(2, ni), 0));
  vec4 tOutline = decodeAuthoredColor(texelFetch(u_nodeData, ivec2(3, ni), 0));
  vec4 tParams  = texelFetch(u_nodeData, ivec2(4, ni), 0);
  vec4 tShadow  = decodeAuthoredColor(texelFetch(u_nodeData, ivec2(5, ni), 0));
  vec4 tShadow2 = texelFetch(u_nodeData, ivec2(6, ni), 0);
  vec4 tGradAxis = texelFetch(u_nodeData, ivec2(7, ni), 0);

  float outlineField = tParams.x;
  float shadowAlpha  = tParams.y;
  float blurField    = tParams.z;
  int   gradStops    = int(tParams.w + 0.5);
  vec2  shadowOffset = tShadow2.xy / u_pageSize;
  float fieldScale   = tShadow2.w;
  float zero         = tGradAxis.w;

  float sd = sampleField(v_texcoord);
  // Evaluated before any branch: a derivative needs every fragment of the quad.
  float derivativeAa = max(fwidth(sd) * 0.5, 0.0001);

  // Antialiasing width, measured against the PROJECTED pixel footprint rather
  // than fixed in field units. A constant cannot be right everywhere at once: it
  // renders a hard, aliased step wherever the glyph is dense and a multi-pixel
  // smear wherever it is magnified.
  //
  // The field moves by `fieldScale` per LOCAL unit — the atlas density cancels,
  // because a denser atlas packs proportionally more texels into the same local
  // extent — so `fieldScale / density` is how far it moves across one device
  // pixel, and half of that puts a half-pixel of fade on either side of the
  // threshold. `fwidth` would answer the same question, but with an
  // implementation-defined derivative that makes the GLSL and WGSL stages
  // disagree on the ramp; it stays as the fallback for an atlas whose field
  // scale is unknown.
  //
  // `density` is the device pixels one local unit covers ALONG THE EDGE'S OWN
  // NORMAL. Under a similarity transform every direction shares one density and
  // the x axis answers for all of them, which is the branch nearly every glyph
  // takes. Under a non-uniform scale they differ: sizing a horizontal edge
  // against the horizontal density leaves it aliased or smeared by exactly the
  // anisotropy ratio. The normal comes from the field itself — a forward
  // difference over one atlas texel — because the glyph quad maps local space to
  // UV with an axis-aligned positive scale, so a direction is the same in both.
  vec2  axisX  = v_pxAxes.xy;
  vec2  axisY  = v_pxAxes.zw;
  float densityX = length(axisX);
  float densityY = length(axisY);
  float aa = derivativeAa;

  if (fieldScale > 0.0 && densityX > 0.0) {
    float density = densityX;

    // Flat per node, so the branch is coherent across the whole draw and the two
    // extra taps cost nothing on the isotropic path.
    if (abs(densityY - densityX) > 0.001 * max(densityX, densityY)) {
      vec2  texel = 1.0 / u_pageSize;
      float sdU = sampleField(v_texcoord + vec2(texel.x, 0.0));
      float sdV = sampleField(v_texcoord + vec2(0.0, texel.y));
      vec2  grad = vec2(sdU - sd, sdV - sd);
      float gradLength = length(grad);

      if (gradLength > 1e-6) {
        vec2 normal = grad / gradLength;

        density = max(length(axisX * normal.x + axisY * normal.y), 1e-6);
      }
    }

    aa = max(0.5 * fieldScale / density, 0.0001);
  }

  float fill = smoothstep(zero - aa, zero + aa, sd);

  // Every effect edge sits at a field value: its distance outside the glyph edge
  // times the field scale. The outer fade never starts below zero, where the
  // field saturates at the end of its reach: under heavy minification an
  // unclamped ramp would tint the whole saturated tile margin.
  float outlineEdge = zero - outlineField;
  float outline = outlineField > 0.0
    ? smoothstep(max(outlineEdge - aa, 0.0), outlineEdge + aa, sd) * (1.0 - fill)
    : 0.0;

  // The shadow is the one edge allowed to be softer than a pixel: `shadowBlur`
  // is an authored half-width in logical pixels. It widens the edge, never
  // sharpens it.
  float shadowSoft = max(aa, blurField);
  vec2 shadowUv = v_texcoord - shadowOffset;
  float shadowSd = shadowAlpha > 0.0 && all(greaterThanEqual(shadowUv, v_tileUv.xy)) && all(lessThanEqual(shadowUv, v_tileUv.zw))
    ? sampleField(shadowUv)
    : 0.0;
  float shadow     = smoothstep(max(zero - shadowSoft, 0.0), min(zero + shadowSoft, 1.0), shadowSd)
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
    fillColor = decodeAuthoredColor(texelFetch(u_nodeData, ivec2(8, ni), 0));
  }

  fragColor = fillColor * fill
            + tOutline  * outline
            + tShadow   * shadow;
}
