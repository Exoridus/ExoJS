import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { checkTreeSafety, extractTar, readZipFile } from './archive-safety.ts';
import { type ExpectedChannel, openChannelArchive, verifyChannelTree, verifyDigest } from './channel-artifact.ts';
import { buildChannelsDocument, CHANNELS_FILE, type ChannelsDocument, type ChannelSource, serializeChannelsDocument } from './channels-document.ts';
import { createGitHubClient, type GitHubClient } from './github-api.ts';
import { type ChannelPlan, parseSelection, type Transport } from './select-channels.ts';
import { evaluateSiteSize, SITE_SIZE_REFUSE_BYTES, type SiteSizeThresholds, type SiteSizeVerdict } from './site-budget.ts';
import { SITE_CHANNEL_BASE, type SiteChannel } from './site-channel.ts';
import { readSiteBuildManifest, SITE_BUILD_FILE, type SiteBuildManifest, verifySiteTree } from './site-manifest.ts';

export {
  buildChannelsDocument,
  type ChannelEntry,
  CHANNELS_FILE,
  type ChannelsDocument,
  type ChannelSource,
  pairingOf,
  parseChannelsDocument,
} from './channels-document.ts';

/**
 * Joins the Stable and the Next channel tree into the one tree GitHub Pages
 * serves: Stable at the root, Next under `next/`. The composer adds
 * `channels.json` and `.nojekyll` and nothing else, never runs or rebuilds
 * site code, and proves that both channels arrive byte for byte.
 *
 * Dependency-free and erasable TypeScript, run by the publisher with plain
 * `node` from the trusted default-branch checkout.
 */

export const NOJEKYLL_FILE = '.nojekyll';

const COMPOSER_FILES = new Set([CHANNELS_FILE, NOJEKYLL_FILE]);

export interface CrossChannelReference {
  file: string;
  url: string;
}

const URL_ATTRIBUTE = /\b(?:href|src|action|poster|content)=(["'])([^"']*)\1/g;

/**
 * URLs in the HTML of the channel tree at `dir` that point into the other
 * channel. The bare base of the other channel is allowed: it is the explicit
 * channel switch.
 */
export const findCrossChannelReferences = (dir: string, ownBase: string, otherBase: string): CrossChannelReference[] => {
  const hits: CrossChannelReference[] = [];
  const nested = ownBase.length > otherBase.length && ownBase.startsWith(otherBase);

  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const abs = join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(abs, rel);
        continue;
      }

      if (extname(entry.name) !== '.html') {
        continue;
      }

      for (const match of readFileSync(abs, 'utf8').matchAll(URL_ATTRIBUTE)) {
        const url = match[2]!;

        if (url.startsWith(otherBase) && url.length > otherBase.length && !(nested && url.startsWith(ownBase))) {
          hits.push({ file: rel, url });
        }
      }
    }
  };

  visit(dir, '');

  return hits;
};

const treeBytes = (root: string): number => {
  let bytes = 0;

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const abs = join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(abs);
      } else {
        bytes += statSync(abs).size;
      }
    }
  };

  visit(root);

  return bytes;
};

const copyListed = (fromDir: string, toDir: string, manifest: SiteBuildManifest): void => {
  for (const path of [...manifest.files.map(file => file.path), SITE_BUILD_FILE]) {
    const target = join(toDir, ...path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(fromDir, ...path.split('/')), target);
  }
};

const isReserved = (path: string): boolean => path.startsWith('next/') || COMPOSER_FILES.has(path);

export interface ComposeInput {
  dir: string;
  source: ChannelSource;
}

export interface ComposeOptions {
  outDir: string;
  stable: ComposeInput;
  next: ComposeInput | null;
  budget?: SiteSizeThresholds;
}

export interface ComposeReport {
  problems: string[];
  bytes: number;
  budget: SiteSizeVerdict;
  channels: ChannelsDocument | null;
}

const checkInput = (channel: SiteChannel, input: ComposeInput, problems: string[]): SiteBuildManifest | null => {
  let manifest: SiteBuildManifest;

  try {
    manifest = readSiteBuildManifest(input.dir);
  } catch (error) {
    problems.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);

    return null;
  }

  if (manifest.channel !== channel) {
    problems.push(`${channel}: the tree was built for channel ${manifest.channel}`);
  }

  if (manifest.localTest) {
    problems.push(`${channel}: the tree is a local test build for ${manifest.basePath}`);
  } else if (manifest.basePath !== SITE_CHANNEL_BASE[channel]) {
    problems.push(`${channel}: the tree was built for base ${manifest.basePath}, not ${SITE_CHANNEL_BASE[channel]}`);
  }

  problems.push(...verifySiteTree(input.dir, manifest).map(problem => `${channel}: ${problem}`));

  return manifest;
};

/**
 * Writes the composed tree to `outDir`, which must be empty or absent. Returns
 * every problem found; the tree may only be uploaded when there is none.
 */
