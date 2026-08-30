struct FrameUniforms {
    projCol0 : vec4<f32>,
    projCol1 : vec4<f32>,
    projCol2 : vec4<f32>,
    groupCol0 : vec4<f32>,
    groupCol1 : vec4<f32>,
    groupCol2 : vec4<f32>,
    viewport : vec4<f32>,       // device-pixel snap rect (x, y, width, height)
};

@group(0) @binding(0) var<uniform>       frame : FrameUniforms;
@group(0) @binding(1) var<storage, read> nodes : array<vec4<f32>>;

{{atlasTextureSlots}}

struct VertexInput {
    @location(0) position  : vec2<f32>,
    @location(1) texcoord  : vec2<f32>,
    @location(2) packedNodeSlot : u32,
};

struct VertexOutput {
    @builtin(position)              clipPos  : vec4<f32>,
    @location(0)                    texcoord : vec2<f32>,
    @location(1)                    gradUV   : vec2<f32>,
    @location(2) @interpolate(flat) nodeIdx  : u32,
    @location(3) @interpolate(flat) textureSlot : u32,
    @location(4) @interpolate(flat) pxAxes : vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let ni   = input.packedNodeSlot & {{nodeIndexMask}}u;
    let base = ni * 10u;

    let t0 = nodes[base + 0u];
    let t1 = nodes[base + 1u];
    let t9 = nodes[base + 9u];

    let proj = mat3x3<f32>(
        frame.projCol0.xyz,
        frame.projCol1.xyz,
        frame.projCol2.xyz,
    );
    let xf = mat3x3<f32>(
        vec3<f32>(t0.x, t0.y, 0.0),
        vec3<f32>(t1.x, t1.y, 0.0),
        vec3<f32>(t0.w, t1.w, 1.0),
    );

    let grp = mat3x3<f32>(
        frame.groupCol0.xyz,
        frame.groupCol1.xyz,
        frame.groupCol2.xyz,
    );
    let worldPos = proj * grp * xf * vec3<f32>(input.position, 1.0);

    var clipPos = vec4<f32>(worldPos.xy, 0.0, 1.0);

