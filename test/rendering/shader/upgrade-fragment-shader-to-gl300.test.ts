import { upgradeFragmentShaderToGl300 } from '#rendering/shader/upgradeFragmentShaderToGl300';

describe('upgradeFragmentShaderToGl300', () => {
  // 1. Already-3.00 source returned unchanged
  test('already-3.00 source is returned unchanged', () => {
    const src = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }
`;

    expect(upgradeFragmentShaderToGl300(src)).toBe(src);
  });

  // 2. Legacy source gets #version 300 es header
  test('adds #version 300 es header to legacy source', () => {
    const src = `void main() { gl_FragColor = vec4(1.0); }`;
    const result = upgradeFragmentShaderToGl300(src);

    expect(result).toMatch(/^#version 300 es\n/);
  });

  // 3. gl_FragColor replaced with fragColor
  test('replaces gl_FragColor with fragColor', () => {
    const src = `void main() { gl_FragColor = vec4(1.0); }`;
    const result = upgradeFragmentShaderToGl300(src);

    expect(result).toContain('fragColor = vec4(1.0)');
    expect(result).not.toContain('gl_FragColor');
  });

  // 4. texture2D( replaced with texture(
  test('replaces texture2D( with texture(', () => {
    const src = `uniform sampler2D uTex;
void main() { gl_FragColor = texture2D(uTex, vec2(0.5)); }`;
    const result = upgradeFragmentShaderToGl300(src);

    expect(result).toContain('texture(uTex');
    expect(result).not.toContain('texture2D(');
  });

  // 5. varying replaced with in
  test('replaces varying with in', () => {
    const src = `varying vec2 vUv;
void main() { gl_FragColor = vec4(vUv, 0.0, 1.0); }`;
    const result = upgradeFragmentShaderToGl300(src);

    expect(result).toContain('in vec2 vUv;');
    expect(result).not.toContain('varying vec2 vUv;');
  });

  // 6. Always prepends `precision highp float;` BEFORE `out vec4 fragColor;`
  //    because GLSL ES 3.00 requires precision to be set before any float-typed
  //    declaration. If the user has their own precision declaration later in
  //    the source, last-precision-wins rule means their preference still
  //    applies to their own code below. Multiple precision declarations are
  //    legal in GLSL ES 3.00.
  test('always prepends precision before out fragColor (multiple declarations allowed)', () => {
    const src = `precision lowp float;
void main() { gl_FragColor = vec4(1.0); }`;
    const result = upgradeFragmentShaderToGl300(src);

    // Two precision declarations: ours (highp, before fragColor) + user's (lowp, kept)
    const precisionLines = result.match(/precision\s+\w+\s+float\s*;/g);

    expect(precisionLines).not.toBeNull();
    expect(precisionLines!.length).toBe(2);

    // The injected `precision highp float;` MUST appear before
    // `out vec4 fragColor;` to satisfy GLSL ES 3.00's rule that
    // precision must be declared before any float-typed declaration.
    const highpIndex = result.indexOf('precision highp float;');
    const fragColorIndex = result.indexOf('out vec4 fragColor;');
    const lowpIndex = result.indexOf('precision lowp float;');

    expect(highpIndex).toBeGreaterThanOrEqual(0);
    expect(fragColorIndex).toBeGreaterThanOrEqual(0);
    expect(highpIndex).toBeLessThan(fragColorIndex);
    // User's lowp declaration comes after fragColor — last-precision-wins
    // for the user's own code below.
    expect(lowpIndex).toBeGreaterThan(fragColorIndex);
  });

  // 7. Precision line IS added when missing
  test('adds precision highp float when not declared', () => {
    const src = `void main() { gl_FragColor = vec4(1.0); }`;
    const result = upgradeFragmentShaderToGl300(src);

    expect(result).toContain('precision highp float;');
  });

  // 8. Idempotent: two passes produce the same result
  test('is idempotent — calling twice produces the same source', () => {
    const src = `varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;
    const once = upgradeFragmentShaderToGl300(src);
    const twice = upgradeFragmentShaderToGl300(once);

    expect(twice).toBe(once);
  });

  // 9. Word boundary: gl_FragColor_old is NOT replaced
  test('does not replace gl_FragColor_old (word boundary safety)', () => {
    const src = `// gl_FragColor_old is a test variable name
void main() { gl_FragColor = vec4(1.0); }`;
    const result = upgradeFragmentShaderToGl300(src);

    expect(result).toContain('gl_FragColor_old');
    expect(result).toContain('fragColor = vec4(1.0)');
  });

  // 10. Comments containing varying get replaced too (documented expected behavior)
  test('replaces "varying" inside comments (cosmetic — documented behavior)', () => {
    // The regex replacement is source-level, not parse-level.
    // "varying" in comments is replaced — this is known and expected.
    const src = `// This was a varying input
varying vec2 vUv;
void main() { gl_FragColor = vec4(vUv, 0.0, 1.0); }`;
    const result = upgradeFragmentShaderToGl300(src);

    // The word "varying" in the comment is also replaced
    expect(result).toContain('// This was a in input');
    expect(result).toContain('in vec2 vUv;');
  });

  // 11. Empty source returns valid 3.00 shell with header but no body
  test('empty source returns valid 3.00 shell', () => {
    const result = upgradeFragmentShaderToGl300('');

    expect(result).toMatch(/^#version 300 es\n/);
    expect(result).toContain('precision highp float;');
    expect(result).toContain('out vec4 fragColor;');
  });

  // Additional: textureCube( replaced with texture(
  test('replaces textureCube( with texture(', () => {
    const src = `uniform samplerCube uCube;
void main() { gl_FragColor = textureCube(uCube, vec3(0.0)); }`;
    const result = upgradeFragmentShaderToGl300(src);

    expect(result).toContain('texture(uCube');
    expect(result).not.toContain('textureCube(');
  });

  // Additional: texture2DProj( replaced with textureProj(
  test('replaces texture2DProj( with textureProj(', () => {
    const src = `uniform sampler2D uTex;
void main() { gl_FragColor = texture2DProj(uTex, vec3(0.5, 0.5, 1.0)); }`;
    const result = upgradeFragmentShaderToGl300(src);

    expect(result).toContain('textureProj(uTex');
    expect(result).not.toContain('texture2DProj(');
  });

  // Additional: strips existing #version 1.00 directive
  test('strips existing #version 100 directive before upgrading', () => {
    const src = `#version 100
void main() { gl_FragColor = vec4(1.0); }`;
    const result = upgradeFragmentShaderToGl300(src);

    expect(result).toMatch(/^#version 300 es\n/);
    // Only one version directive
    const versionMatches = result.match(/#version/g);

    expect(versionMatches).not.toBeNull();
    expect(versionMatches!.length).toBe(1);
  });
});