export const composeSite = (options: ComposeOptions): ComposeReport => {
  const outDir = resolve(options.outDir);

  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    throw new Error(`[compose-site] the output directory ${outDir} must be empty`);
  }

  const problems: string[] = [];
  const stable = checkInput('stable', options.stable, problems);
  const next = options.next === null ? null : checkInput('next', options.next, problems);

  for (const file of stable?.files ?? []) {
    if (isReserved(file.path)) {
      problems.push(`stable: ${file.path} is a reserved path of the composed site`);
    }
  }

  const empty: ComposeReport = { problems, bytes: 0, budget: evaluateSiteSize(0, options.budget), channels: null };

  if (problems.length > 0 || stable === null || (options.next !== null && next === null)) {
    return empty;
  }

  mkdirSync(outDir, { recursive: true });
  copyListed(options.stable.dir, outDir, stable);

  if (next !== null && options.next !== null) {
    copyListed(options.next.dir, join(outDir, 'next'), next);
  }

  const channels = buildChannelsDocument({
    stable: { manifest: stable, source: options.stable.source },
    next: next === null || options.next === null ? null : { manifest: next, source: options.next.source },
  });
  writeFileSync(join(outDir, NOJEKYLL_FILE), '');
  writeFileSync(join(outDir, CHANNELS_FILE), serializeChannelsDocument(channels));

  problems.push(...verifySiteTree(outDir, stable, { allowExtra: isReserved }).map(problem => `composed stable: ${problem}`));

  if (next !== null) {
    problems.push(...verifySiteTree(join(outDir, 'next'), next).map(problem => `composed next: ${problem}`));

    for (const hit of findCrossChannelReferences(join(outDir, 'next'), SITE_CHANNEL_BASE.next, SITE_CHANNEL_BASE.stable)) {
      problems.push(`composed next: next/${hit.file} references the Stable channel at ${hit.url}`);
    }
  }

  for (const hit of findCrossChannelReferences(outDir, SITE_CHANNEL_BASE.stable, SITE_CHANNEL_BASE.next)) {
    if (!hit.file.startsWith('next/')) {
      problems.push(`composed stable: ${hit.file} references the Next channel at ${hit.url}`);
    }
  }

  problems.push(...checkTreeSafety(outDir).map(problem => `composed tree: ${problem}`));

  const bytes = treeBytes(outDir);
  const budget = evaluateSiteSize(bytes, options.budget);

  if (budget.level === 'refuse') {
    problems.push(`composed tree: ${budget.message}; the upload is refused by the site budget`);
  }

  return { problems, bytes, budget, channels };
};

/**
 * Copies one channel out of a composed tree into `destDir`, exactly the files
 * its `site-build.json` lists. Throws unless the channel is intact.
 */
export const extractComposedChannel = (composedDir: string, path: '' | 'next/', destDir: string): SiteBuildManifest => {
  const root = path === '' ? composedDir : join(composedDir, 'next');
  const manifest = readSiteBuildManifest(root);
  const problems = verifySiteTree(root, manifest, path === '' ? { allowExtra: isReserved } : {});

  if (problems.length > 0) {
    throw new Error(`[compose-site] the ${path === '' ? 'stable' : 'next'} channel of the snapshot is not intact:\n  ${problems.join('\n  ')}`);
  }

  copyListed(root, destDir, manifest);

  return manifest;
};

// A Pages artifact is a zip around one tar of the whole composed tree; the tar
// adds a header block per member on top of the content budget.
const PAGES_CONTAINER_LIMITS = { maxUnpackedBytes: SITE_SIZE_REFUSE_BYTES + 200_000_000 };

export interface SnapshotCache {
  /** Where unpacked Pages artifacts are kept, one directory per artifact id. */
  dir: string;
}

export interface FetchedChannel {
  dir: string;
  manifest: SiteBuildManifest;
  source: ChannelSource;
  transport: string;
}

const openPagesSnapshot = async (client: GitHubClient, transport: Extract<Transport, { kind: 'snapshot' }>, cache: SnapshotCache): Promise<string> => {
  const dir = join(cache.dir, String(transport.artifactId));

  if (existsSync(dir)) {
    return dir;
  }

  const zip = await client.download(`/repos/${client.repository}/actions/artifacts/${transport.artifactId}/zip`);
  const digestProblem = verifyDigest(zip, transport.digest);

  if (digestProblem !== null) {
    throw new Error(`[compose-site] ${digestProblem}`);
  }

  const tar = readZipFile(zip, 'artifact.tar', PAGES_CONTAINER_LIMITS);
  extractTar(tar, dir, PAGES_CONTAINER_LIMITS);

  return dir;
};

/**
 * Fetches the bytes one channel plan names into `dir` and proves they are the
 * planned snapshot. A kept channel tries its transports in order and takes
 * the first that verifies; throws when none does.
 */
