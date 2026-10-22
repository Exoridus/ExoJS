import { describe, expect, it } from 'vitest';

import type { ChannelEntry, ChannelsDocument } from '../../scripts/pages/compose-site';
import { type ArtifactMeta, type CandidateRun, selectChannels, type SelectionInput, type WorkflowRunMeta } from '../../scripts/pages/select-channels';

/**
 * The publisher re-decides both channels every time it starts. The trigger
 * only wakes it up: what is deployed is the newest qualified snapshot of each
 * channel on its branch's current history, or the snapshot that is already
 * live, never something older and never something untrusted.
 */

const REPO = 'Exoridus/ExoJS';
const CI_ID = 11;
const RELEASE_ID = 22;
const sha = (seed: string): string => seed.repeat(40).slice(0, 40);

let nextId = 1000;

const run = (overrides: Partial<WorkflowRunMeta> = {}): WorkflowRunMeta => ({
  id: nextId++,
  attempt: 1,
  workflowId: CI_ID,
  workflowPath: '.github/workflows/ci.yml',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  headBranch: 'next',
  headSha: sha('1'),
  repository: REPO,
  headRepository: REPO,
  ...overrides,
});

const artifact = (owner: WorkflowRunMeta, overrides: Partial<ArtifactMeta> = {}): ArtifactMeta => ({
  id: owner.id * 10,
  name: `site-${owner.headBranch === 'main' || owner.workflowId === RELEASE_ID ? 'stable' : 'next'}-${owner.headSha}-${owner.attempt}`,
  expired: false,
  digest: `sha256:${'d'.repeat(64)}`,
  sizeInBytes: 1000,
  runId: owner.id,
  runHeadSha: owner.headSha,
  ...overrides,
});

const candidate = (overrides: Partial<WorkflowRunMeta> = {}, artifactOverrides?: Partial<ArtifactMeta> | null): CandidateRun => {
  const owner = run(overrides);

  return { run: owner, artifacts: artifactOverrides === null ? [] : [artifact(owner, artifactOverrides)] };
};

const entryFor = (source: CandidateRun, channel: 'stable' | 'next'): ChannelEntry => {
  const art = source.artifacts[0]!;

  return {
    channel,
    path: channel === 'stable' ? '' : 'next/',
    basePath: channel === 'stable' ? '/ExoJS/' : '/ExoJS/next/',
    sourceSha: source.run.headSha,
    packageVersion: '0.19.1',
    assetProfile: 'standard',
    createdAt: '2026-10-20T10:00:00.000Z',
    contentHash: `${channel === 'stable' ? 'a' : 'b'}${source.run.headSha.slice(0, 1)}`.repeat(32),
    fileCount: 10,
    totalBytes: 1000,
    source: {
      kind: source.run.workflowId === RELEASE_ID ? 'release' : 'ci',
      workflowId: source.run.workflowId,
      runId: source.run.id,
      runAttempt: source.run.attempt,
      artifactId: art.id,
      artifactName: art.name,
      digest: art.digest!,
    },
  };
};

const doc = (stable: ChannelEntry, next: ChannelEntry | null): ChannelsDocument => ({
  schemaVersion: 1,
  pairing: 'p'.repeat(64),
  channels: { stable, next },
});

const PAGES_ARTIFACT: ArtifactMeta = {
  id: 9_999,
  name: 'github-pages',
  expired: false,
  digest: `sha256:${'e'.repeat(64)}`,
  sizeInBytes: 1000,
  runId: 900,
  runHeadSha: null,
};

/** A history in which `shas` sit on the branch, newest first. */
const history = (...shas: string[]): Record<string, number | null> => Object.fromEntries(shas.map((value, index) => [value, index]));

const base = (overrides: Partial<SelectionInput> = {}): SelectionInput => ({
  policy: { repository: REPO, ciWorkflowId: CI_ID, releaseWorkflowId: RELEASE_ID },
  trigger: run(),
  branchHeads: { stable: sha('a'), next: sha('1') },
  history: { stable: history(sha('a')), next: history(sha('1')) },
  ciRuns: [],
  releaseRuns: [],
  previous: null,
  ...overrides,
});