    // Render-only pixel snapping (t0.z: 0 = none, non-zero = snap origin).
    // Snap the node ORIGIN (t0.w, t1.w)'s device-pixel position and
    // rigid-shift every glyph vertex by the same delta. floor(x + 0.5)
    // matches the CPU Math.round policy; WGSL round() is half-to-even. Grid
    // alignment is independent of the y-axis convention because the staged
    // viewport rect is whole device pixels.
    if (t0.z != 0.0) {
        let originClip = (proj * grp * vec3<f32>(t0.w, t1.w, 1.0)).xy;
        let originDevice = frame.viewport.xy + (originClip * 0.5 + vec2<f32>(0.5)) * frame.viewport.zw;
        let snapDelta = (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(frame.viewport.zw, vec2<f32>(1.0));
        clipPos = vec4<f32>(clipPos.xy + snapDelta, clipPos.z, clipPos.w);
    }

    let bSize  = t9.zw;
    var gradUV = vec2<f32>(0.0);
    if (bSize.x > 0.0 && bSize.y > 0.0) {
        gradUV = clamp((input.position - t9.xy) / bSize, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    // The device-pixel images of the local +x and +y directions — see the
    // matching comment in text.vert. Both columns rather than only column 0: a
    // single scalar describes the projected footprint only under a similarity
    // transform, and the fragment stage picks the density the edge's own normal
    // lands on. Clip space spans 2 across the viewport. Derived from the
    // transform rather than from a hardware derivative so this stage and the
    // GLSL one agree bit for bit on the edge ramp.
    let composed  = proj * grp * xf;
    let unitClipX = (composed * vec3<f32>(1.0, 0.0, 0.0)).xy;
    let unitClipY = (composed * vec3<f32>(0.0, 1.0, 0.0)).xy;

    var out: VertexOutput;
    out.clipPos  = clipPos;
    out.texcoord = input.texcoord;
    out.gradUV   = gradUV;
    out.nodeIdx  = ni;
    out.textureSlot = input.packedNodeSlot >> {{atlasSlotShift}}u;
    out.pxAxes = vec4<f32>(unitClipX * frame.viewport.zw * 0.5, unitClipY * frame.viewport.zw * 0.5);
    return out;
}

// ── SDF (R8 atlas) ────────────────────────────────────────────────────────────

@fragment
fn fragmentSdf(in: VertexOutput) -> @location(0) vec4<f32> {
    let ni   = in.nodeIdx;
    let base = ni * 10u;

    let tFill    = nodes[base + 2u];
    let tOutline = nodes[base + 3u];
    let tParams  = nodes[base + 4u];
    let tShadow  = nodes[base + 5u];
    let tShadow2 = nodes[base + 6u];
    let tGradTop = nodes[base + 7u];
    let tGradBot = nodes[base + 8u];

    let outlineMin   = tParams.x;
    let shadowAlpha  = tParams.y;
    let blur         = tParams.z;
    let gradEnabled  = tParams.w;
    let pageSize     = f32(atlasTextureDimensions(in.textureSlot).x);
    let shadowOffset = tShadow2.xy / pageSize;
    let gradVertical = tShadow2.z;

    let uvDx = dpdx(in.texcoord);
    let uvDy = dpdy(in.texcoord);
    let sd   = sampleTexture(in.textureSlot, in.texcoord, uvDx, uvDy).r;

    // Mirrors text-sdf.frag: the edge fades over one DEVICE pixel rather than
    // over a constant in field units, so atlas density, surface ratio, node
    // scale and camera zoom all arrive at the same on-screen edge. The field
    // moves by 1/sdfRadius per local unit, so the width follows from the
    // transform; the derivative is the fallback for an atlas whose field scale
    // is unknown. The density is taken along the edge's own normal, recovered
    // from the field by a forward difference, so a non-uniform scale sizes
    // horizontal and vertical edges independently.
    let radius = tShadow2.w;
    let axisX = in.pxAxes.xy;
    let axisY = in.pxAxes.zw;
    let densityX = length(axisX);
    let densityY = length(axisY);
    var aa = max(fwidth(sd) * 0.5, 0.0001);
    if (radius > 0.0 && densityX > 0.0) {
        var density = densityX;

        if (abs(densityY - densityX) > 0.001 * max(densityX, densityY)) {
            let texel = 1.0 / pageSize;
            let sdU = sampleTexture(in.textureSlot, in.texcoord + vec2<f32>(texel, 0.0), uvDx, uvDy).r;
            let sdV = sampleTexture(in.textureSlot, in.texcoord + vec2<f32>(0.0, texel), uvDx, uvDy).r;
            let grad = vec2<f32>(sdU - sd, sdV - sd);
            let gradLength = length(grad);

            if (gradLength > 1e-6) {
                let normal = grad / gradLength;

                density = max(length(axisX * normal.x + axisY * normal.y), 1e-6);
            }
        }

        aa = max(0.5 / (radius * density), 0.0001);
    }
    let fill = smoothstep(0.5 - aa, 0.5 + aa, sd);

    let shadowSd = sampleTexture(in.textureSlot, in.texcoord - shadowOffset, uvDx, uvDy).r;

    let outline = select(0.0,
        smoothstep(outlineMin - aa, outlineMin + aa, sd) * (1.0 - fill),
        outlineMin < 0.5);

    // shadowBlur is an authored look and stays in field units, so it covers the
    // same logical distance at every raster density. It only ever widens.
    let shadowSoft = max(aa, blur);
    let shadow = smoothstep(0.5 - shadowSoft, 0.5 + shadowSoft, shadowSd)
                 * shadowAlpha * (1.0 - fill) * (1.0 - outline);

    var fillColor : vec4<f32>;
    if (gradEnabled > 0.5) {
        // gradUV is 0 at the top/left edge of the ink box and 1 at the
        // bottom/right, so texel 7 (gradientColors[0]) belongs at t = 0.
        let t = select(in.gradUV.x, in.gradUV.y, gradVertical > 0.5);
        fillColor = mix(tGradTop, tGradBot, t);
    } else {
        fillColor = tFill;
    }

    return fillColor * fill + tOutline * outline + tShadow * shadow;
}

// ── MSDF (RGB atlas) ──────────────────────────────────────────────────────────

fn median3(r: f32, g: f32, b: f32) -> f32 {
    return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fragmentMsdf(in: VertexOutput) -> @location(0) vec4<f32> {
    let ni   = in.nodeIdx;
    let base = ni * 10u;

    let tFill    = nodes[base + 2u];
    let tOutline = nodes[base + 3u];
    let tParams  = nodes[base + 4u];
    let tShadow  = nodes[base + 5u];
    let tShadow2 = nodes[base + 6u];
    let tGradTop = nodes[base + 7u];
    let tGradBot = nodes[base + 8u];

    let outlineMin   = tParams.x;
    let shadowAlpha  = tParams.y;
    let blur         = tParams.z;
    let gradEnabled  = tParams.w;
    let pageSize     = f32(atlasTextureDimensions(in.textureSlot).x);
    let shadowOffset = tShadow2.xy / pageSize;
    let gradVertical = tShadow2.z;

    let uvDx = dpdx(in.texcoord);
    let uvDy = dpdy(in.texcoord);
    let msd  = sampleTexture(in.textureSlot, in.texcoord, uvDx, uvDy).rgb;
    let sd   = median3(msd.r, msd.g, msd.b);

    // See the SDF stage. An MSDF atlas is built offline and carries no distance
    // range in its font data, so its field scale is unknown and the width has to
    // come from the hardware derivative.
    let aa   = max(fwidth(sd) * 0.5, 0.0001);
    let fill = smoothstep(0.5 - aa, 0.5 + aa, sd);
    let shadowSoft = max(aa, blur);

    let shadowMsd = sampleTexture(in.textureSlot, in.texcoord - shadowOffset, uvDx, uvDy).rgb;
    let shadowSd  = median3(shadowMsd.r, shadowMsd.g, shadowMsd.b);

    let outline = select(0.0,
        smoothstep(outlineMin - aa, outlineMin + aa, sd) * (1.0 - fill),
        outlineMin < 0.5);

    let shadow = smoothstep(0.5 - shadowSoft, 0.5 + shadowSoft, shadowSd)
                 * shadowAlpha * (1.0 - fill) * (1.0 - outline);

    var fillColor : vec4<f32>;
    if (gradEnabled > 0.5) {
        // gradUV is 0 at the top/left edge of the ink box and 1 at the
        // bottom/right, so texel 7 (gradientColors[0]) belongs at t = 0.
        let t = select(in.gradUV.x, in.gradUV.y, gradVertical > 0.5);
        fillColor = mix(tGradTop, tGradBot, t);
    } else {
        fillColor = tFill;
    }

    return fillColor * fill + tOutline * outline + tShadow * shadow;
}

// ── Color (RGBA atlas) ────────────────────────────────────────────────────────

@fragment
fn fragmentColor(in: VertexOutput) -> @location(0) vec4<f32> {
    let ni     = in.nodeIdx;
    let base   = ni * 10u;
    let tint   = nodes[base + 2u];
    let sample = sampleTexture(in.textureSlot, in.texcoord, dpdx(in.texcoord), dpdy(in.texcoord));
    return sample * tint;
}
