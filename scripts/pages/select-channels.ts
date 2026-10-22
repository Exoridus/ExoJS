import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { readZipFile } from './archive-safety.ts';
import { parseCandidateArtifactName } from './channel-artifact.ts';
import { type ChannelEntry, CHANNELS_FILE, type ChannelsDocument, type ChannelSource, parseChannelsDocument } from './channels-document.ts';
import { createGitHubClient, type GitHubClient } from './github-api.ts';
import { SITE_CHANNEL_BRANCH, SITE_CHANNELS, type SiteChannel } from './site-channel.ts';

/**
 * Decides what the Pages publisher deploys, from GitHub's own metadata.
 *
 * The run that triggered the publisher is only a wake-up call. Every start
 * re-decides both channels: each gets the newest qualified candidate on its
 * branch's current history, or keeps the snapshot that is already published.
 * A queued or re-run event can therefore neither roll a channel back nor
 * drop the other channel's update.
 *
 * Dependency-free and erasable TypeScript, run by the publisher with plain
 * `node` from the trusted default-branch checkout.
 */

export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
export const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml';

/** The small artifact a successful publisher run leaves its `channels.json` in. */
export const channelsArtifactName = (runId: number): string => `pages-channels-${runId}`;

export const PAGES_ARTIFACT_NAME = 'github-pages';

const STABLE_RELEASE_TAG = /^v\d+\.\d+\.\d+$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export interface WorkflowRunMeta {
  id: number;
  attempt: number;
  workflowId: number;
  workflowPath: string;
  event: string;
  status: string;
  conclusion: string | null;
  /** Branch, or tag for a tag push. */
  headBranch: string | null;
  headSha: string;
  /** `owner/name` the run belongs to. */
  repository: string;
  /** `owner/name` its commit came from; differs for a fork. */
  headRepository: string | null;
}

export interface ArtifactMeta {
  id: number;
  name: string;
  expired: boolean;
  digest: string | null;
  sizeInBytes: number;
  runId: number;
  runHeadSha: string | null;
}

export interface CandidateRun {
  run: WorkflowRunMeta;
  artifacts: readonly ArtifactMeta[];
}

export interface SelectionPolicy {
  repository: string;
  ciWorkflowId: number;
  releaseWorkflowId: number;
}

export interface PreviousPublication {
  /** The successful publisher run that deployed `channels`. */
  runId: number;
  channels: ChannelsDocument;
  /** That run's Pages artifact, the composed snapshot. */
  pagesArtifact: ArtifactMeta | null;
}

export interface SelectionInput {
  policy: SelectionPolicy;
  trigger: WorkflowRunMeta;
  branchHeads: Record<SiteChannel, string | null>;
  /**
   * Per channel, how many commits its branch head is ahead of a commit, or
   * `null` when the commit is not on the branch's current history. A commit
   * missing from the map counts as not on it.
   */
  history: Record<SiteChannel, Readonly<Record<string, number | null>>>;
  ciRuns: readonly CandidateRun[];
  releaseRuns: readonly CandidateRun[];
  previous: PreviousPublication | null;
}

export type Transport =
  | { kind: 'artifact'; runId: number; artifactId: number; artifactName: string; digest: string }
  | { kind: 'snapshot'; runId: number; artifactId: number; digest: string; path: '' | 'next/' }
  | { kind: 'release'; workflowId: number; runId: number; runAttempt: number; artifactId: number; artifactName: string; digest: string };

export type ChannelPlan =
  | { channel: SiteChannel; action: 'update'; sourceSha: string; source: ChannelSource; reason: string }
  | { channel: SiteChannel; action: 'keep'; published: ChannelEntry; transports: Transport[]; reason: string }
  | { channel: SiteChannel; action: 'absent'; reason: string };

export interface Selection {
  deploy: boolean;
  reason: string;
  /** Reasons nothing may be deployed. */
  problems: string[];
  /** Candidates passed over, for the job log. */
  notes: string[];
  channels: Record<SiteChannel, ChannelPlan>;
}

const sameRepository = (run: WorkflowRunMeta, policy: SelectionPolicy): boolean =>
  run.repository === policy.repository && run.headRepository === policy.repository;

const completedSuccessfully = (run: WorkflowRunMeta): boolean => run.status === 'completed' && run.conclusion === 'success';