describe('bootstrap (W10)', () => {
  it('publishes Stable alone while Next has never qualified', () => {
    const stable = candidate({ headBranch: 'main', headSha: sha('a') });
    const result = selectChannels(base({ trigger: stable.run, ciRuns: [stable] }));
    expect(result.deploy).toBe(true);
    expect(result.channels.stable).toMatchObject({ action: 'update', sourceSha: sha('a') });
    expect(result.channels.next).toMatchObject({ action: 'absent' });
  });

  it('refuses to deploy without any qualified Stable snapshot', () => {
    const next = candidate({ headBranch: 'next', headSha: sha('1') });
    const result = selectChannels(base({ trigger: next.run, ciRuns: [next] }));
    expect(result.deploy).toBe(false);
    expect(result.problems.join('\n')).toMatch(/stable/i);
  });
});

describe('one channel moves (W03/W04)', () => {
  const stableRun = candidate({ headBranch: 'main', headSha: sha('a') });
  const oldNext = candidate({ headBranch: 'next', headSha: sha('1') });
  const previous = { runId: 900, channels: doc(entryFor(stableRun, 'stable'), entryFor(oldNext, 'next')), pagesArtifact: PAGES_ARTIFACT };

  it('updates only Next when only Next produced a newer candidate', () => {
    const newNext = candidate({ headBranch: 'next', headSha: sha('2') });
    const result = selectChannels(
      base({
        trigger: newNext.run,
        ciRuns: [newNext, oldNext, stableRun],
        branchHeads: { stable: sha('a'), next: sha('2') },
        history: { stable: history(sha('a')), next: history(sha('2'), sha('1')) },
        previous,
      }),
    );
    expect(result.deploy).toBe(true);
    expect(result.channels.next).toMatchObject({ action: 'update', sourceSha: sha('2') });
    expect(result.channels.stable).toMatchObject({ action: 'keep' });
  });

  it('updates only Stable when only main produced a newer candidate', () => {
    const newStable = candidate({ headBranch: 'main', headSha: sha('b') });
    const result = selectChannels(
      base({
        trigger: newStable.run,
        ciRuns: [newStable, stableRun, oldNext],
        branchHeads: { stable: sha('b'), next: sha('1') },
        history: { stable: history(sha('b'), sha('a')), next: history(sha('1')) },
        previous,
      }),
    );
    expect(result.channels.stable).toMatchObject({ action: 'update', sourceSha: sha('b') });
    expect(result.channels.next).toMatchObject({ action: 'keep' });
  });

  it('keeps a channel from its original artifact first, then from the last published snapshot', () => {
    const newNext = candidate({ headBranch: 'next', headSha: sha('2') });
    const input = base({
      trigger: newNext.run,
      ciRuns: [newNext, stableRun],
      branchHeads: { stable: sha('a'), next: sha('2') },
      history: { stable: history(sha('a')), next: history(sha('2'), sha('1')) },
      previous,
    });
    const keep = selectChannels(input).channels.stable;
    expect(keep.action).toBe('keep');
    expect(keep.action === 'keep' && keep.transports.map(transport => transport.kind)).toEqual(['artifact', 'snapshot']);
  });
});

describe('a green run without a site candidate (W05)', () => {
  it('changes nothing and claims no new SHA', () => {
    const stableRun = candidate({ headBranch: 'main', headSha: sha('a') });
    const nextRun = candidate({ headBranch: 'next', headSha: sha('1') });
    const bare = candidate({ headBranch: 'next', headSha: sha('2') }, null);
    const result = selectChannels(
      base({
        trigger: bare.run,
        ciRuns: [bare, nextRun, stableRun],
        branchHeads: { stable: sha('a'), next: sha('2') },
        history: { stable: history(sha('a')), next: history(sha('2'), sha('1')) },
        previous: { runId: 900, channels: doc(entryFor(stableRun, 'stable'), entryFor(nextRun, 'next')), pagesArtifact: PAGES_ARTIFACT },
      }),
    );
    expect(result.deploy).toBe(false);
    expect(result.reason).toMatch(/unchanged/);
    expect(result.channels.next).toMatchObject({ action: 'keep', published: { sourceSha: sha('1') } });
  });
});

