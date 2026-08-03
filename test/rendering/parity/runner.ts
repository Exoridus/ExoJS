/**
 * Walks the scene × property cross product and emits one test per applicable
 * combination, recording what each one actually proved.
 *
 * The evidence rows are the point: a passing test proves something, and the
 * matrix is the record of *which* something. A combination that never runs
 * leaves a row saying so, which is how the matrix can show absence of
 * verification — the thing a suite of green tests structurally cannot.
 */

import { afterAll, describe, expect, test } from 'vitest';
import { commands } from 'vitest/browser';

import type { EvidenceRow } from './evidenceSink';
import { cappedEvidence, type Property, type Scene } from './types';

interface ParityCommands {
  writeParityEvidence: (rows: readonly EvidenceRow[]) => Promise<number>;
}

const sink = commands as unknown as ParityCommands;

/** Which engine the run is executing in; the matrix is per browser, not just per backend. */
export const currentBrowser = (): string => {
  const ua = navigator.userAgent;

  if (ua.includes('Firefox/')) return 'firefox';
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('Chrome/') || ua.includes('Chromium/')) return 'chromium';
  if (ua.includes('Safari/')) return 'webkit';

  return 'unknown';
};

const BACKENDS = ['webgl2', 'webgpu'] as const;

/**
 * Registers the tests for one catalog.
 *
 * Call at module top level from a spec file — the `describe`/`test` calls have
 * to happen during collection, so scenes and properties must be known
 * statically rather than discovered mid-run.
 */
export const runParityMatrix = (scenes: readonly Scene[], properties: readonly Property[]): void => {
  const browser = currentBrowser();
  const rows: EvidenceRow[] = [];

  const record = (scene: Scene, property: Property, backend: 'webgl2' | 'webgpu', result: Awaited<ReturnType<Property['run']>>): void => {
    rows.push({
      scene: scene.name,
      property: property.name,
      feature: scene.feature,
      browser,
      backend,
      support: result.support,
      evidence: cappedEvidence(scene, result.evidence),
      delta: result.delta,
      ...(result.note === undefined ? {} : { note: result.note }),
    });
  };

  for (const scene of scenes) {
    describe(scene.name, () => {
      for (const property of properties) {
        if (!property.appliesTo(scene)) {
          // Not applicable is still information: it is why the matrix cell is
          // empty, as opposed to the check having failed or been skipped.
          for (const backend of BACKENDS) {
            rows.push({
              scene: scene.name,
              property: property.name,
              feature: scene.feature,
              browser,
              backend,
              support: 'unknown',
              evidence: 'none',
              delta: null,
              note: 'property does not apply to this scene',
            });
          }

          continue;
        }

        if (property.scope === 'cross-backend') {
          test(`${property.name}`, async ctx => {
            // Runtime skip for a lost device, not a disabled test.
            // eslint-disable-next-line vitest/no-disabled-tests
            const result = await property.run({ scene, skip: reason => ctx.skip(reason) });

            for (const backend of BACKENDS) record(scene, property, backend, result);

            if (result.support === 'divergent') expect.fail(result.note ?? `${scene.name} diverges between backends`);
          });

          continue;
        }

        for (const backend of BACKENDS) {
          test(`${property.name} [${backend}]`, async ctx => {
            // Runtime skip for a lost device, not a disabled test.
            // eslint-disable-next-line vitest/no-disabled-tests
            const result = await property.run({ scene, skip: reason => ctx.skip(reason) }, backend);

            record(scene, property, backend, result);

            if (result.support === 'divergent') expect.fail(result.note ?? `${property.name} fails for ${scene.name} on ${backend}`);
          });
        }
      }
    });
  }

  afterAll(async () => {
    if (rows.length > 0) await sink.writeParityEvidence(rows);
  });
};