const isTrustedCiPush = (run: WorkflowRunMeta, policy: SelectionPolicy): boolean =>
  sameRepository(run, policy) &&
  completedSuccessfully(run) &&
  run.workflowId === policy.ciWorkflowId &&
  run.workflowPath === CI_WORKFLOW_PATH &&
  run.event === 'push' &&
  SITE_CHANNELS.some(channel => SITE_CHANNEL_BRANCH[channel] === run.headBranch);

const isTrustedRelease = (run: WorkflowRunMeta, policy: SelectionPolicy): boolean =>
  sameRepository(run, policy) &&
  completedSuccessfully(run) &&
  run.workflowId === policy.releaseWorkflowId &&
  run.workflowPath === RELEASE_WORKFLOW_PATH &&
  run.event === 'push' &&
  STABLE_RELEASE_TAG.test(run.headBranch ?? '');

interface Qualified {
  kind: 'ci' | 'release';
  run: WorkflowRunMeta;
  artifact: ArtifactMeta;
  attempt: number;
  distance: number;
}

/**
 * The run's own candidate for `channel`, or a reason it has none. A run that
 * carries any site artifact contradicting its own metadata is disqualified.
 */
const candidateOf = (entry: CandidateRun, channel: SiteChannel): { artifact: ArtifactMeta; attempt: number } | { note: string } | null => {
  const { run } = entry;
  let best: { artifact: ArtifactMeta; attempt: number } | null = null;

  for (const artifact of entry.artifacts) {
    const parsed = parseCandidateArtifactName(artifact.name);

    if (parsed === null) {
      continue;
    }

    if (
      parsed.channel !== channel ||
      parsed.sha !== run.headSha ||
      parsed.attempt > run.attempt ||
      artifact.runId !== run.id ||
      (artifact.runHeadSha !== null && artifact.runHeadSha !== run.headSha)
    ) {
      return { note: `run ${run.id} carries ${artifact.name}, which contradicts its ${channel} metadata at ${run.headSha}` };
    }

    if (artifact.expired || artifact.digest === null || !DIGEST.test(artifact.digest)) {
      continue;
    }

    if (best === null || parsed.attempt > best.attempt) {
      best = { artifact, attempt: parsed.attempt };
    }
  }

  return best;
};

const sourceOf = (candidate: Qualified): ChannelSource => ({
  kind: candidate.kind,
  workflowId: candidate.run.workflowId,
  runId: candidate.run.id,
  runAttempt: candidate.run.attempt,
  artifactId: candidate.artifact.id,
  artifactName: candidate.artifact.name,
  digest: candidate.artifact.digest!,
});

const rank = (a: Qualified, b: Qualified): number =>
  a.distance - b.distance || (a.kind === b.kind ? 0 : a.kind === 'ci' ? -1 : 1) || b.attempt - a.attempt || b.run.id - a.run.id;

const qualify = (input: SelectionInput, channel: SiteChannel, notes: string[]): Qualified[] => {
  const qualified: Qualified[] = [];

  const consider = (kind: 'ci' | 'release', entry: CandidateRun): void => {
    const found = candidateOf(entry, channel);

    if (found === null) {
      return;
    }

    if ('note' in found) {
      notes.push(found.note);

      return;
    }

    const distance = input.history[channel][entry.run.headSha];

    if (distance === null || distance === undefined) {
      notes.push(`${channel}: ${found.artifact.name} is not on the current ${SITE_CHANNEL_BRANCH[channel]} history`);

      return;
    }

    qualified.push({ kind, run: entry.run, artifact: found.artifact, attempt: found.attempt, distance });
  };

  for (const entry of input.ciRuns) {
    if (isTrustedCiPush(entry.run, input.policy) && entry.run.headBranch === SITE_CHANNEL_BRANCH[channel]) {
      consider('ci', entry);
    }
  }

  if (channel === 'stable') {
    for (const entry of input.releaseRuns) {
      if (isTrustedRelease(entry.run, input.policy)) {
        consider('release', entry);
      }
    }
  }

  return qualified.sort(rank);
};