describe('untrusted runs (W06)', () => {
  const stable = candidate({ headBranch: 'main', headSha: sha('a') });

  it.each<[string, Partial<WorkflowRunMeta>]>([
    ['a pull request', { event: 'pull_request' }],
    ['a manual dispatch', { event: 'workflow_dispatch' }],
    ['a fork', { headRepository: 'mallory/ExoJS' }],
    ['another repository', { repository: 'mallory/ExoJS' }],
    ['a failed run', { conclusion: 'failure' }],
    ['a cancelled run', { conclusion: 'cancelled' }],
    ['an unlisted workflow', { workflowId: 33, workflowPath: '.github/workflows/other.yml' }],
    ['a feature branch', { headBranch: 'feature/x' }],
  ])('deploys nothing when triggered by %s', (_label, overrides) => {
    const result = selectChannels(base({ trigger: run({ headBranch: 'main', headSha: sha('a'), ...overrides }), ciRuns: [stable] }));
    expect(result.deploy).toBe(false);
    expect(result.reason).toMatch(/trigger/);
  });

  it.each<[string, Partial<WorkflowRunMeta>]>([
    ['a pull request', { event: 'pull_request' }],
    ['a dispatch', { event: 'workflow_dispatch' }],
    ['a fork', { headRepository: 'mallory/ExoJS' }],
    ['a failed run', { conclusion: 'failure' }],
    ['a still running run', { status: 'in_progress', conclusion: null }],
  ])('never selects a candidate from %s', (_label, overrides) => {
    const trusted = candidate({ headBranch: 'main', headSha: sha('a') });
    const hostile = candidate({ headBranch: 'main', headSha: sha('b'), ...overrides });
    const result = selectChannels(
      base({
        trigger: trusted.run,
        ciRuns: [hostile, trusted],
        branchHeads: { stable: sha('b'), next: sha('1') },
        history: { stable: history(sha('b'), sha('a')), next: history(sha('1')) },
      }),
    );
    expect(result.channels.stable).toMatchObject({ action: 'update', sourceSha: sha('a') });
  });

  it('accepts a Release run only for a version tag push on main history', () => {
    const release = candidate({
      workflowId: RELEASE_ID,
      workflowPath: '.github/workflows/release.yml',
      headBranch: 'v0.19.2',
      headSha: sha('b'),
    });
    const dispatched = candidate({
      workflowId: RELEASE_ID,
      workflowPath: '.github/workflows/release.yml',
      event: 'workflow_dispatch',
      headBranch: 'main',
      headSha: sha('c'),
    });
    const input = base({
      trigger: release.run,
      releaseRuns: [dispatched, release],
      branchHeads: { stable: sha('c'), next: sha('1') },
      history: { stable: history(sha('c'), sha('b')), next: history(sha('1')) },
    });
    expect(selectChannels(input).channels.stable).toMatchObject({ action: 'update', sourceSha: sha('b'), source: { kind: 'release' } });
    expect(selectChannels({ ...input, trigger: dispatched.run }).deploy).toBe(false);
  });
});

describe('contradictory metadata (W07)', () => {
  it.each<[string, Partial<ArtifactMeta>]>([
    ['another commit in the name', { name: `site-stable-${sha('f')}-1` }],
    ['the other channel in the name', { name: `site-next-${sha('a')}-1` }],
    ['a later attempt than the run has', { name: `site-stable-${sha('a')}-2` }],
    ['another run', { runId: 1 }],
    ['another head SHA', { runHeadSha: sha('f') }],
    ['no digest', { digest: null }],
    ['a malformed digest', { digest: 'md5:abc' }],
    ['an expired artifact', { expired: true }],
  ])('refuses an artifact with %s', (_label, overrides) => {
    const stable = candidate({ headBranch: 'main', headSha: sha('a') }, overrides);
    const result = selectChannels(base({ trigger: stable.run, ciRuns: [stable] }));
    expect(result.channels.stable.action).not.toBe('update');
    expect(result.deploy).toBe(false);
  });

  it('refuses a candidate whose commit is not on the branch history', () => {
    const stable = candidate({ headBranch: 'main', headSha: sha('a') });
    const result = selectChannels(base({ trigger: stable.run, ciRuns: [stable], history: { stable: { [sha('a')]: null }, next: {} } }));
    expect(result.deploy).toBe(false);
  });

  it('accepts an earlier attempt of a re-run whose site job was not repeated', () => {
    const stable = candidate({ headBranch: 'main', headSha: sha('a'), attempt: 2 }, { name: `site-stable-${sha('a')}-1` });
    expect(selectChannels(base({ trigger: stable.run, ciRuns: [stable] })).channels.stable).toMatchObject({ action: 'update' });
  });
});

