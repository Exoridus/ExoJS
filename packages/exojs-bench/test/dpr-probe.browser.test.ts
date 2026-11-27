// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Browser, chromium } from 'playwright';
import { expect, test } from 'vitest';

import type { ProbeResult } from '../src/rendering/dpr-probe/matrix';
import { PROBE_SCHEMA_VERSION } from '../src/rendering/dpr-probe/matrix';
import { submitPlugin } from '../src/rendering/dpr-probe/submit';
import { readEngineVersion, startViteServer } from '../src/shared/viteServer';

test('measures a DPR cell in Chromium and submits the collected capture as valid JSON', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-dpr-browser-'));
  const engineVersion = readEngineVersion();
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  const gitSha = `${revision}${dirty ? '-dirty' : ''}`;
  const server = await startViteServer({
    pageDir: fileURLToPath(new URL('../src/rendering/dpr-probe/page', import.meta.url)),
    version: engineVersion,
    libraryArms: [],
    extraDefine: { __PROBE_META__: JSON.stringify({ gitSha, engineVersion }) },
    extraPlugins: [submitPlugin({ captureDir: directory, repoRoot: directory, scheme: 'http', allowedHostnames: ['127.0.0.1'] })],
  });
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`${server.resolvedUrls!.local[0]!}?backend=webgl2`);
    await page.waitForFunction(() => globalThis.__dprProbe?.buildResult().backendSelected === 'webgl2');
    await page.locator('#device-label').fill('Chromium DPR smoke');
    await page.locator('#tester-note').fill('Software rendering correctness smoke; no timing claims.');

    const measured = await page.evaluate(async () => {
      const probe = globalThis.__dprProbe!;
      const host = document.createElement('div');
      document.body.append(host);

      try {
        const result = await probe.runProbeCell({
          cell: { scene: 'color-filter', mode: 'inherit', pixelRatio: 2 },
          backend: 'webgl2',
          stage: { width: 360, height: 360 },
          host,
          runId: 0,
          index: 0,
          runStartedAt: performance.now(),
          measureMs: 1,
        });

        probe.collected.push(result);

        return probe.buildResult();
      } finally {
        host.remove();
      }
    });

    expect(measured).toMatchObject({
      schemaVersion: PROBE_SCHEMA_VERSION,
      gitSha,
      engineVersion,
      deviceLabel: 'Chromium DPR smoke',
      devicePixelRatio: 2,
      engineAutoPixelRatio: 2,
      backendRequested: 'webgl2',
      backendSelected: 'webgl2',
      crossOriginIsolated: true,
      stagePreset: 'fixed',
      stageWidth: 360,
      stageHeight: 360,
    });
    expect(measured.cells).toHaveLength(1);

    const cell = measured.cells[0]!;

    expect(cell).toMatchObject({
      runId: 0,
      index: 0,
      scene: 'color-filter',
      mode: 'inherit',
      configuredPixelRatio: 2,
      enginePixelRatio: 2,
      cssWidth: 360,
      cssHeight: 360,
      backingWidth: 720,
      backingHeight: 720,
      mainPixelCount: 518_400,
    });
    expect(Number.isInteger(cell.measuredFrames)).toBe(true);
    expect(cell.measuredFrames).toBeGreaterThan(0);
    expect(cell.measuredMs).toBeGreaterThan(0);

    for (const value of [cell.startOffsetMs, cell.measuredMs, cell.cpuMsMedian, cell.cpuMsP95]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }

    for (const value of [cell.rafDeltaMsMedian, cell.rafDeltaMsP95]) {
      if (cell.measuredFrames > 1) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      } else {
        expect(value).toBeNull();
      }
    }

    expect(cell.internalTargets.length).toBeGreaterThan(0);

    for (const target of cell.internalTargets) {
      for (const value of [target.width, target.height, target.count]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }

    expect(Number.isFinite(cell.internalToMainPixelRatio)).toBe(true);
    expect(cell.internalToMainPixelRatio).toBeGreaterThan(0);

    // Optional hardware queries may be unavailable or unresolved on SwiftShader.
    // Accept only documented dropped-sample caveats; scene errors still fail.
    let droppedGpuFrames = 0;

    for (const caveat of cell.errors.flatMap(error => error.split('; '))) {
      const match = /^([1-9]\d*) (?:disjoint GPU frame\(s\) discarded|GPU frame\(s\) unresolved)$/.exec(caveat);

      expect(match, `Unexpected probe error: ${caveat}`).not.toBeNull();
      droppedGpuFrames += Number(match![1]);
    }

    expect(droppedGpuFrames).toBeLessThanOrEqual(cell.measuredFrames);
    expect(cell.gpuMsMedian === null).toBe(cell.gpuMsP95 === null);

    for (const value of [cell.gpuMsMedian, cell.gpuMsP95]) {
      if (droppedGpuFrames === cell.measuredFrames) {
        expect(value).toBeNull();
      } else if (value !== null) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }

    const responsePromise = page.waitForResponse(response => response.url().endsWith('/submit'));
    await page.locator('#submit-json').click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const { path } = (await response.json()) as { path: string };
    const saved = JSON.parse(readFileSync(join(directory, path), 'utf8')) as ProbeResult;
    const serialized = JSON.parse(await page.locator('#json-output').inputValue()) as ProbeResult;

    expect(saved).toEqual(serialized);
    expect(saved.cells).toEqual(measured.cells);
    expect(saved.cells[0]!.errors).toEqual(cell.errors);
    expect(saved.backendSelected).toBe('webgl2');
    expect(saved.gitSha).toBe(gitSha);
    expect(Number.isNaN(Date.parse(saved.timestamp))).toBe(false);
    expect(saved.notes.length).toBeGreaterThan(0);
  } finally {
    await browser?.close();
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);