const transportsFor = (input: SelectionInput, published: ChannelEntry, qualified: readonly Qualified[]): Transport[] => {
  const transports: Transport[] = [];
  const original = [...input.ciRuns, ...input.releaseRuns]
    .filter(entry => entry.run.id === published.source.runId && sameRepository(entry.run, input.policy))
    .flatMap(entry => entry.artifacts)
    .find(artifact => artifact.id === published.source.artifactId && !artifact.expired && artifact.digest === published.source.digest);

  if (original !== undefined) {
    transports.push({
      kind: 'artifact',
      runId: original.runId,
      artifactId: original.id,
      artifactName: original.name,
      digest: original.digest!,
    });
  }

  const pages = input.previous?.pagesArtifact ?? null;

  if (pages !== null && !pages.expired && pages.digest !== null && DIGEST.test(pages.digest)) {
    transports.push({ kind: 'snapshot', runId: input.previous!.runId, artifactId: pages.id, digest: pages.digest, path: published.path });
  }

  for (const candidate of qualified) {
    if (candidate.kind === 'release' && candidate.run.headSha === published.sourceSha && candidate.artifact.id !== original?.id) {
      const source = sourceOf(candidate);
      transports.push({ ...source, kind: 'release' });
    }
  }

  return transports;
};

const planChannel = (input: SelectionInput, channel: SiteChannel, notes: string[]): ChannelPlan => {
  const qualified = qualify(input, channel, notes);
  const newest = qualified[0] ?? null;
  const published = input.previous?.channels.channels[channel] ?? null;

  if (published === null) {
    if (newest === null) {
      return { channel, action: 'absent', reason: `no qualified ${channel} candidate and none published` };
    }

    return { channel, action: 'update', sourceSha: newest.run.headSha, source: sourceOf(newest), reason: `first ${channel} publication` };
  }

  const publishedDistance = input.history[channel][published.sourceSha];
  const publishedOnHistory = publishedDistance !== null && publishedDistance !== undefined;

  if (newest !== null && (!publishedOnHistory || newest.distance < publishedDistance)) {
    return {
      channel,
      action: 'update',
      sourceSha: newest.run.headSha,
      source: sourceOf(newest),
      reason: publishedOnHistory
        ? `${newest.run.headSha} is ${publishedDistance - newest.distance} commit(s) ahead of the published ${published.sourceSha}`
        : `the published ${published.sourceSha} is no longer on the ${SITE_CHANNEL_BRANCH[channel]} history`,
    };
  }

  return {
    channel,
    action: 'keep',
    published,
    transports: transportsFor(input, published, qualified),
    reason: newest === null ? 'no qualified candidate' : `no candidate newer than the published ${published.sourceSha}`,
  };
};

/** The publisher's decision for both channels; pure, see `SelectionInput`. */
export const selectChannels = (input: SelectionInput): Selection => {
  const notes: string[] = [];
  const trigger = input.trigger;

  if (!isTrustedCiPush(trigger, input.policy) && !isTrustedRelease(trigger, input.policy)) {
    return {
      deploy: false,
      reason: `untrusted trigger: run ${trigger.id} (${trigger.event} on ${String(trigger.headBranch)}, ${String(trigger.conclusion)}) is not a successful same-repository CI push to a channel branch or a stable Release tag`,
      problems: [],
      notes,
      channels: {
        stable: { channel: 'stable', action: 'absent', reason: 'not evaluated' },
        next: { channel: 'next', action: 'absent', reason: 'not evaluated' },
      },
    };
  }

  const problems: string[] = [];

  for (const channel of SITE_CHANNELS) {
    if (input.branchHeads[channel] === null) {
      problems.push(`the ${SITE_CHANNEL_BRANCH[channel]} branch head could not be resolved`);
    }
  }

  const channels = { stable: planChannel(input, 'stable', notes), next: planChannel(input, 'next', notes) };

  if (channels.stable.action === 'absent') {
    problems.push('no qualified stable snapshot exists; Stable is always required');
  }

  const changed = input.previous === null || SITE_CHANNELS.some(channel => channels[channel].action === 'update');

  if (problems.length === 0 && !changed) {
    return { deploy: false, reason: 'unchanged pairing: both channels are already published', problems, notes, channels };
  }

  for (const channel of SITE_CHANNELS) {
    const plan = channels[channel];

    if (plan.action === 'keep' && plan.transports.length === 0) {
      problems.push(`${channel}: no trusted source of the published snapshot ${plan.published.sourceSha} is left`);
    }
  }

  if (problems.length > 0) {
    return { deploy: false, reason: 'refused', problems, notes, channels };
  }

  return { deploy: true, reason: input.previous === null ? 'first publication' : 'channel update', problems, notes, channels };
};