describe('expired artifacts (W08)', () => {
  const stableRun = candidate({ headBranch: 'main', headSha: sha('a') });
  const nextRun = candidate({ headBranch: 'next', headSha: sha('1') });
  const published = doc(entryFor(stableRun, 'stable'), entryFor(nextRun, 'next'));

  it('keeps an unchanged channel from the last published snapshot when its candidate expired', () => {
    const newNext = candidate({ headBranch: 'next', headSha: sha('2') });
    const expiredStable = { run: stableRun.run, artifacts: [{ ...stableRun.artifacts[0]!, expired: true }] };
    const result = selectChannels(
      base({
        trigger: newNext.run,
        ciRuns: [newNext, nextRun, expiredStable],
        branchHeads: { stable: sha('a'), next: sha('2') },
        history: { stable: history(sha('a')), next: history(sha('2'), sha('1')) },
        previous: { runId: 900, channels: published, pagesArtifact: PAGES_ARTIFACT },
      }),
    );
    expect(result.deploy).toBe(true);
    expect(result.channels.stable.action === 'keep' && result.channels.stable.transports).toEqual([
      { kind: 'snapshot', runId: 900, artifactId: PAGES_ARTIFACT.id, digest: PAGES_ARTIFACT.digest, path: '' },
    ]);
  });

  it('falls back to the Release artifact of the same commit for Stable', () => {
    const release = candidate({
      workflowId: RELEASE_ID,
      workflowPath: '.github/workflows/release.yml',
      headBranch: 'v0.19.1',
      headSha: sha('a'),
    });
    const newNext = candidate({ headBranch: 'next', headSha: sha('2') });
    const result = selectChannels(
      base({
        trigger: newNext.run,
        ciRuns: [newNext, nextRun],
        releaseRuns: [release],
        branchHeads: { stable: sha('a'), next: sha('2') },
        history: { stable: history(sha('a')), next: history(sha('2'), sha('1')) },
        previous: { runId: 900, channels: published, pagesArtifact: { ...PAGES_ARTIFACT, expired: true } },
      }),
    );
    expect(result.channels.stable.action === 'keep' && result.channels.stable.transports.map(transport => transport.kind)).toEqual(['release']);
  });

  it('deploys nothing when no trusted source of a kept channel is left', () => {
    const newNext = candidate({ headBranch: 'next', headSha: sha('2') });
    const result = selectChannels(
      base({
        trigger: newNext.run,
        ciRuns: [newNext],
        branchHeads: { stable: sha('a'), next: sha('2') },
        history: { stable: history(sha('a')), next: history(sha('2'), sha('1')) },
        previous: { runId: 900, channels: published, pagesArtifact: null },
      }),
    );
    expect(result.deploy).toBe(false);
    expect(result.problems.join('\n')).toMatch(/stable/i);
  });
});

