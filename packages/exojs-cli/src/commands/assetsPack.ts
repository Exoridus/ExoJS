import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { type ContainerInput, encodeContainer } from '@codexo/exojs-build/asset-container';

import { flag, type OptionSpec, parseArgs } from '../args.js';
import { CliError } from '../CliError.js';

export const ASSETS_USAGE = `Usage: exo assets pack <manifest>

Pack the assets a JSON manifest lists into one .exoa container, which the engine
unpacks in a single request via loader.loadContainer().

Manifest shape - every path resolves against the manifest's own directory:

  {
    "output": "dist/level1.exoa",
    "assets": [
      { "source": "images/hero.png", "type": "texture", "file": "hero.png", "mime": "image/png" },
      { "source": "audio/jump.wav",  "type": "sound",   "file": "jump.wav" },
      { "source": "data/level1.json","type": "json",    "file": "level1.json" }
    ]
  }

"source" is the logical path the entry stands in for - the same string a network
load would use, so a packed asset and a loose one are one identity. "file" is
where the bytes are read from. "type" is the loader type name, lowercase.

Options:
  --compress   gzip each asset, keeping the compressed bytes only where they are
               actually smaller: PNG, KTX2, audio and video are already
               compressed and are stored as they are. Over HTTP the transport
               usually compresses the whole container anyway, so this is worth
               it for offline and packaged distribution rather than for serving.`;

const OPTIONS: OptionSpec = new Map([['compress', 'boolean']]);

interface ManifestAsset {
  readonly source: string;
  readonly type: string;
  readonly file: string;
  readonly mime?: string;
  readonly options?: unknown;
}

interface ContainerManifest {
  readonly output: string;
  readonly assets: readonly ManifestAsset[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const readManifest = (manifestPath: string): ContainerManifest => {
  let raw: string;

  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch (error: unknown) {
    throw new CliError(`cannot read manifest "${manifestPath}"`, {
      hint: 'Check the path, or pass the manifest relative to the current directory.',
      cause: error,
    });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    throw new CliError(`manifest "${manifestPath}" is not valid JSON`, { cause: error });
  }

  if (!isRecord(parsed)) {
    throw new CliError(`manifest "${manifestPath}" must be a JSON object with "output" and "assets"`);
  }

  if (typeof parsed.output !== 'string' || parsed.output === '') {
    throw new CliError(`manifest "${manifestPath}" needs a non-empty string "output"`);
  }

  if (!Array.isArray(parsed.assets)) {
    throw new CliError(`manifest "${manifestPath}" needs an "assets" array`);
  }

  const assets = parsed.assets.map((entry: unknown, index: number): ManifestAsset => {
    if (!isRecord(entry)) {
      throw new CliError(`manifest "${manifestPath}": asset ${index} is not an object`);
    }

    for (const field of ['source', 'type', 'file'] as const) {
      if (typeof entry[field] !== 'string' || entry[field] === '') {
        throw new CliError(`manifest "${manifestPath}": asset ${index} needs a non-empty string "${field}"`);
      }
    }

    if (entry.mime !== undefined && typeof entry.mime !== 'string') {
      throw new CliError(`manifest "${manifestPath}": asset ${index} ("${entry.source as string}") has a non-string "mime"`);
    }

    return {
      source: entry.source as string,
      type: entry.type as string,
      file: entry.file as string,
      ...(entry.mime !== undefined && { mime: entry.mime }),
      ...(entry.options !== undefined && { options: entry.options }),
    };
  });

  return { output: parsed.output, assets };
};

/**
 * Pack a manifest into an `.exoa` container.
 *
 * @returns `0` on success; every failure is a {@link CliError} instead.
 */
export const runAssetsPack = (argv: readonly string[]): number => {
  const args = parseArgs(argv, OPTIONS);
  const manifestArg = args.positionals[0];

  if (manifestArg === undefined) {
    throw new CliError('a manifest path is required', { hint: 'Run `exo assets pack <manifest>`; `exo assets --help` shows the manifest shape.' });
  }

  const manifestPath = resolve(manifestArg);
  const manifestDir = dirname(manifestPath);
  const manifest = readManifest(manifestPath);
  let plainBytes = 0;

  const inputs: ContainerInput[] = manifest.assets.map(asset => {
    const filePath = resolve(manifestDir, asset.file);
    let bytes: Buffer;

    try {
      bytes = readFileSync(filePath);
    } catch (error: unknown) {
      throw new CliError(`cannot read "${asset.file}" for "${asset.source}"`, {
        hint: `Paths resolve against the manifest directory (${manifestDir}).`,
        cause: error,
      });
    }

    plainBytes += bytes.byteLength;

    return {
      source: asset.source,
      type: asset.type,
      bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      ...(asset.mime !== undefined && { mime: asset.mime }),
      ...(asset.options !== undefined && { options: asset.options }),
    };
  });

  const compress = flag(args, 'compress');
  const container = encodeContainer(inputs, { compress });
  const outputPath = resolve(manifestDir, manifest.output);

  try {
    writeFileSync(outputPath, new Uint8Array(container));
  } catch (error: unknown) {
    throw new CliError(`cannot write "${manifest.output}"`, { hint: 'Create the output directory first; the packer does not create it.', cause: error });
  }

  // With --compress the two numbers differ by whatever gzip won, minus the
  // index; without it they differ only by the header and the index.
  console.log(`Wrote ${inputs.length} asset(s) -> ${outputPath} (${container.byteLength} bytes from ${plainBytes} bytes of asset data)`);

  return 0;
};
