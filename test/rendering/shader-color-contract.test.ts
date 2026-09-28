// The shader-side colour contract: one alpha-association point, one transfer
// function per language, and no path that decodes an already-decoded sample.
//
// The browser lanes compile and run these sources on a device, and the Naga
// suite validates the composed modules. What neither can see is the property
// this suite exists for: that the contract is stated once. Association drifting
// into a second `rgb * a` in a path that already gets premultiplied storage
// renders the same picture in most fixtures and is wrong everywhere else, and a
// transfer function added after a hardware sRGB sample decodes it twice - also
// usually invisible, because most fixtures are mid-grey.
import { describe, expect, test } from 'vitest';

import { colorShaderSourcesGlsl, colorShaderSourcesWgsl } from '#rendering/colorShaderSources';
import { spriteMaterialPrologueGlsl, spriteMaterialPrologueWgsl } from '#rendering/sprite/materialSources';
import { buildPersistentSpriteShaderSource, buildSpriteShaderSource, spriteBatchTextureSlotTiers } from '#rendering/webgpu/WebGpuSpriteRenderer';

// `?raw` reads the shipped file directly, so these assertions hold even where a
// project's shader plugin blanks shader imports (see shader-source-structure).
const shaderFiles = import.meta.glob(['/src/rendering/shaders/*.{frag,wgsl}', '/src/rendering/sprite/shaders/*.wgsl'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const source = (suffix: string): string => {
  const match = Object.entries(shaderFiles).find(([path]) => path.endsWith(suffix));
  if (!match) throw new Error(`no shader source found for ${suffix}`);
  return match[1];
};

/** The helper names both languages have to declare, whatever else changes. */
const SHARED_HELPERS = ['srgbToLinear', 'linearToSrgb', 'associateSampledColor', 'forceOpaqueSampleAlpha'] as const;

/** Every WGSL stage that samples a sprite base texture, as the backends compose it. */
const wgslStages = (): ReadonlyArray<readonly [string, string]> => [
  ...spriteBatchTextureSlotTiers.map((tier): readonly [string, string] => [`sprite (${tier} slots)`, buildSpriteShaderSource(tier)]),
  ...spriteBatchTextureSlotTiers.map((tier): readonly [string, string] => [`persistent sprite (${tier} slots)`, buildPersistentSpriteShaderSource(tier)]),
  ['custom material', spriteMaterialPrologueWgsl],
];

/** Line comments out, so an assertion about code cannot be satisfied by prose. */
const code = (source: string): string =>
  source
    .split('\n')
    .map(line => {
      const marker = line.indexOf('//');
      return marker === -1 ? line : line.slice(0, marker);
    })
    .join('\n');

/**
 * A composed stage with the shared helpers taken back out: what the stage's own
 * code does, which is what the "exactly one application point" claims are about.
 */
const ownCode = (composed: string): string => code(composed.split(colorShaderSourcesWgsl).join(''));

/** The same, for the GLSL prologue, which composes the GLSL helpers. */
const ownGlslCode = (composed: string): string => code(composed.split(colorShaderSourcesGlsl).join(''));

/** Any place that multiplies a colour by an alpha. */
const COLOR_BY_ALPHA = /[\w.]+\.rgb\s*\*\s*[\w.]+\.a/g;

/**
 * The one such place a sprite draw stage is allowed to keep: the authored tint,
 * which is authored straight and becomes premultiplied in the vertex stage. It
 * is not sample association - that is the shared helper's job - so it is named
 * here rather than left to a count that drifts.
 */
const AUTHORED_TINT = 'tint.rgb * tint.a';

/**
 * The one `srgbToLinear` call a sprite draw stage is allowed to keep: the
 * authored packed tint, decoded once in the shared vertex core before it is
 * premultiplied ({@link AUTHORED_TINT}) and interpolated. Anything else
 * decoding is a hardware sRGB sample being decoded a second time.
 */
const AUTHORED_TINT_DECODE = 'srgbToLinear(rawTint.rgb)';

describe('shared colour shader contract', () => {
  test('both languages declare the same helpers', () => {
    for (const helper of SHARED_HELPERS) {
      expect(colorShaderSourcesWgsl, `WGSL is missing ${helper}`).toContain(`fn ${helper}(`);
      expect(colorShaderSourcesGlsl, `GLSL is missing ${helper}`).toMatch(new RegExp(`\\b${helper}\\(`));
    }
  });

  test('both languages state the same sRGB transfer constants', () => {
    // The CPU reference is src/core/colorTransfer.ts. A constant that drifts
    // here makes the same bytes mean two different things on the two sides.
    for (const constant of ['0.04045', '12.92', '0.0031308', '0.055', '1.055', '2.4']) {
      expect(colorShaderSourcesWgsl, `WGSL lost ${constant}`).toContain(constant);
      expect(colorShaderSourcesGlsl, `GLSL lost ${constant}`).toContain(constant);
    }
    expect(colorShaderSourcesWgsl).toContain('1.0 / 2.4');
    expect(colorShaderSourcesGlsl).toContain('1.0 / 2.4');
  });

  test('the GLSL chunk is a chunk: no version directive, no entry point', () => {
    // It is spliced into a shader that owns both, and a `#version` here would
    // not be the first token of the composed unit.
    const glsl = code(colorShaderSourcesGlsl);
    expect(glsl).not.toContain('#version');
    expect(glsl).not.toContain('void main');
    expect(code(colorShaderSourcesWgsl)).not.toContain('#version');
  });

  test('the GLSL chunk qualifies every float, since a fragment stage has no default', () => {
    const unqualifiedFloat = /^\s*(?:vec[234]|float|mat[234])\s/m.exec(code(colorShaderSourcesGlsl));
    expect(unqualifiedFloat, `unqualified float in the GLSL chunk: ${unqualifiedFloat?.[0]}`).toBeNull();
  });

  test('the GLSL chunk uses no reserved word', () => {
    // jsdom cannot compile GLSL, so a chunk only meets a real driver's parser in
    // the browser lanes - and a reserved word as a parameter name compiles
    // nowhere except on a driver that does not reserve it. The words below are
    // reserved by the GLSL ES 3.00 specification and rejected by ANGLE.
    const reserved =
      /\b(?:sample|filter|input|output|common|partition|active|class|union|enum|typedef|template|this|resource|goto|inline|noinline|public|static|extern|external|interface|long|short|double|half|fixed|unsigned|superp|namespace|using|packed|sizeof|cast)\b/;
    const found = reserved.exec(code(colorShaderSourcesGlsl));
    expect(found, `reserved word in the GLSL chunk: ${found?.[0]}`).toBeNull();
  });
});

describe('alpha association has one application point', () => {
  test('every draw stage composes the shared helpers', () => {
    for (const [name, composed] of wgslStages()) {
      expect(composed, `${name} does not compose the shared colour helpers`).toContain(colorShaderSourcesWgsl);
    }
    expect(spriteMaterialPrologueGlsl).toContain(colorShaderSourcesGlsl);
  });

  test('both sprite sampling helpers associate through the shared function', () => {
    for (const path of ['/sprite/shaders/sprite-fragment-main.wgsl', '/sprite/shaders/sprite-sample-base.wgsl']) {
      const name = Object.keys(shaderFiles).find(candidate => candidate.endsWith(path.slice(1)));
      expect(name, `${path} is not in the shipped sources`).toBeDefined();
      expect(code(source(path)), `${name} does not associate through the shared helper`).toContain('associateSampledColor(');
    }
  });

  test('no draw path applies the association itself', () => {
    // The failure this guards: a second association of the SAMPLED colour where
    // storage is already premultiplied darkens every edge, and only on the
    // affected source. The authored tint is a different operation and stays.
    for (const [name, composed] of wgslStages()) {
      const associations = ownCode(composed).match(COLOR_BY_ALPHA) ?? [];
      const unexpected = associations.filter(found => found !== AUTHORED_TINT);
      expect(unexpected, `${name} multiplies colour by alpha outside the shared helper`).toEqual([]);
      expect(composed, `${name} lost its association call`).toContain('associateSampledColor(');
    }
    const glslAssociations = ownGlslCode(spriteMaterialPrologueGlsl).match(COLOR_BY_ALPHA) ?? [];
    expect(glslAssociations, 'the GLSL prologue associates outside the shared helper').toEqual([]);
  });

  test('the association exists once per language', () => {
    // One definition, so there is no second place to drift and no path that can
    // pick the wrong one.
    for (const shared of [colorShaderSourcesWgsl, colorShaderSourcesGlsl]) {
      const definitions = code(shared).match(/(?:fn |vec4 )associateSampledColor\(/g) ?? [];
      expect(definitions.length, 'the association helper is declared more than once').toBe(1);
    }
  });

  test('no draw path decodes a hardware sRGB sample a second time', () => {
    // A sample through an sRGB view is already linear. Calling the transfer
    // function on it is the double decode; the resolved storage format decides,
    // and no sprite draw stage has a reason to - only the authored tint does.
    for (const [name, composed] of wgslStages()) {
      const decodeCalls = ownCode(composed).match(/srgbToLinear\([^)]*\)/g) ?? [];
      const unexpected = decodeCalls.filter(call => call !== AUTHORED_TINT_DECODE);
      expect(unexpected, `${name} decodes something other than the authored tint`).toEqual([]);
    }
    expect(ownGlslCode(spriteMaterialPrologueGlsl)).not.toContain('srgbToLinear(');
  });
});

describe('native opaque alpha', () => {
  test('both languages force a missing alpha channel to one rather than reading the unused channel', () => {
    // BC1 RGB has no alpha, but a backend that requires RGBA storage uploads
    // one anyway, so the sampled alpha is whatever the unused channel holds.
    expect(code(colorShaderSourcesWgsl)).toMatch(/fn forceOpaqueSampleAlpha[\s\S]*?vec4<f32>\(sampleColor\.rgb, 1\.0\)/);
    expect(code(colorShaderSourcesGlsl)).toMatch(/vec4 forceOpaqueSampleAlpha[\s\S]*?vec4\(sampleColor\.rgb, 1\.0\)/);
  });

  test('the forced step keeps colour and never multiplies it', () => {
    // Forcing alpha must not associate: a source with no alpha channel is
    // straight, and its RGB must reach the blend unchanged.
    expect(code(colorShaderSourcesWgsl)).not.toMatch(/fn forceOpaqueSampleAlpha[\s\S]*?sampleColor\.rgb\s*\*/);
    expect(code(colorShaderSourcesGlsl)).not.toMatch(/vec4 forceOpaqueSampleAlpha[\s\S]*?sampleColor\.rgb\s*\*/);
  });
});
