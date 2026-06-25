/**
 * Build an ExoJS asset container (`.exoa`) from a JSON manifest.
 *
 * Usage:  tsx scripts/build-container.ts <manifest.json>
 *
 * Manifest shape (paths resolved relative to the manifest's own directory):
 *
 *   {
 *     "output": "dist/level1.exoa",
 *     "assets": [
 *       { "alias": "hero",  "type": "texture", "file": "hero.png", "mime": "image/png" },
 *       { "alias": "jump",  "type": "sound",   "file": "jump.wav" },
 *       { "alias": "level", "type": "json",    "file": "level1.json" }
 *     ]
 *   }
 *
 * `type` is the loader type name (lowercase, e.g. `texture`/`sound`/`json`), the
 * same tag used by the config-map load path — not the constructor name. The
 * container is unpacked at runtime via `loader.loadContainer(url)`.
 *
 * Shares the format with the runtime reader through `encodeContainer`
 * (src/resources/AssetContainer.ts), so builder and reader never drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { type ContainerInput, encodeContainer } from '../src/resources/AssetContainer';

interface ManifestAsset {
  alias: string;
  type: string;
  file: string;
  mime?: string;
  options?: unknown;
}

interface ContainerManifest {
  output: string;
  assets: ManifestAsset[];
}

function main(): void {
  const manifestPath = process.argv[2];

  if (!manifestPath) {
    console.error('Usage: tsx scripts/build-container.ts <manifest.json>');
    process.exit(1);
  }

  const manifestDir = dirname(resolve(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ContainerManifest;

  if (!Array.isArray(manifest.assets) || typeof manifest.output !== 'string') {
    console.error('Manifest must have a string "output" and an "assets" array.');
    process.exit(1);
  }

  const inputs: ContainerInput[] = manifest.assets.map(asset => {
    const fileBytes = readFileSync(resolve(manifestDir, asset.file));

    return {
      alias: asset.alias,
      type: asset.type,
      bytes: new Uint8Array(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength),
      ...(asset.mime !== undefined && { mime: asset.mime }),
      ...(asset.options !== undefined && { options: asset.options }),
    };
  });

  const container = encodeContainer(inputs);
  const outputPath = resolve(manifestDir, manifest.output);

  writeFileSync(outputPath, new Uint8Array(container));

  console.log(`Wrote ${inputs.length} asset(s) → ${outputPath} (${container.byteLength} bytes)`);
}

main();
