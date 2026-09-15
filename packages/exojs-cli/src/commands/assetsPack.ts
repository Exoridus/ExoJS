import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { type ContainerInput, encodeContainer } from '@codexo/exojs-build/asset-container';
import { containerPackFileName, describeContainerPack, mergeAssetManifest } from '@codexo/exojs-build/asset-manifest';

import { type OptionSpec, parseArgs, text } from '../args.js';
import { CliError } from '../CliError.js';

export const ASSETS_USAGE = `Usage: exo assets pack <pack-description> [--manifest <path>]

Pack the assets a JSON pack description lists into one .exoa container, which
the engine unpacks in a single request via loader.loadContainer().

Pack description - every path resolves against the description's own directory:

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

The container is compressed in blocks that span several assets, and a block is
kept compressed only where that is actually smaller, so already-compressed
payload (PNG, KTX2, audio, video) is stored as it is.

Options:
  --manifest <path>      Also write the pack under a content-addressed name
                         (<name>.<hash>.exoa, next to "output") and create or
                         update the asset manifest at <path>. The pack file is
                         then immutable and may be cached forever; the manifest
                         is the one URL that changes. Read it at runtime with
                         loader.loadManifest(url).

With --manifest, the pack is named after the description's optional "name", or
after the "output" file's stem. Packing each pack in its own invocation builds
one manifest holding all of them.`;

const OPTIONS: OptionSpec = new Map([['manifest', 'value']]);

interface DescribedAsset {
  readonly source: string;
  readonly type: string;
  readonly file: string;
  readonly mime?: string;
  readonly options?: unknown;
}

