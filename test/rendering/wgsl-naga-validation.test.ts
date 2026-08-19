/**
 * Independent WGSL validation with Naga, the wgpu front end.
 *
 * The WebGPU browser lane compiles every one of these sources against Dawn,
 * which means Tint. Firefox's WebGPU implementation is wgpu, which means Naga -
 * a second, independently written WGSL front end whose accepted language is
 * measurably narrower. `browser-webgpu-firefox` exists for exactly that reason,
 * but it needs a headed session with a real display, so CI runs it
 * non-blocking and without an adapter (see `_ci-checks.yml`). Nothing that
 * blocks a merge currently sees WGSL through anything but Tint.
 *
 * A concrete instance of the gap: a function taking a
 * `ptr<storage, f32, read_write>` parameter (WGSL's unrestricted pointer
 * parameters) compiles with zero errors in Chromium and is rejected outright by
 * Naga. Such a shader would pass every gate in this repository and fail for
 * every Firefox user.
 *
 * This spec closes it without a browser: the same composed sources the WebGPU
 * compile suite feeds to `createShaderModule`, in both the authored and the
 * production-stripped form, handed to the `naga` binary.
 *
 * It validates rather than translates - no backend output is requested - so a
 * construct Naga can represent but not lower to, say, Metal is not reported
 * here. Accepting the WGSL is the contract that matters to a Firefox user.
 *
 * The binary is not an npm dependency. Install it with
 * `cargo install naga-cli --version 26.0.0 --locked`, or point `EXOJS_NAGA` at
 * an existing one. Without it every case skips; `EXOJS_REQUIRE_NAGA=1` turns
 * the absence into a failure, which is how CI runs it.
 */
import { spawnSync } from 'node:child_process';

import { stripShaderSource } from '@codexo/exojs-build/shader-strip';
import { describe, expect, test } from 'vitest';

import { spriteMaterialPrologueWgsl } from '#rendering/sprite/spriteMaterialSources';
import { compositorShaderSource as backdropBlendCompositorWgsl } from '#rendering/webgpu/WebGpuBackdropBlendCompositor';
import { mipmapWgsl } from '#rendering/webgpu/WebGpuBackend';
import { compositorShaderSource as maskCompositorWgsl } from '#rendering/webgpu/WebGpuMaskCompositor';
import { instancedMeshShaderSource, meshShaderSource } from '#rendering/webgpu/WebGpuMeshRenderer';
import { nineSliceShaderSource } from '#rendering/webgpu/WebGpuNineSliceSpriteRenderer';
import { commonWgsl, geoPathEntries, shaderPathEntries } from '#rendering/webgpu/WebGpuRepeatingSpriteRenderer';
import { buildPersistentSpriteShaderSource, buildSpriteShaderSource, spriteBatchTextureSlotTiers } from '#rendering/webgpu/WebGpuSpriteRenderer';
import { stencilWriteShaderSource } from '#rendering/webgpu/WebGpuStencilClipper';
import { textShaderSource } from '#rendering/webgpu/WebGpuTextRenderer';

/** Kept in step with the entries in `test/rendering/browser/webgpu-shader-compile.test.ts`. */
const shaders: ReadonlyArray<readonly [name: string, source: string]> = [
  ['WebGpuBackend mipmap pipeline', mipmapWgsl],
  ['WebGpuBackdropBlendCompositor', backdropBlendCompositorWgsl],
  ['WebGpuMaskCompositor', maskCompositorWgsl],
  ['WebGpuMeshRenderer (default)', meshShaderSource],
  ['WebGpuMeshRenderer (instanced)', instancedMeshShaderSource],
  ['WebGpuNineSliceSpriteRenderer', nineSliceShaderSource],
  ['WebGpuRepeatingSpriteRenderer (combined)', commonWgsl + shaderPathEntries + geoPathEntries],
  ...spriteBatchTextureSlotTiers.map((tier): readonly [string, string] => [`WebGpuSpriteRenderer (${tier} texture slots)`, buildSpriteShaderSource(tier)]),
  ...spriteBatchTextureSlotTiers.map((tier): readonly [string, string] => [
    `WebGpuSpriteRenderer persistent-indexed (${tier} texture slots)`,
    buildPersistentSpriteShaderSource(tier),
  ]),
  ['WebGpuStencilClipper', stencilWriteShaderSource],
  ['WebGpuTextRenderer', textShaderSource],
  ['spriteMaterialSources spriteMaterialPrologueWgsl (custom-material prelude)', spriteMaterialPrologueWgsl],
];

const nagaBinary = process.env['EXOJS_NAGA'] ?? 'naga';
const nagaRequired = process.env['EXOJS_REQUIRE_NAGA'] === '1';

interface NagaResult {
  readonly valid: boolean;
  readonly log: string;
}

/**
 * Validates one source, or returns `null` when the binary is not installed.
 *
 * Naga reads the module from stdin; `--stdin-file-path` only supplies the name
 * its diagnostics are anchored to. Requesting no output file leaves it at
 * parse plus validate, which is the whole point here.
 */
const validate = (name: string, source: string): NagaResult | null => {
  const result = spawnSync(nagaBinary, ['--stdin-file-path', `${name}.wgsl`], { input: source, encoding: 'utf8' });

  if (result.error) {
    const missing = (result.error as NodeJS.ErrnoException).code === 'ENOENT';

    if (missing && !nagaRequired) return null;

    throw new Error(
      `Could not run the Naga validator (\`${nagaBinary}\`): ${result.error.message}\n` +
        'Install it with `cargo install naga-cli --version 26.0.0 --locked`, or set EXOJS_NAGA to an existing binary.',
    );
  }

  return { valid: result.status === 0, log: `${result.stdout}${result.stderr}`.trim() };
};

describe('WGSL sources validate under Naga', () => {
  for (const [name, source] of shaders) {
    for (const [variant, code] of [
      ['as authored', source],
      ['stripped', stripShaderSource(source)],
    ] as const) {
      test(`validates ${name} (${variant})`, ctx => {
        const result = validate(`${name} ${variant}`, code);

        if (result === null) {
          // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the validator is an optional local install, and CI sets EXOJS_REQUIRE_NAGA
          ctx.skip("Naga is not installed; see this file's header for how to install it.");

          return;
        }

        expect(result.valid, `${name} (${variant}) was rejected by Naga:\n${result.log}`).toBe(true);
      });
    }
  }
});
