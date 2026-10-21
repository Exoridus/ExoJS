/**
 * Reads and validates `catalog.json`, the one authored source of the demo
 * catalog, and derives everything a delivery needs from it: each entry's
 * transitive files, the per-profile file sets with hashes and provenance, and
 * the generated TypeScript and notices.
 *
 * Shared by `generate.ts` (writes the outputs), `archive.ts` (packs the media
 * profiles) and the package tests (drift and closure checks).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { posix, resolve } from 'node:path';

export const packageRoot = resolve(import.meta.dirname, '..');

export type DemoAssetProfile = 'standard' | 'extended';

export type DemoAssetTypeName = 'texture' | 'json' | 'sound' | 'music' | 'video' | 'font' | 'bmFont' | 'svg';

export interface ProvenanceRecord {
  readonly title: string;
  readonly author: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly source: string;
  readonly attribution?: string;
  readonly note?: string;
  readonly licenseFile?: string;
}

type OptionValue = string | number | boolean | { readonly $path: string };

export interface CatalogEntry {
  readonly key: string;
  readonly type: DemoAssetTypeName;
  readonly path: string;
  readonly category: string;
  readonly provenance: string;
  readonly profile?: DemoAssetProfile;
  readonly valueType?: 'SpritesheetData';
  readonly options?: Readonly<Record<string, OptionValue>>;
}

export interface CatalogSource {
  readonly sourceRoot: string;
  readonly provenance: Readonly<Record<string, ProvenanceRecord>>;
  readonly media: Readonly<Record<string, unknown>>;
  readonly entries: readonly CatalogEntry[];
  readonly blocked: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
}

export interface ResolvedFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly role: 'entry' | 'transitive' | 'license';
  readonly profile: DemoAssetProfile;
  readonly provenance: string;
  /** A byte-identical file in a vendored upstream pack, when there is one. */
  readonly upstream?: string;
}

export interface ResolvedEntry extends CatalogEntry {
  readonly profile: DemoAssetProfile;
  readonly sha256: string;
  readonly bytes: number;
  readonly transitive: readonly string[];
}

export interface ResolvedCatalog {
  readonly source: CatalogSource;
  readonly sourceRoot: string;
  readonly entries: readonly ResolvedEntry[];
  readonly files: readonly ResolvedFile[];
}

const TYPES: ReadonlySet<string> = new Set(['texture', 'json', 'sound', 'music', 'video', 'font', 'bmFont', 'svg']);
const KEY = /^[a-z][A-Za-z0-9]*$/;
const MEDIA_SUFFIX =
  /\.(png|jpe?g|webp|avif|gif|ktx2|svg|ogg|mp3|wav|m4a|mp4|webm|json|tmj|tsj|tj|tmx|tsx|tx|ldtk|ldtkl|fnt|ttf|otf|woff2?|vtt|srt)$/i;
const VENDOR_PACK = /^demo\/vendor\/kenney\/([^/]+)\//;

/** The provenance id of a Kenney pack directory. Most packs are named without the prefix; `kenney-fonts` already carries it. */
const kenneyPackId = (pack: string): string => (pack.startsWith('kenney-') ? pack : `kenney-${pack}`);

export const sha256Of = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

export const readCatalogSource = (): CatalogSource =>
  JSON.parse(readFileSync(resolve(packageRoot, 'catalog.json'), 'utf8')) as CatalogSource;

/**
 * Files an asset names relative to itself: tilesets and images of a Tiled or
 * LDtk map, and the pages of a bitmap font. Atlas JSON is deliberately not
 * followed: its `meta.image` names the file the atlas was exported from, not
 * the image shipped next to it.
 */
const referencedFiles = (sourceRoot: string, path: string): string[] => {
  const absolute = resolve(sourceRoot, path);
  const directory = posix.dirname(path);
  const lower = path.toLowerCase();
  const names: string[] = [];

  if (/\.(tmj|tsj|tj|ldtk|ldtkl)$/.test(lower)) {
    const walk = (value: unknown): void => {
      if (typeof value === 'string') {
        if (MEDIA_SUFFIX.test(value)) {
          names.push(value);
        }
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value !== null && typeof value === 'object') {
        Object.values(value).forEach(walk);
      }
    };

    walk(JSON.parse(readFileSync(absolute, 'utf8')));
  } else if (/\.(fnt|tsx|tx|tmx)$/.test(lower)) {
    const text = readFileSync(absolute, 'utf8');

    for (const match of text.matchAll(/(?:file|source)="([^"]+)"/g)) {
      names.push(match[1]!);
    }
  }

  return names.map(name => posix.normalize(posix.join(directory, name)));
};

const vendorIndex = (sourceRoot: string): Map<string, string> => {
  const index = new Map<string, string>();
  const vendorRoot = resolve(sourceRoot, 'demo', 'vendor');

  if (!existsSync(vendorRoot)) {
    return index;
  }

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        walk(absolute);
      } else if (statSync(absolute).size > 0) {
        const hash = sha256Of(absolute);

        if (!index.has(hash)) {
          index.set(hash, absolute.slice(sourceRoot.length + 1).replaceAll('\\', '/'));
        }
      }
    }
  };

  walk(vendorRoot);

  return index;
};

