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
const records: Array<{ contract: string; status: string; phase?: string | null; error?: string }> = [];

try {
  for (const contract of ['ordinary application error', 'source transition and failure']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let release = (): void => undefined;

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
      } else {
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
      }

      await page.screenshot({ path: resolve(output, `${contract.replaceAll(' ', '-')}.png`) });
      records.push({ contract, status: 'PASS', phase: await status.getAttribute('data-renderer-phase') });
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