interface PackDescription {
  readonly output: string;
  readonly assets: readonly DescribedAsset[];
  /** Logical name in the manifest; the `output` stem when absent. */
  readonly name?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const readJsonFile = (path: string, what: string): unknown => {
  let raw: string;

  try {
    raw = readFileSync(path, 'utf8');
  } catch (error: unknown) {
    throw new CliError(`cannot read ${what} "${path}"`, {
      hint: 'Check the path, or pass it relative to the current directory.',
      cause: error,
    });
  }

  try {
    return JSON.parse(raw);
  } catch (error: unknown) {
    throw new CliError(`${what} "${path}" is not valid JSON`, { cause: error });
  }
};

const readPackDescription = (descriptionPath: string): PackDescription => {
  const parsed = readJsonFile(descriptionPath, 'pack description');

  if (!isRecord(parsed)) {
    throw new CliError(`pack description "${descriptionPath}" must be a JSON object with "output" and "assets"`);
  }

  if (typeof parsed.output !== 'string' || parsed.output === '') {
    throw new CliError(`pack description "${descriptionPath}" needs a non-empty string "output"`);
  }

  if (parsed.name !== undefined && (typeof parsed.name !== 'string' || parsed.name === '')) {
    throw new CliError(`pack description "${descriptionPath}" has a "name" that is not a non-empty string`);
  }

  if (!Array.isArray(parsed.assets)) {
    throw new CliError(`pack description "${descriptionPath}" needs an "assets" array`);
  }

  const assets = parsed.assets.map((entry: unknown, index: number): DescribedAsset => {
    if (!isRecord(entry)) {
      throw new CliError(`pack description "${descriptionPath}": asset ${index} is not an object`);
    }

    for (const field of ['source', 'type', 'file'] as const) {
      if (typeof entry[field] !== 'string' || entry[field] === '') {
        throw new CliError(`pack description "${descriptionPath}": asset ${index} needs a non-empty string "${field}"`);
      }
    }

    if (entry.mime !== undefined && typeof entry.mime !== 'string') {
      throw new CliError(`pack description "${descriptionPath}": asset ${index} ("${entry.source as string}") has a non-string "mime"`);
    }

    return {
      source: entry.source as string,
      type: entry.type as string,
      file: entry.file as string,
      ...(entry.mime !== undefined && { mime: entry.mime }),
      ...(entry.options !== undefined && { options: entry.options }),
    };
  });

  return { output: parsed.output, assets, ...(typeof parsed.name === 'string' && { name: parsed.name }) };
};

/** The logical pack name: what the description says, or the output file's stem. */
const packName = (description: PackDescription): string => {
  if (description.name !== undefined) return description.name;

  const base = description.output.replaceAll('\\', '/').split('/').pop() ?? description.output;
  const dot = base.lastIndexOf('.');

  return dot <= 0 ? base : base.slice(0, dot);
};

const writeContainer = (path: string, container: ArrayBuffer, shown: string): void => {
  try {
    writeFileSync(path, new Uint8Array(container));
  } catch (error: unknown) {
    throw new CliError(`cannot write "${shown}"`, { hint: 'Create the output directory first; the packer does not create it.', cause: error });
  }
};

/**
 * Write the pack under its content-addressed name and merge it into the
 * manifest at `manifestPath`.
 *
 * @returns The path the pack was written to.
 */
const writeAddressedPack = (manifestPath: string, outputPath: string, name: string, container: ArrayBuffer): string => {
  const pack = describeContainerPack(container);
  const packPath = resolve(dirname(outputPath), containerPackFileName(name, pack.hash));
  const file = relative(dirname(manifestPath), packPath).replaceAll('\\', '/');

  if (file.startsWith('../')) {
    throw new CliError(`pack "${name}" would be written outside the manifest directory`, {
      hint: 'A manifest addresses its packs relative to itself; put it beside or above the output directory.',
    });
  }

  const existing = existsSync(manifestPath) ? readJsonFile(manifestPath, 'asset manifest') : undefined;
  let document: ReturnType<typeof mergeAssetManifest>;

  try {
    document = mergeAssetManifest(existing, name, { file, ...pack });
  } catch (error: unknown) {
    throw new CliError(`cannot update "${manifestPath}": ${error instanceof Error ? error.message : String(error)}`, {
      hint: 'Delete it to write a fresh manifest, or point --manifest at a different path.',
      cause: error,
    });
  }

  writeContainer(packPath, container, packPath);

  try {
    writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
  } catch (error: unknown) {
    throw new CliError(`cannot write "${manifestPath}"`, { hint: 'Create the manifest directory first; the packer does not create it.', cause: error });
  }

  return packPath;
};

/**
 * Pack a description into an `.exoa` container, and with `--manifest` into a
 * content-addressed pack plus the manifest that names it.
 *
 * @returns `0` on success; every failure is a {@link CliError} instead.
 */
export const runAssetsPack = (argv: readonly string[]): number => {
  const args = parseArgs(argv, OPTIONS);
  const descriptionArg = args.positionals[0];

  if (descriptionArg === undefined) {
    throw new CliError('a pack description path is required', {
      hint: 'Run `exo assets pack <pack-description>`; `exo assets --help` shows the description shape.',
    });
  }

  const descriptionPath = resolve(descriptionArg);
  const descriptionDir = dirname(descriptionPath);
  const description = readPackDescription(descriptionPath);
  let plainBytes = 0;

  const inputs: ContainerInput[] = description.assets.map(asset => {
    const filePath = resolve(descriptionDir, asset.file);
    let bytes: Buffer;

    try {
      bytes = readFileSync(filePath);
    } catch (error: unknown) {
      throw new CliError(`cannot read "${asset.file}" for "${asset.source}"`, {
        hint: `Paths resolve against the pack description's directory (${descriptionDir}).`,
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

  const container = encodeContainer(inputs);
  const outputPath = resolve(descriptionDir, description.output);
  const manifestArg = text(args, 'manifest', '');
  const manifestPath = manifestArg === '' ? undefined : resolve(manifestArg);
  let writtenPath = outputPath;

  if (manifestPath === undefined) {
    writeContainer(outputPath, container, description.output);
  } else {
    writtenPath = writeAddressedPack(manifestPath, outputPath, packName(description), container);
  }

  // The two numbers differ by whatever the block compression won, minus the
  // header, the head and the alignment padding.
  console.log(`Wrote ${inputs.length} asset(s) -> ${writtenPath} (${container.byteLength} bytes from ${plainBytes} bytes of asset data)`);

  if (manifestPath !== undefined) {
    console.log(`Manifest: ${manifestPath}`);
  }

  return 0;
};