/** Validates the authored catalog and resolves its file sets. Throws listing every problem found. */
export const resolveCatalog = (source: CatalogSource = readCatalogSource()): ResolvedCatalog => {
  const sourceRoot = resolve(packageRoot, source.sourceRoot);
  const problems: string[] = [];
  const seenKeys = new Set<string>();
  const seenPaths = new Map<string, string>();
  const blocked = new Set(source.blocked.map(item => item.path));
  const upstream = vendorIndex(sourceRoot);
  const files = new Map<string, ResolvedFile>();

  const addFile = (path: string, role: ResolvedFile['role'], profile: DemoAssetProfile, provenance: string): void => {
    const existing = files.get(path);

    if (existing !== undefined) {
      // A file both profiles need ships in the standard one; the extended
      // archive only adds what the standard profile lacks.
      if (existing.profile === 'extended' && profile === 'standard') {
        files.set(path, { ...existing, profile });
      }

      return;
    }

    const absolute = resolve(sourceRoot, path);

    if (!existsSync(absolute)) {
      problems.push(`${path}: file does not exist under ${source.sourceRoot}`);

      return;
    }

    const sha256 = sha256Of(absolute);
    const match = upstream.get(sha256);
    files.set(path, {
      path,
      bytes: statSync(absolute).size,
      sha256,
      role,
      profile,
      provenance,
      ...(match !== undefined && match !== path ? { upstream: match } : {}),
    });
  };

  const entries: ResolvedEntry[] = [];

  for (const entry of source.entries) {
    const profile = entry.profile ?? 'standard';

    if (!KEY.test(entry.key)) {
      problems.push(`${entry.key}: keys are lower camelCase identifiers`);
    }

    if (seenKeys.has(entry.key)) {
      problems.push(`${entry.key}: duplicate key`);
    }

    seenKeys.add(entry.key);

    if (!TYPES.has(entry.type)) {
      problems.push(`${entry.key}: unknown type "${entry.type}"`);
    }

    if (blocked.has(entry.path)) {
      problems.push(`${entry.key}: ${entry.path} is blocked from publication`);
    }

    const previous = seenPaths.get(entry.path);

    if (previous !== undefined) {
      problems.push(`${entry.key}: ${entry.path} is already published as ${previous}`);
    }

    seenPaths.set(entry.path, entry.key);

    const provenance = source.provenance[entry.provenance];

    if (provenance === undefined) {
      problems.push(`${entry.key}: unknown provenance "${entry.provenance}"`);
      continue;
    }

    addFile(entry.path, 'entry', profile, entry.provenance);
    const entryFile = files.get(entry.path);

    if (entryFile === undefined) {
      continue;
    }

    // A curated copy of a vendored pack file must name that pack, so the notice
    // can never attribute a file to the wrong upstream.
    const pack = entryFile.upstream === undefined ? undefined : VENDOR_PACK.exec(entryFile.upstream)?.[1];
    const expectedProvenance = pack === undefined ? undefined : kenneyPackId(pack);

    if (expectedProvenance !== undefined && entry.provenance !== expectedProvenance) {
      problems.push(
        `${entry.key}: byte-identical to ${entryFile.upstream}, but attributed to ${entry.provenance} instead of ${expectedProvenance}`,
      );
    }

    const transitive: string[] = [];
    const pending = [entry.path, ...Object.values(entry.options ?? {}).flatMap(value => (typeof value === 'object' ? [value.$path] : []))];
    const visited = new Set<string>();

    while (pending.length > 0) {
      const next = pending.shift()!;

      if (visited.has(next)) {
        continue;
      }

      visited.add(next);

      if (next !== entry.path) {
        transitive.push(next);

        if (blocked.has(next)) {
          problems.push(`${entry.key}: depends on blocked ${next}`);
        }

        const vendorPack = VENDOR_PACK.exec(next)?.[1];
        const owner =
          vendorPack !== undefined && source.provenance[kenneyPackId(vendorPack)] !== undefined
            ? kenneyPackId(vendorPack)
            : entry.provenance;
        addFile(next, 'transitive', profile, owner);
      }

      if (existsSync(resolve(sourceRoot, next))) {
        pending.push(...referencedFiles(sourceRoot, next));
      }
    }

    const resolvedEntryFile = files.get(entry.path)!;
    entries.push({ ...entry, profile, sha256: resolvedEntryFile.sha256, bytes: resolvedEntryFile.bytes, transitive });
  }

  const provenanceUsed = new Map<string, DemoAssetProfile>();

  for (const file of files.values()) {
    if (provenanceUsed.get(file.provenance) !== 'standard') {
      provenanceUsed.set(file.provenance, file.profile);
    }
  }

  for (const [id, profile] of provenanceUsed) {
    const licenseFile = source.provenance[id]?.licenseFile;

    if (licenseFile !== undefined) {
      addFile(licenseFile, 'license', profile, id);
    }
  }

  for (const id of Object.keys(source.provenance)) {
    if (!provenanceUsed.has(id)) {
      problems.push(`provenance "${id}" is not used by any entry`);
    }
  }

  for (const path of Object.keys(source.media)) {
    if (!files.has(path)) {
      problems.push(`media metadata for ${path}, which no entry publishes`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`catalog.json is invalid:\n  ${problems.join('\n  ')}`);
  }

  return {
    source,
    sourceRoot,
    entries,
    files: [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
};

export const filesFor = (catalog: ResolvedCatalog, profile: DemoAssetProfile): ResolvedFile[] =>
  catalog.files.filter(file => file.profile === profile);

export const bytesOf = (files: readonly ResolvedFile[]): number => files.reduce((sum, file) => sum + file.bytes, 0);