describe('ordering (W09)', () => {
  const stableRun = candidate({ headBranch: 'main', headSha: sha('a') });

  it('picks the commit nearest the branch head, not the run that finished last', () => {
    const newer = candidate({ headBranch: 'next', headSha: sha('3') });
    const olderRerun = candidate({ headBranch: 'next', headSha: sha('2'), attempt: 2 }, { name: `site-next-${sha('2')}-2` });
    const result = selectChannels(
      base({
        trigger: olderRerun.run,
        ciRuns: [olderRerun, newer, stableRun],
        branchHeads: { stable: sha('a'), next: sha('3') },
        history: { stable: history(sha('a')), next: history(sha('3'), sha('2')) },
      }),
    );
    expect(result.channels.next).toMatchObject({ action: 'update', sourceSha: sha('3') });
  });

  it('never rolls a published channel back to an older candidate', () => {
    const published = candidate({ headBranch: 'next', headSha: sha('3') });
    const oldRerun = candidate({ headBranch: 'next', headSha: sha('2'), attempt: 3 }, { name: `site-next-${sha('2')}-3` });
    const result = selectChannels(
      base({
        trigger: oldRerun.run,
        ciRuns: [oldRerun, stableRun],
        branchHeads: { stable: sha('a'), next: sha('4') },
        history: { stable: history(sha('a')), next: history(sha('4'), sha('3'), sha('2')) },
        previous: { runId: 900, channels: doc(entryFor(stableRun, 'stable'), entryFor(published, 'next')), pagesArtifact: PAGES_ARTIFACT },
      }),
    );
    expect(result.channels.next).toMatchObject({ action: 'keep', published: { sourceSha: sha('3') } });
    expect(result.deploy).toBe(false);
  });

  it('picks up both channels when main and next finished in either order', () => {
    const newStable = candidate({ headBranch: 'main', headSha: sha('b') });
    const newNext = candidate({ headBranch: 'next', headSha: sha('2') });
    const oldNext = candidate({ headBranch: 'next', headSha: sha('1') });
    const input = base({
      ciRuns: [newNext, newStable, oldNext, stableRun],
      branchHeads: { stable: sha('b'), next: sha('2') },
      history: { stable: history(sha('b'), sha('a')), next: history(sha('2'), sha('1')) },
      previous: { runId: 900, channels: doc(entryFor(stableRun, 'stable'), entryFor(oldNext, 'next')), pagesArtifact: PAGES_ARTIFACT },
    });

    for (const trigger of [newStable.run, newNext.run]) {
      const result = selectChannels({ ...input, trigger });
      expect(result.channels.stable).toMatchObject({ action: 'update', sourceSha: sha('b') });
      expect(result.channels.next).toMatchObject({ action: 'update', sourceSha: sha('2') });
    }
  });

  it('replaces a published snapshot that left the branch history with the current one', () => {
    const rewritten = candidate({ headBranch: 'next', headSha: sha('5') });
    const orphan = candidate({ headBranch: 'next', headSha: sha('4') });
    const result = selectChannels(
      base({
        trigger: rewritten.run,
        ciRuns: [rewritten, stableRun],
        branchHeads: { stable: sha('a'), next: sha('5') },
        history: { stable: history(sha('a')), next: { [sha('5')]: 0, [sha('4')]: null } },
        previous: { runId: 900, channels: doc(entryFor(stableRun, 'stable'), entryFor(orphan, 'next')), pagesArtifact: PAGES_ARTIFACT },
      }),
    );
    expect(result.channels.next).toMatchObject({ action: 'update', sourceSha: sha('5') });
  });
});

describe('Next after its first publication', () => {
  it('stays published when its newest candidate failed', () => {
    const stableRun = candidate({ headBranch: 'main', headSha: sha('a') });
    const goodNext = candidate({ headBranch: 'next', headSha: sha('1') });
    const failed = candidate({ headBranch: 'next', headSha: sha('2'), conclusion: 'failure' });
    const result = selectChannels(
      base({
        trigger: stableRun.run,
        ciRuns: [failed, goodNext, stableRun],
        branchHeads: { stable: sha('a'), next: sha('2') },
        history: { stable: history(sha('a')), next: history(sha('2'), sha('1')) },
        previous: { runId: 900, channels: doc(entryFor(stableRun, 'stable'), entryFor(goodNext, 'next')), pagesArtifact: PAGES_ARTIFACT },
      }),
    );
    expect(result.channels.next).toMatchObject({ action: 'keep', published: { sourceSha: sha('1') } });
  });
});
