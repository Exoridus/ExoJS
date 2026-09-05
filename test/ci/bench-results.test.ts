// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeProfileSignature } from '../../packages/exojs-bench/src/profile/signature';

/**
 * Proves `scripts/verify-bench-results.ts` rejects what it claims to reject.
 *
 * The published benchmark pages are generated from the profile files this gate
 * guards, so the gate is the only thing between a public performance claim and
 * a number somebody typed. A gate that passes everything would be indis-
 * tinguishable from no gate at all right up to the moment it mattered, which is
 * why each defect below is introduced into a real file and run through the real
 * script rather than asserted against the validation logic in isolation.
 *
 * Some of the defects are about evidence rather than integrity: a profile that
 * pools too few runs; a schema version 1 file, which described a single run and
 * therefore a ratio no repetition ever confirmed; a version 2 file, whose
 * stamps named no browser; and a pre-release status that does not say how it
 * was established.
 */

const REPO_ROOT = resolve(import.meta.dirname!, '../..');
const GATE = 'scripts/verify-bench-results.ts';
const TSX_CLI = join('node_modules', 'tsx', 'dist', 'cli.mjs');

const SLUG = 'test-gpu-linux-26-chromium';

/** How many separate runs a published profile has to pool. */
const REQUIRED_RUNS = 3;

const renderingStamp = (run: number) => ({
  backend: 'webgl2',
  adapter: 'Test Adapter',
  browser: 'chromium',
  browserVersion: '151.0.7922.34',
  os: 'linux 6.1.0',
  platformVersion: { major: 26, source: 'declared', evidence: "the runner declared '26'" },
  prerelease: { value: false, source: 'assumed-stable', evidence: 'no pre-release marker, and none declared' },
  flags: ['--force-device-scale-factor=1'],
  headless: true,
  software: false,
  engineVersion: '0.17.0',
  timestamp: `2026-01-0${String(run + 1)}T00:00:00.000Z`,
});

const physicsStamp = (run: number) => ({
  host: {
    node: 'v24.14.1',
    cpu: 'Test CPU',
    cpuCount: 16,
    os: 'linux 6.1.0',
    platformVersion: { major: 26, source: 'declared', evidence: "the runner declared '26'" },
    arch: 'x64',
  },
  prerelease: { value: false, source: 'assumed-stable', evidence: 'no pre-release marker, and none declared' },
  fixedDelta: 0.016666666666666666,
  caveats: ['Measured in one Node process.'],
  engineVersion: '0.17.0',
  timestamp: `2026-01-0${String(run + 1)}T00:00:00.000Z`,
});

/**
 * A minimal but structurally complete profile, of the shape
 * `bench:compare --profile` writes, pooling `runs` separate harness runs.
 */
const validProfile = (runs = REQUIRED_RUNS): Record<string, unknown> => ({
  schemaVersion: 4,
  profile: {
    slug: SLUG,
    gpu: 'test-gpu',
    os: 'linux-26',
    browser: 'chromium',
    platform: { name: 'linux', version: 26, versionSource: 'declared', prerelease: false },
    engineVersion: '0.17.0',
    measuredAt: '2026-01-01T00:00:00.000Z',
    runs,
  },
  rendering: {
    runs: Array.from({ length: runs }, (_, run) => ({ provenance: [renderingStamp(run)] })),
    libraries: [{ name: 'pixi.js', version: '8.19.0' }],
    backends: [
      {
        backend: 'webgl2',
        headlineCount: 1000,
        competitors: ['pixi'],
        sections: [
          {
            title: 'Node scaling',
            rows: [
              {
                archetype: 'static-heavy',
                category: 'Node scaling',
                count: 1000,
                cells: [
                  {
                    competitor: 'pixi',
                    referenceMs: 0.25,
                    competitorMs: 0.5,
                    verdict: { side: 'exojs', ratio: 0.5, factor: 2, label: 'ExoJS leads (2.00x)', structural: false },
                    mechanism: 'fewer draw calls',
                    aggregate: {
                      runs,
                      reference: { minMs: 0.24, maxMs: 0.26, ratio: 0.26 / 0.24 },
                      competitor: { minMs: 0.49, maxMs: 0.51, ratio: 0.51 / 0.49 },
                      stable: true,
                      rungs: Array.from({ length: runs }, () => 'exojs-leads'),
                    },
                  },
                ],
              },
            ],
          },
        ],
        excluded: [],
        webgl1: [],
      },
    ],
  },
  physics: {
    runs: Array.from({ length: runs }, (_, run) => physicsStamp(run)),
    libraries: [{ name: '@codexo/exojs-physics', version: '0.17.0' }],
    section: { title: 'Physics', rows: [] },
  },
});

