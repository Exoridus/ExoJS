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
 *       { "source": "images/hero.png", "type": "texture", "file": "hero.png", "mime": "image/png" },
 *       { "source": "audio/jump.wav",  "type": "sound",   "file": "jump.wav" },
 *       { "source": "data/level1.json","type": "json",    "file": "level1.json" }
 *     ]
 *   }
 *
 * `source` is the logical, base-path-relative path the entry stands in for — the
 * same string a network load would use, so the packed asset and the loose one
 * are one identity. `file` is where the bytes are read from at build time.
 *
 * `type` is the loader type name (lowercase, e.g. `texture`/`sound`/`json`), the
 * same tag used by the config-map load path — not the constructor name. The
 * container is unpacked at runtime via `loader.loadContainer(url)`.
 *
 * Shares the format with the runtime reader through `encodeContainer`
 * (src/assets/AssetContainer.ts), so builder and reader never drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { type ContainerInput, encodeContainer } from '../src/assets/AssetContainer';

interface ManifestAsset {
  source: string;
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
      source: asset.source,
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
