/**
 * Rebuilds the externally encoded native KTX2 corpus in `test/fixtures/color-external/`.
 *
 * Unlike `generate-color-fixtures.ts`, no block payload is written by this repository: every
 * container is produced by the Khronos `ktx` tool from `source.png`. BC7 and ETC2 payloads are
 * transcoded by the Basis Universal transcoder from a UASTC LDR 4x4 intermediate, ASTC payloads are
 * encoded by astcenc. The script only drives the tool, validates the result and records provenance.
 *
 * The tool is not a repository dependency: point `--ktx` (or `KTX_TOOL`) at a `ktx` executable from a
 * KTX-Software release. The committed corpus was produced with 4.4.2.
 *
 * ```sh
 * pnpm fixtures:color:external --ktx path/to/ktx.exe
 * ```
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = join(repoRoot, 'test/fixtures/color-external');
const sourcePath = join(fixtureDir, 'source.png');

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
};

const tool = argument('--ktx') ?? process.env['KTX_TOOL'];

if (tool === undefined) {
  console.error('generate-external-ktx2-fixtures: pass --ktx <path to ktx> or set KTX_TOOL. The tool is not a repository dependency.');
  process.exit(2);
}

type Transfer = 'srgb' | 'linear';

interface Variant {
  readonly file: string;
  readonly vkFormat: number;
  readonly vkFormatName: string;
  readonly transfer: Transfer;
  /** Whether the format stores alpha. ETC2 RGB is opaque whatever the source holds. */
  readonly alpha: boolean;
  readonly codec: string;
  /** `ktx` invocations, `{in}`/`{out}` standing for the previous and the next file. */
  readonly steps: ReadonlyArray<readonly string[]>;
}

const uastcStep = (transfer: Transfer): readonly string[] => [
  'create',
  '--format',
  transfer === 'srgb' ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM',
  '--assign-tf',
  transfer,
  '--encode',
  'uastc',
  '--uastc-quality',
  '4',
  '--testrun',
  '{source}',
  '{out}',
];

const transcodeStep = (target: string): readonly string[] => ['transcode', '--target', target, '{in}', '{out}'];

const astcStep = (transfer: Transfer): readonly string[] => [
  'create',
  '--format',
  transfer === 'srgb' ? 'ASTC_4x4_SRGB_BLOCK' : 'ASTC_4x4_UNORM_BLOCK',
  '--assign-tf',
  transfer,
  '--astc-quality',
  'thorough',
  '--testrun',
  '{source}',
  '{out}',
];

const transcoded = (file: string, vkFormat: number, vkFormatName: string, transfer: Transfer, alpha: boolean, target: string): Variant => ({
  file,
  vkFormat,
  vkFormatName,
  transfer,
  alpha,
  codec: 'Basis Universal UASTC LDR 4x4 transcode',
  steps: [uastcStep(transfer), transcodeStep(target)],
});

const variants: readonly Variant[] = [
  transcoded('bc7-unorm.ktx2', 145, 'VK_FORMAT_BC7_UNORM_BLOCK', 'linear', true, 'bc7'),
  transcoded('bc7-srgb.ktx2', 146, 'VK_FORMAT_BC7_SRGB_BLOCK', 'srgb', true, 'bc7'),
  transcoded('etc2-rgb8-unorm.ktx2', 147, 'VK_FORMAT_ETC2_R8G8B8_UNORM_BLOCK', 'linear', false, 'etc-rgb'),
  transcoded('etc2-rgb8-srgb.ktx2', 148, 'VK_FORMAT_ETC2_R8G8B8_SRGB_BLOCK', 'srgb', false, 'etc-rgb'),
  transcoded('etc2-rgba8-unorm.ktx2', 151, 'VK_FORMAT_ETC2_R8G8B8A8_UNORM_BLOCK', 'linear', true, 'etc-rgba'),
  transcoded('etc2-rgba8-srgb.ktx2', 152, 'VK_FORMAT_ETC2_R8G8B8A8_SRGB_BLOCK', 'srgb', true, 'etc-rgba'),
  {
    file: 'astc-4x4-unorm.ktx2',
    vkFormat: 157,
    vkFormatName: 'VK_FORMAT_ASTC_4x4_UNORM_BLOCK',
    transfer: 'linear',
    alpha: true,
    codec: 'astcenc (thorough)',
    steps: [astcStep('linear')],
  },
  {
    file: 'astc-4x4-srgb.ktx2',
    vkFormat: 158,
    vkFormatName: 'VK_FORMAT_ASTC_4x4_SRGB_BLOCK',
    transfer: 'srgb',
    alpha: true,
    codec: 'astcenc (thorough)',
    steps: [astcStep('srgb')],
  },
];

/** The four 8x8 quadrants of `source.png`, sampled at one texel inside each. */
const quadrants = [
  { x: 2, y: 2, rgba: [220, 40, 40, 255] },
  { x: 12, y: 2, rgba: [40, 190, 70, 255] },
  { x: 2, y: 12, rgba: [50, 70, 230, 255] },
  { x: 12, y: 12, rgba: [230, 200, 40, 128] },
] as const;

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const ktx = (args: readonly string[]): void => {
  const run = spawnSync(tool, [...args], { encoding: 'utf8' });

  if (run.status !== 0) {
    throw new Error(`ktx ${args.join(' ')} exited ${run.status}: ${run.stderr}${run.stdout}`);
  }
};

const version = execFileSync(tool, ['--version'], { encoding: 'utf8' }).trim();
const scratch = mkdtempSync(join(tmpdir(), 'exojs-external-ktx2-'));

try {
  const entries = variants.map(variant => {
    let previous = sourcePath;

    variant.steps.forEach((step, index) => {
      const out = join(scratch, `${variant.file}.${index}`);

      ktx(step.map(part => part.replace('{source}', sourcePath).replace('{in}', previous).replace('{out}', out)));
      previous = out;
    });

    const target = join(fixtureDir, variant.file);

    copyFileSync(previous, target);
    ktx(['validate', '--warnings-as-errors', target]);

    return {
      file: variant.file,
      vkFormat: variant.vkFormat,
      vkFormatName: variant.vkFormatName,
      transfer: variant.transfer,
      alpha: variant.alpha,
      width: 16,
      height: 16,
      codec: variant.codec,
      commands: variant.steps.map(step => `ktx ${step.join(' ')}`),
      sha256: sha256(target),
      samples: quadrants.map(({ x, y, rgba }) => ({ x, y, rgba: variant.alpha ? rgba : [rgba[0], rgba[1], rgba[2], 255] })),
    };
  });

  const manifest = {
    $comment: 'Written by scripts/generate-external-ktx2-fixtures.ts. Do not edit by hand.',
    tool: { name: 'KTX-Software ktx', version, license: 'Apache-2.0', source: 'https://github.com/KhronosGroup/KTX-Software' },
    source: {
      file: 'source.png',
      sha256: sha256(sourcePath),
      description:
        'RGBA 16x16, four 8x8 quadrants: red, green, blue and half-transparent yellow. Authored for this repository; no third-party artwork.',
    },
    tolerance: 4,
    fixtures: entries,
  };

  mkdirSync(fixtureDir, { recursive: true });
  // The manifest is committed, so it is laid out by the repository's formatter to stay stable under `format:check`.
  const manifestPath = join(fixtureDir, 'manifest.json');
  const text = await format(JSON.stringify(manifest), { ...(await resolveConfig(manifestPath)), filepath: manifestPath });

  writeFileSync(manifestPath, text);
  console.log(`${version}: wrote ${entries.length} validated fixtures to ${fixtureDir}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