/** Re-reads a selection the same job wrote; throws on anything malformed. */
export const parseSelection = (value: unknown): Selection => {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Selection>;
  const channels = raw.channels as Partial<Record<SiteChannel, ChannelPlan>> | undefined;

  if (typeof raw.deploy !== 'boolean' || typeof raw.reason !== 'string' || channels === undefined) {
    throw new Error('[select-channels] the selection file is malformed');
  }

  for (const channel of SITE_CHANNELS) {
    const plan = channels[channel];

    if (plan === undefined || plan.channel !== channel || !['update', 'keep', 'absent'].includes(plan.action)) {
      throw new Error(`[select-channels] the selection has no valid ${channel} plan`);
    }
  }

  return raw as Selection;
};

interface ApiRun {
  id: number;
  run_attempt: number;
  workflow_id: number;
  path: string;
  event: string;
  status: string;
  conclusion: string | null;
  head_branch: string | null;
  head_sha: string;
  repository: { full_name: string };
  head_repository: { full_name: string } | null;
}

interface ApiArtifact {
  id: number;
  name: string;
  expired: boolean;
  digest?: string | null;
  size_in_bytes: number;
  workflow_run?: { id?: number; head_sha?: string } | null;
}

const toRun = (run: ApiRun): WorkflowRunMeta => ({
  id: run.id,
  attempt: run.run_attempt,
  workflowId: run.workflow_id,
  // A run's `path` may carry an `@ref` suffix for reusable or dynamic workflows.
  workflowPath: run.path.replace(/@.*$/, ''),
  event: run.event,
  status: run.status,
  conclusion: run.conclusion,
  headBranch: run.head_branch,
  headSha: run.head_sha,
  repository: run.repository.full_name,
  headRepository: run.head_repository?.full_name ?? null,
});

const toArtifact = (artifact: ApiArtifact, runId: number): ArtifactMeta => ({
  id: artifact.id,
  name: artifact.name,
  expired: artifact.expired,
  digest: artifact.digest ?? null,
  sizeInBytes: artifact.size_in_bytes,
  runId: artifact.workflow_run?.id ?? runId,
  runHeadSha: artifact.workflow_run?.head_sha ?? null,
});

const listArtifacts = async (client: GitHubClient, runId: number): Promise<ArtifactMeta[]> => {
  const page = await client.getJson<{ artifacts: ApiArtifact[] }>(`/repos/${client.repository}/actions/runs/${runId}/artifacts?per_page=100`);

  return (page?.artifacts ?? []).map(artifact => toArtifact(artifact, runId));
};

const listRuns = async (client: GitHubClient, workflowId: number, query: string): Promise<WorkflowRunMeta[]> => {
  const page = await client.getJson<{ workflow_runs: ApiRun[] }>(`/repos/${client.repository}/actions/workflows/${workflowId}/runs?${query}`);

  return (page?.workflow_runs ?? []).map(toRun);
};

const withArtifacts = async (client: GitHubClient, runs: readonly WorkflowRunMeta[]): Promise<CandidateRun[]> =>
  Promise.all(runs.map(async run => ({ run, artifacts: await listArtifacts(client, run.id) })));

const findPrevious = async (client: GitHubClient, publisherWorkflowId: number, currentRunId: number): Promise<PreviousPublication | null> => {
  for (const run of await listRuns(client, publisherWorkflowId, 'status=success&per_page=30')) {
    if (run.id === currentRunId) {
      continue;
    }

    const artifacts = await listArtifacts(client, run.id);
    const record = artifacts.find(artifact => artifact.name === channelsArtifactName(run.id) && !artifact.expired);

    if (record === undefined) {
      continue;
    }

    const zip = await client.download(`/repos/${client.repository}/actions/artifacts/${record.id}/zip`);
    const channels = parseChannelsDocument(JSON.parse(readZipFile(zip, CHANNELS_FILE, { maxUnpackedBytes: 1_000_000 }).toString('utf8')) as unknown);

    return { runId: run.id, channels, pagesArtifact: artifacts.find(artifact => artifact.name === PAGES_ARTIFACT_NAME) ?? null };
  }

  return null;
};

const distanceTo = async (client: GitHubClient, sha: string, head: string): Promise<number | null> => {
  const comparison = await client.getJson<{ status: string; ahead_by: number }>(`/repos/${client.repository}/compare/${sha}...${head}?per_page=1`, {
    allowMissing: true,
  });

  if (comparison === null) {
    return null;
  }

  if (comparison.status === 'identical') {
    return 0;
  }

  return comparison.status === 'ahead' ? comparison.ahead_by : null;
};