export const fetchChannelSnapshot = async (client: GitHubClient, plan: ChannelPlan, dir: string, cache: SnapshotCache): Promise<FetchedChannel> => {
  const downloadCandidate = async (artifactId: number, digest: string, expected: ExpectedChannel): Promise<SiteBuildManifest> => {
    const zip = await client.download(`/repos/${client.repository}/actions/artifacts/${artifactId}/zip`);

    return openChannelArchive(zip, { ...expected, digest, outDir: dir }).manifest;
  };

  if (plan.action === 'absent') {
    throw new Error(`[compose-site] ${plan.channel} is absent from the selection`);
  }

  if (plan.action === 'update') {
    const manifest = await downloadCandidate(plan.source.artifactId, plan.source.digest, {
      channel: plan.channel,
      sourceSha: plan.sourceSha,
    });

    return { dir, manifest, source: plan.source, transport: `candidate ${plan.source.artifactName}` };
  }

  const failures: string[] = [];

  for (const transport of plan.transports) {
    rmSync(dir, { recursive: true, force: true });

    try {
      if (transport.kind === 'snapshot') {
        const snapshot = await openPagesSnapshot(client, transport, cache);
        mkdirSync(dir, { recursive: true });
        extractComposedChannel(snapshot, transport.path, dir);
        const { problems, manifest } = verifyChannelTree(dir, {
          channel: plan.channel,
          sourceSha: plan.published.sourceSha,
          contentHash: plan.published.contentHash,
        });

        if (problems.length > 0 || manifest === null) {
          throw new Error(problems.join('; '));
        }

        return { dir, manifest, source: plan.published.source, transport: `published snapshot of run ${transport.runId}` };
      }

      const exact = transport.kind === 'artifact';
      const manifest = await downloadCandidate(transport.artifactId, transport.digest, {
        channel: plan.channel,
        sourceSha: plan.published.sourceSha,
        ...(exact ? { contentHash: plan.published.contentHash } : {}),
      });
      const source: ChannelSource = exact
        ? plan.published.source
        : {
            kind: 'release',
            workflowId: transport.workflowId,
            runId: transport.runId,
            runAttempt: transport.runAttempt,
            artifactId: transport.artifactId,
            artifactName: transport.artifactName,
            digest: transport.digest,
          };

      return { dir, manifest, source, transport: `${transport.kind} ${transport.artifactName}` };
    } catch (error) {
      failures.push(`${transport.kind} ${transport.artifactId}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`::warning::${plan.channel}: ${failures.at(-1)}`);
    }
  }

  throw new Error(`[compose-site] no trusted source of the published ${plan.channel} snapshot verified:\n  ${failures.join('\n  ')}`);
};

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`[compose-site] missing ${name}`);
  }

  return value;
};

/**
 * CLI for the publisher: reads the selection `select-channels.ts` wrote,
 * fetches and verifies each channel's bytes, composes them into `--out`, and
 * copies `channels.json` to `--channels-out` for the small provenance
 * artifact. Exits non-zero on any problem, so nothing is uploaded.
 */
const main = async (): Promise<void> => {
  const selection = parseSelection(JSON.parse(readFileSync(argument('--selection'), 'utf8')) as unknown);
  const work = resolve(argument('--work'));
  const outDir = argument('--out');
  const channelsOut = argument('--channels-out');

  if (!selection.deploy) {
    throw new Error(`[compose-site] the selection deploys nothing (${selection.reason}); refusing to compose`);
  }

  const client = createGitHubClient(process.env);
  const cache: SnapshotCache = { dir: join(work, 'snapshots') };
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const fetchPlan = async (plan: ChannelPlan): Promise<ComposeInput | null> => {
    if (plan.action === 'absent') {
      return null;
    }

    const snapshot = await fetchChannelSnapshot(client, plan, join(work, plan.channel), cache);
    console.log(`[compose-site] ${plan.channel}: ${plan.action} ${snapshot.manifest.sourceSha} via ${snapshot.transport}`);

    return { dir: snapshot.dir, source: snapshot.source };
  };

  const stable = await fetchPlan(selection.channels.stable);
  const next = await fetchPlan(selection.channels.next);

  if (stable === null) {
    throw new Error('[compose-site] Stable is always published; the selection has none');
  }

  const report = composeSite({ outDir, stable, next });

  if (report.budget.level === 'warn') {
    console.log(`::warning::Composed Pages tree: ${report.budget.message}`);
  }

  if (report.problems.length > 0 || report.channels === null) {
    throw new Error(`[compose-site] the composed tree is refused:\n  ${report.problems.join('\n  ')}`);
  }

  mkdirSync(channelsOut, { recursive: true });
  copyFileSync(join(outDir, CHANNELS_FILE), join(channelsOut, CHANNELS_FILE));
  console.log(`[compose-site] composed ${report.bytes} bytes, pairing ${report.channels.pairing}; ${report.budget.message}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