/** The schema version 1 profile shape, which described a single run and is no longer readable. */
const version1Profile = (): Record<string, unknown> => ({
  schemaVersion: 1,
  profile: {
    slug: SLUG,
    gpu: 'test-gpu',
    os: 'linux',
    browser: 'chromium',
    engineVersion: '0.17.0',
    measuredAt: '2026-01-01T00:00:00.000Z',
  },
  rendering: {
    provenance: [renderingStamp(0)],
    libraries: [{ name: 'pixi.js', version: '8.19.0' }],
    backends: [{ backend: 'webgl2', headlineCount: 1000, competitors: ['pixi'], sections: [], excluded: [], webgl1: [] }],
  },
  physics: {
    provenance: physicsStamp(0),
    libraries: [{ name: '@codexo/exojs-physics', version: '0.17.0' }],
    section: { title: 'Physics', rows: [] },
  },
});

let directory = '';

/** Write a document into the fixture directory, signing it unless `sign` is false. */
const write = (document: Record<string, unknown>, { sign = true, indent = 2 }: { sign?: boolean; indent?: number } = {}): void => {
  const signed = sign ? { ...document, signature: { algorithm: 'sha256', value: computeProfileSignature(document) } } : document;

  writeFileSync(join(directory, `${SLUG}.json`), `${JSON.stringify(signed, null, indent)}\n`);
};