const requireEnv = (name: string): string => {
  const value = process.env[name] ?? '';

  if (value === '') {
    throw new Error(`[select-channels] ${name} is not set`);
  }

  return value;
};

/**
 * CLI for the publisher job: gathers the metadata `selectChannels` needs from
 * the GitHub API, writes the selection to `--out`, and `deploy=true|false`
 * to `$GITHUB_OUTPUT`.
 */
const main = async (): Promise<void> => {
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex === -1 ? undefined : process.argv[outIndex + 1];

  if (out === undefined) {
    throw new Error('[select-channels] usage: select-channels.ts --out <selection.json>');
  }

  const client = createGitHubClient(process.env);
  const repo = `/repos/${client.repository}`;
  const triggerId = Number(requireEnv('TRIGGER_RUN_ID'));
  const currentId = Number(requireEnv('GITHUB_RUN_ID'));
  const ci = await client.getJson<{ id: number }>(`${repo}/actions/workflows/ci.yml`);
  const release = await client.getJson<{ id: number }>(`${repo}/actions/workflows/release.yml`);
  const current = await client.getJson<ApiRun>(`${repo}/actions/runs/${currentId}`);
  const trigger = await client.getJson<ApiRun>(`${repo}/actions/runs/${triggerId}`);

  if (ci === null || release === null || current === null || trigger === null) {
    throw new Error('[select-channels] the workflow metadata is incomplete');
  }

  const policy: SelectionPolicy = { repository: client.repository, ciWorkflowId: ci.id, releaseWorkflowId: release.id };
  const branchHeads = {} as Record<SiteChannel, string | null>;

  for (const channel of SITE_CHANNELS) {
    const branch = await client.getJson<{ commit: { sha: string } }>(`${repo}/branches/${SITE_CHANNEL_BRANCH[channel]}`, {
      allowMissing: true,
    });
    branchHeads[channel] = branch?.commit.sha ?? null;
  }

  const ciRuns: CandidateRun[] = [];

  for (const channel of SITE_CHANNELS) {
    const runs = await listRuns(client, ci.id, `branch=${SITE_CHANNEL_BRANCH[channel]}&event=push&status=success&per_page=25`);
    ciRuns.push(...(await withArtifacts(client, runs)));
  }

  const releaseRuns = await withArtifacts(client, await listRuns(client, release.id, 'event=push&status=success&per_page=10'));
  const previous = await findPrevious(client, current.workflow_id, currentId);
  const history = { stable: {}, next: {} } as Record<SiteChannel, Record<string, number | null>>;

  for (const channel of SITE_CHANNELS) {
    const head = branchHeads[channel];

    if (head === null) {
      continue;
    }

    const shas = new Set<string>([
      ...ciRuns.filter(entry => entry.run.headBranch === SITE_CHANNEL_BRANCH[channel]).map(entry => entry.run.headSha),
      ...(channel === 'stable' ? releaseRuns.map(entry => entry.run.headSha) : []),
      ...(previous?.channels.channels[channel] ? [previous.channels.channels[channel].sourceSha] : []),
    ]);

    for (const sha of shas) {
      history[channel][sha] = /^[0-9a-f]{40}$/.test(sha) ? await distanceTo(client, sha, head) : null;
    }
  }

  const selection = selectChannels({ policy, trigger: toRun(trigger), branchHeads, history, ciRuns, releaseRuns, previous });
  writeFileSync(out, `${JSON.stringify(selection, null, 2)}\n`);

  for (const channel of SITE_CHANNELS) {
    const plan = selection.channels[channel];
    const detail = plan.action === 'update' ? plan.sourceSha : plan.action === 'keep' ? plan.published.sourceSha : '';
    console.log(`[select-channels] ${channel}: ${plan.action} ${detail} (${plan.reason})`);
  }

  for (const note of selection.notes) {
    console.log(`[select-channels] note: ${note}`);
  }

  for (const problem of selection.problems) {
    console.log(`::error::${problem}`);
  }

  console.log(`[select-channels] deploy=${selection.deploy}: ${selection.reason}`);

  if (process.env['GITHUB_OUTPUT']) {
    appendFileSync(process.env['GITHUB_OUTPUT'], `deploy=${selection.deploy}\n`);
  }

  if (selection.problems.length > 0) {
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
