import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { assertSameFiles, checkGeneratedFiles, readBundleFiles, sha256 } from './files.ts';
import {
  DEFAULT_SCRATCH_DIRECTORY,
  DEFAULT_TOOL_DIRECTORY,
  readPinnedSchema,
  REPO_ROOT,
  SOURCE_DIRECTORY,
  verifyToolchain,
} from './toolchain.ts';
import { adaptAtlas, createRecipeValidator, type PixelImage, type PixelVfxAtlas, validatePixels } from './validation.ts';

interface PixelboltReport {
  ok: boolean;
  warnings: string[];
  clipping?: unknown[];
  clippingOmitted?: number;
}

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean', default: false },
      effect: { type: 'string' },
      'tool-dir': { type: 'string' },
      'scratch-dir': { type: 'string' },
    },
  });
  const toolDirectory = resolve(values['tool-dir'] ?? DEFAULT_TOOL_DIRECTORY);
  const scratchDirectory = resolve(values['scratch-dir'] ?? DEFAULT_SCRATCH_DIRECTORY);
  const pin = verifyToolchain(toolDirectory);
  const validateRecipe = createRecipeValidator(readPinnedSchema());
  const paletteBytes = readFileSync(join(SOURCE_DIRECTORY, 'palette.json'));
  const palette = JSON.parse(paletteBytes.toString('utf8')) as Record<string, string>;
  const recipesDirectory = join(SOURCE_DIRECTORY, 'recipes');
  const effects = readdirSync(recipesDirectory)
    .filter(file => file.endsWith('.pixel.json'))
    .map(file => file.slice(0, -'.pixel.json'.length))
    .sort();

  if (effects.length === 0 || (values.effect !== undefined && !effects.includes(values.effect))) {
    throw new Error(`Choose an available effect: ${effects.join(', ')}`);
  }

  const selected = values.effect === undefined ? effects : [values.effect];
  const outputDirectory = join(REPO_ROOT, 'examples/assets/images');
  const expectedNames = new Set(effects.flatMap(effect => [`pixel-vfx-${effect}.png`, `pixel-vfx-${effect}.json`]));
  const stale = readdirSync(outputDirectory).filter(name => /^pixel-vfx-.*\.(?:png|json)$/.test(name) && !expectedNames.has(name));

  if (stale.length > 0) {
    throw new Error(`Remove obsolete generated Pixel VFX files explicitly: ${stale.join(', ')}`);
  }

  mkdirSync(scratchDirectory, { recursive: true });
  const runDirectory = mkdtempSync(join(scratchDirectory, 'build-'));
  const runtime = (await import(pathToFileURL(join(toolDirectory, 'src/index.js')).href)) as {
    decodePNG: (bytes: Uint8Array) => PixelImage;
  };
  const generated = new Map<string, Buffer>();
  const reports: object[] = [];

  const cli = (...args: string[]): PixelboltReport => {
    const report = JSON.parse(
      execFileSync(process.execPath, [join(toolDirectory, 'bin/pixelbolt.js'), ...args], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      }),
    ) as PixelboltReport;

    if (!report.ok || (report.clipping?.length ?? 0) > 0 || (report.clippingOmitted ?? 0) > 0) {
      throw new Error(`Pixelbolt semantic validation reported clipping or failure: ${JSON.stringify(report)}`);
    }

    return report;
  };

  for (const effect of selected) {
    const recipePath = join(recipesDirectory, `${effect}.pixel.json`);
    const source = readFileSync(recipePath);
    const recipe = validateRecipe(JSON.parse(source.toString('utf8')) as unknown, effect);
    const semantic = cli('validate', recipePath);
    const firstDirectory = join(runDirectory, 'first', effect);
    const secondDirectory = join(runDirectory, 'second', effect);
    const firstRender = cli('render', recipePath, '--out', firstDirectory);
    const secondRender = cli('render', recipePath, '--out', secondDirectory);
    const first = readBundleFiles(firstDirectory);
    const second = readBundleFiles(secondDirectory);
    assertSameFiles(first, second);
    const png = first.get(`${recipe.name}.png`);
    const metadata = first.get(`${recipe.name}.atlas.json`);

    if (!png || !metadata) {
      throw new Error(`${effect}: Pixelbolt did not export the required PNG and atlas`);
    }

    const nativeAtlas = JSON.parse(metadata.toString('utf8')) as PixelVfxAtlas;
    const atlas = adaptAtlas(nativeAtlas, recipe);
    const pixels = validatePixels(runtime.decodePNG(png), atlas, recipe, palette);
    const json = Buffer.from(`${JSON.stringify(atlas)}\n`);
    generated.set(`${recipe.name}.png`, png);
    generated.set(`${recipe.name}.json`, json);
    const report = {
      effect,
      sourceSha256: sha256(source),
      width: recipe.width,
      height: recipe.height,
      frames: recipe.frames.length,
      durationMs: recipe.frames.reduce((total, frame) => total + frame.duration, 0),
      loop: recipe.animations.play.loop,
      identicalRawFiles: first.size,
      pngSha256: sha256(png),
      atlasSha256: sha256(json),
      ...pixels,
    };
    reports.push(report);
    writeFileSync(
      join(runDirectory, `${effect}.validation.json`),
      `${JSON.stringify({ ...report, semantic, firstRender, secondRender }, null, 2)}\n`,
    );
    console.log(
      `${effect}: ${recipe.frames.length} native ${recipe.width}x${recipe.height} frames, ${first.size} identical raw files, palette/borders/gutters valid`,
    );
  }

  const differences = checkGeneratedFiles(generated, outputDirectory);
  const proof = {
    pixelbolt: { version: pin.version, commit: pin.commit, schemaSha256: pin.schema.sha256 },
    environment: { node: process.version, zlib: process.versions.zlib },
    paletteSha256: sha256(paletteBytes),
    check: values.check,
    generatedFiles: generated.size,
    differences,
    effects: reports,
  };
  writeFileSync(join(runDirectory, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);

  if (values.check) {
    if (differences.length > 0) {
      throw new Error(`Generated Pixel VFX assets are stale:\n${differences.join('\n')}\nRun the build command. Proof: ${runDirectory}`);
    }
  } else {
    for (const [name, bytes] of generated) {
      writeFileSync(join(outputDirectory, name), bytes);
    }
  }

  console.log(
    `${values.check ? 'Checked' : 'Wrote'} ${generated.size} runtime files. Proof and full bundles: ${relative(REPO_ROOT, runDirectory)}`,
  );
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
