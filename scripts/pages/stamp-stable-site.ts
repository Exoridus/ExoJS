import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { SITE_CHANNEL_BASE } from './site-channel.ts';
import { createSiteBuildManifest, serializeSiteBuildManifest, SITE_BUILD_FILE, type SiteBuildIdentity } from './site-manifest.ts';

/**
 * Records the identity and content of a finished Stable site tree in its
 * `site-build.json`, so the Pages publisher can verify it like any other
 * channel candidate.
 *
 * The Stable site build on this branch has a fixed `/ExoJS/` base and writes
 * no manifest of its own; a channel-aware site build records it during the
 * build instead, and makes this step unnecessary. The demo media of this
 * site are recorded as `standard`, the only asset profile the manifest
 * schema accepts.
 *
 * Dependency-free and erasable TypeScript, run by CI with plain `node`.
 */

export interface StampOptions {
  dir: string;
  sourceSha: string;
  packageVersion: string;
  createdAt: string;
}

/** Writes the Stable `site-build.json` into `dir`. Throws when the tree is not a Stable build. */
export const stampStableSite = (options: StampOptions): SiteBuildIdentity => {
  const base = SITE_CHANNEL_BASE.stable;
  const entry = join(options.dir, 'index.html');

  if (existsSync(join(options.dir, SITE_BUILD_FILE))) {
    throw new Error(`[stamp-stable-site] ${SITE_BUILD_FILE} already exists in ${options.dir}`);
  }

  if (!existsSync(entry)) {
    throw new Error(`[stamp-stable-site] ${options.dir} has no index.html`);
  }

  if (!readFileSync(entry, 'utf8').includes(`"${base}`)) {
    throw new Error(`[stamp-stable-site] index.html references no asset under the Stable base ${base}`);
  }

  const identity: SiteBuildIdentity = {
    channel: 'stable',
    basePath: base,
    sourceSha: options.sourceSha,
    packageVersion: options.packageVersion,
    assetProfile: 'standard',
    createdAt: options.createdAt,
    localTest: false,
  };
  const manifest = createSiteBuildManifest(options.dir, identity);
  writeFileSync(join(options.dir, SITE_BUILD_FILE), serializeSiteBuildManifest(manifest));
  console.log(
    `[stamp-stable-site] ${base} ${manifest.sourceSha.slice(0, 12)} ${manifest.packageVersion}: ` +
      `${manifest.fileCount} files, ${manifest.totalBytes} bytes, content ${manifest.contentHash}`,
  );

  return identity;
};

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`[stamp-stable-site] usage: stamp-stable-site.ts --dir <tree> --sha <commit>; missing ${name}`);
  }

  return value;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const rootPackage = JSON.parse(readFileSync('package.json', 'utf8')) as { version?: string };
    stampStableSite({
      dir: argument('--dir'),
      sourceSha: argument('--sha'),
      packageVersion: rootPackage.version ?? '',
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