/** Run the gate over the fixture directory; returns its output on failure, or null when it passed. */
const check = (): string | null => {
  try {
    execFileSync('node', [TSX_CLI, GATE, directory], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });

    return null;
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };

    return `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
  }
};

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  directory = '';
});

describe('verify-bench-results', () => {
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'exojs-bench-results-'));
  });

  it('passes an empty results directory - a repository with no published profile is a state, not a defect', () => {
    expect(check()).toBeNull();
  });

  it('passes a profile the harness signed from three separate runs', () => {
    write(validProfile());

    expect(check()).toBeNull();
  });

  it('rejects a profile that pools fewer runs than a published ratio needs', () => {
    write(validProfile(2));

    expect(check()).toContain(`pools 2 run(s), but a published profile needs at least ${String(REQUIRED_RUNS)}`);
  });

  it('rejects a schema version 1 file outright: it described a single run', () => {
    write(version1Profile());

    expect(check()).toContain('which this repository does not understand');
  });

  it('rejects a schema version 2 file outright: its stamps named no browser', () => {
    write({ ...validProfile(), schemaVersion: 2 });

    expect(check()).toContain('which this repository does not understand');
  });

  it('rejects a schema version 3 file outright: its file name carried no platform version', () => {
    write({ ...validProfile(), schemaVersion: 3 });

    expect(check()).toContain('which this repository does not understand');
  });

  it('rejects a stamp that claims a pre-release status without saying how it was established', () => {
    const document = validProfile();
    const rendering = document['rendering'] as { runs: Array<{ provenance: Array<{ prerelease: Record<string, unknown> }> }> };

    rendering.runs[0]!.provenance[0]!.prerelease.source = 'because I said so';

    write(document);

    expect(check()).toContain('rendering.runs[0].provenance[0].prerelease.source');
  });

  it('accepts a stamp whose launch flags are empty, which is what a browser taking no arguments records', () => {
    const document = validProfile();
    const rendering = document['rendering'] as { runs: Array<{ provenance: Array<{ flags: string[]; browser: string }> }> };

    for (const run of rendering.runs) {
      run.provenance[0]!.flags = [];
      run.provenance[0]!.browser = 'webkit';
    }

    write(document);

    expect(check()).toBeNull();
  });

  it('rejects a stamp with no launch-flag list at all, which records nothing about how it was launched', () => {
    const document = validProfile();
    const rendering = document['rendering'] as { runs: Array<{ provenance: Array<Record<string, unknown>> }> };

    delete rendering.runs[2]!.provenance[0]!['flags'];

    write(document);

    expect(check()).toContain('rendering.runs[2].provenance[0].flags is missing');
  });

  it('rejects a run count the domains do not actually carry', () => {
    const document = validProfile();
    const profile = document['profile'] as { runs: number };

    profile.runs = 4;

    write(document);

    expect(check()).toContain('rendering.runs holds 3 run(s) but profile.runs declares 4');
  });

  it('accepts a re-formatted file: the signature covers canonical JSON, so a formatter cannot invalidate it', () => {
    write(validProfile(), { indent: 4 });

    expect(check()).toBeNull();
  });

  it('rejects an edited measurement', () => {
    const document = validProfile();
    const signed: Record<string, unknown> = { ...document, signature: { algorithm: 'sha256', value: computeProfileSignature(document) } };
    const rendering = signed['rendering'] as { backends: Array<{ sections: Array<{ rows: Array<{ cells: Array<{ competitorMs: number }> }> }> }> };

    rendering.backends[0]!.sections[0]!.rows[0]!.cells[0]!.competitorMs = 5;

    write(signed, { sign: false });

    expect(check()).toContain('does not match its harness signature');
  });

  it('rejects a profile missing a provenance field, naming the run it belongs to', () => {
    const document = validProfile();
    const rendering = document['rendering'] as { runs: Array<{ provenance: Array<Record<string, unknown>> }> };

    delete rendering.runs[1]!.provenance[0]!['adapter'];

    write(document);

    expect(check()).toContain('rendering.runs[1].provenance[0].adapter is missing or empty');
  });

  it('rejects an arm that was not installed when the run was measured', () => {
    const document = validProfile();
    const rendering = document['rendering'] as { libraries: Array<{ version: string }> };

    rendering.libraries[0]!.version = 'not-installed';

    write(document);

    expect(check()).toContain('was not installed');
  });

  it('rejects a schema version it does not understand', () => {
    write({ ...validProfile(), schemaVersion: 99 });

    expect(check()).toContain('which this repository does not understand');
  });

  it('rejects stamps that disagree on the engine version', () => {
    const document = validProfile();
    const physics = document['physics'] as { runs: Array<{ engineVersion: string }> };

    physics.runs[2]!.engineVersion = '0.16.0';

    write(document);

    expect(check()).toContain('disagree on the engine version');
  });

  it('rejects a profile whose slug does not name its file', () => {
    const document = validProfile();
    const profile = document['profile'] as { slug: string };

    profile.slug = 'other-gpu-linux-26-chromium';

    write(document);

    expect(check()).toContain('does not match the file name');
  });

  it('rejects a platform version no operating system carries, which would be a typo in the file name', () => {
    const document = validProfile();
    const profile = document['profile'] as { platform: { version: number } };

    profile.platform.version = 260;

    write(document);

    expect(check()).toContain('profile.platform.version is 260, which is not a plausible operating-system major version');
  });

  it('rejects a stamp whose platform version nothing established, which the file name would still claim', () => {
    const document = validProfile();
    const rendering = document['rendering'] as { runs: Array<{ provenance: Array<{ platformVersion: Record<string, unknown> }> }> };

    rendering.runs[1]!.provenance[0]!.platformVersion.source = 'undetermined';

    write(document);

    expect(check()).toContain('rendering.runs[1].provenance[0].platformVersion.source');
  });

  it('rejects a file name that does not spell out the platform the document describes', () => {
    const document = validProfile();
    const profile = document['profile'] as { platform: { prerelease: boolean } };

    profile.platform.prerelease = true;

    write(document);

    expect(check()).toContain(`profile.os 'linux-26' does not spell out profile.platform ('linux-26-beta')`);
  });
});
