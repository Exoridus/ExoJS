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
 */

const REPO_ROOT = resolve(import.meta.dirname!, '../..');
const GATE = 'scripts/verify-bench-results.ts';
const TSX_CLI = join('node_modules', 'tsx', 'dist', 'cli.mjs');

const SLUG = 'test-gpu-linux-chromium';

/** A minimal but structurally complete profile, of the shape `bench:compare --profile` writes. */
const validProfile = (): Record<string, unknown> => ({
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
    provenance: [
      {
        backend: 'webgl2',
        adapter: 'Test Adapter',
        flags: ['--force-device-scale-factor=1'],
        headless: true,
        software: false,
        engineVersion: '0.17.0',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ],
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
    provenance: {
      host: { node: 'v24.14.1', cpu: 'Test CPU', cpuCount: 16, os: 'linux 6.1.0', arch: 'x64' },
      fixedDelta: 0.016666666666666666,
      caveats: ['Measured in one Node process.'],
      engineVersion: '0.17.0',
      timestamp: '2026-01-01T00:00:00.000Z',
    },
    libraries: [{ name: '@codexo/exojs-physics', version: '0.17.0' }],
    section: { title: 'Physics', rows: [] },
  },
});

let directory = '';

/** Write a document into the fixture directory, signing it unless `sign` is false. */
const write = (document: Record<string, unknown>, { sign = true }: { sign?: boolean } = {}): void => {
  const signed = sign ? { ...document, signature: { algorithm: 'sha256', value: computeProfileSignature(document) } } : document;

  writeFileSync(join(directory, `${SLUG}.json`), `${JSON.stringify(signed, null, 2)}\n`);
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

  it('passes a profile the harness signed', () => {
    write(validProfile());

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

  it('rejects a profile missing a provenance field', () => {
    const document = validProfile();
    const rendering = document['rendering'] as { provenance: Array<Record<string, unknown>> };

    delete rendering.provenance[0]!['adapter'];

    write(document);

    expect(check()).toContain('rendering.provenance[0].adapter is missing or empty');
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
    const physics = document['physics'] as { provenance: { engineVersion: string } };

    physics.provenance.engineVersion = '0.16.0';

    write(document);

    expect(check()).toContain('disagree on the engine version');
  });

  it('rejects a profile whose slug does not name its file', () => {
    const document = validProfile();
    const profile = document['profile'] as { slug: string };

    profile.slug = 'other-gpu-linux-chromium';

    write(document);

    expect(check()).toContain('does not match the file name');
  });
});
