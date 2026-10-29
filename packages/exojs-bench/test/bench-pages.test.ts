import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * Guards on the benchmark pages that only a browser can exercise. These assert
 * the markup and the page module state the browser probe depends on; the
 * browser-side behaviour itself is measured by the harness, not here.
 */
const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(PACKAGE, path), 'utf8');

describe('rendering harness page', () => {
  test('starts the stage at the capture origin, with no UA body margin', () => {
    const html = read('src/rendering/page/index.html');

    expect(html).toMatch(/body\s*\{\s*margin:\s*0;/);
    expect(html).toMatch(/canvas\s*\{\s*display:\s*block;/);
  });
});

describe('physics provenance', () => {
  test('states the jointed-bodies disclosure once', () => {
    const source = read('src/physics/driver.ts');

    expect(source.match(/Jointed bodies do not collide with each other\./g)).toHaveLength(1);
  });
});

describe('DPR probe tool', () => {
  test('carries no internal task labels in user-visible text', () => {
    for (const path of [
      'src/rendering/dpr-probe/page/index.html',
      'src/rendering/dpr-probe/serve.ts',
      'src/rendering/dpr-probe/page/probe.ts',
    ]) {
      expect(read(path)).not.toMatch(/NEU-S4/);
    }
  });

  test('returns the preview to the idle progress state before restarting it', () => {
    // `refreshPreview` leaves the run's DONE/ABORTED line and hidden title on
    // screen unless it explicitly resets them.
    const source = read('src/rendering/dpr-probe/page/probe.ts');
    const body = source.slice(source.indexOf('const refreshPreview'), source.indexOf('const buildControls'));
    const resetAt = body.indexOf("setProgress('', 'idle')");
    const readoutAt = body.indexOf('visualReadout.textContent');

    expect(resetAt).toBeGreaterThan(-1);
    expect(resetAt).toBeLessThan(readoutAt);
  });
});

describe('held-cell teardown', () => {
  test('the harness clears the held adapter before its teardown can throw', () => {
    const source = read('src/rendering/page/harness.ts');
    const body = source.slice(source.indexOf('const disposeHeldCell'), source.indexOf('const adapterKey'));

    expect(body.indexOf('heldAdapter = null')).toBeLessThan(body.indexOf('held?.teardown'));
  });
});
