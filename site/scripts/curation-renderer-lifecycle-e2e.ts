import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'http://127.0.0.1:4321/ExoJS' },
    shots: { type: 'string', default: '../docs/curation/evidence/foundation/lifecycle' },
  },
});
const output = resolve(values.shots!);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const records: Array<{ contract: string; status: string; phase?: string | null; error?: string; evidence?: unknown }> = [];

try {
  for (const contract of ['ordinary application error', 'source transition and failure', 'context loss and restoration']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript('globalThis.__name = target => target;');
    let release = (): void => undefined;
    let evidence: unknown;

    try {
      await page.route('**/examples/tweens-animation/frame-animation.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: (await response.text()).replace(
            'const app = new Application({',
            "const app = new Application({ backend: { type: 'webgl2' },",
          ),
        });
      });
      await page.goto(`${values.host}/en/playground/?version=current&example=tweens-animation/frame-animation`);
      const status = page.locator('[data-renderer-phase]');
      await status.locator('visible=true').waitFor();
      await page.waitForFunction(() => document.querySelector('[data-renderer-phase]')?.getAttribute('data-renderer-phase') === 'active');

      if (contract === 'ordinary application error') {
        const frame = page.frames().find(candidate => candidate.url().includes('preview.html'))!;
        await frame.evaluate(() => {
          setTimeout(() => {
            throw new Error('Application logic probe');
          }, 0);
        });
        await page.waitForTimeout(500);
        assert.equal(await status.getAttribute('data-renderer-phase'), 'active');
      } else if (contract === 'source transition and failure') {
        const gate = new Promise<void>(resolveGate => {
          release = resolveGate;
        });
        await page.route('**/examples/text-fonts/typographic-styling.*', async route => {
          await gate;
          await route.abort('failed');
        });
        await page.locator('a[href="#/current/text-fonts/typographic-styling"]').click();
        await page.waitForTimeout(500);
        assert.equal(await status.getAttribute('data-renderer-phase'), 'unreported');
        release();
        await page.getByText('Failed to load example source', { exact: true }).waitFor();
        assert.equal(await status.getAttribute('data-renderer-phase'), 'unreported');
      } else {
        const frame = page.frames().find(candidate => candidate.url().includes('preview.html'))!;
        const events = await frame.evaluate(
          () =>
            new Promise<Array<{ phase: string; actual: string | null; nativeLost: boolean }>>((resolveEvents, reject) => {
              const context = document.querySelector('canvas')!.getContext('webgl2')!;
              const events: Array<{ phase: string; actual: string | null; nativeLost: boolean }> = [];

              const report = (event: Event): void => {
                const state = (event as CustomEvent<{ phase: string; actual: string | null }>).detail;
                events.push({ phase: state.phase, actual: state.actual, nativeLost: context.isContextLost() });

                if (state.phase === 'active' && events.some(entry => entry.phase === 'failed')) {
                  clearTimeout(timer);
                  window.removeEventListener('exo-renderer-status', report);
                  resolveEvents(events);
                }
              };

              const timer = setTimeout(() => {
                window.removeEventListener('exo-renderer-status', report);
                reject(new Error('Native WebGL2 context did not recover'));
              }, 10000);
              window.addEventListener('exo-renderer-status', report);
              context.getExtension('WEBGL_lose_context')!.loseContext();
            }),
        );
        evidence = events;
        assert(events.some(event => event.phase === 'failed' && event.actual === null && event.nativeLost));
        assert.deepEqual(events.at(-1), { phase: 'active', actual: 'webgl2', nativeLost: false });
        await page.waitForFunction(() => document.querySelector('[data-renderer-phase]')?.getAttribute('data-renderer-phase') === 'active');
      }

      await page.screenshot({ path: resolve(output, `${contract.replaceAll(' ', '-')}.png`) });
      records.push({ contract, status: 'PASS', phase: await status.getAttribute('data-renderer-phase'), evidence });
    } catch (error) {
      records.push({
        contract,
        status: 'FAIL',
        phase: await page
          .locator('[data-renderer-phase]')
          .getAttribute('data-renderer-phase')
          .catch(() => null),
        error: String(error),
      });
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
      await page.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, 'results.json'), `${JSON.stringify({ browser: browser.version(), records }, null, 2)}\n`);
}

console.log(JSON.stringify(records));
assert(records.every(record => record.status === 'PASS'));
