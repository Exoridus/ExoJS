/**
 * Interactive driver for one playground example, for manual verification
 * while editing an `examples/**\/*.ts` source - screenshots and console
 * errors, no assertions.
 *
 * Companion to `smoke-examples.ts`: that one batch-checks the whole catalog
 * against a built `site/dist`; this one drives a single example against a
 * live `pnpm dev` so a source edit shows up on the very next run, and prints
 * a screenshot after each step instead of pass/fail.
 *
 * Usage (from `site/`, with `pnpm dev` already running):
 *   pnpm check-example <chapter/slug> [step ...]
 *
 * Steps, applied in order:
 *   wait:<ms>          plain delay
 *   click:<fx>,<fy>    left-click at a fraction of the canvas box (0..1)
 *   rclick:<fx>,<fy>   right-click at a fraction of the canvas box
 *   key:<key>          press a keyboard key (Playwright key name)
 *   shot:<name>        screenshot named <name>; the run prints where it landed
 *
 * Example:
 *   pnpm check-example audio-fx/convolution-rooms \
 *     shot:before click:0.2,0.5 wait:300 shot:after rclick:0.5,0.3 wait:300 shot:next-room
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Frame } from 'playwright';

// Matches `astro.config.ts`'s `base` - every URL in the served page carries
// it, dev server included.
const SITE_BASE = '/ExoJS';
const DEFAULT_HOST = 'http://localhost:4321';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', '..', '.workspace', 'tmp', 'check-example');

type Step = { kind: 'wait'; ms: number } | { kind: 'click' | 'rclick'; fx: number; fy: number } | { kind: 'key'; key: string } | { kind: 'shot'; name: string };

const parseStep = (raw: string): Step => {
  const separator = raw.indexOf(':');
  const kind = separator === -1 ? raw : raw.slice(0, separator);
  const arg = separator === -1 ? '' : raw.slice(separator + 1);

  switch (kind) {
    case 'wait':
      return { kind: 'wait', ms: Number(arg) };
    case 'click':
    case 'rclick': {
      const [fx, fy] = arg.split(',').map(Number);
      return { kind, fx: fx ?? 0.5, fy: fy ?? 0.5 };
    }
    case 'key':
      return { kind: 'key', key: arg };
    case 'shot':
      return { kind: 'shot', name: arg || 'shot' };
    default:
      throw new Error(`unknown step "${raw}" (expected wait:/click:/rclick:/key:/shot:)`);
  }
};

const findPreviewFrame = async (frames: readonly Frame[]): Promise<Frame> => {
  // Same match as `smoke-examples.ts`: the preview lives in an iframe whose
  // URL always contains `preview.html`, regardless of query string.
  const frame = frames.find(candidate => candidate.url().includes('preview.html'));

  if (!frame) {
    throw new Error('preview iframe not found - is the dev server actually up and the example slug correct?');
  }

  return frame;
};

const main = async (): Promise<void> => {
  const [example, ...stepArgs] = process.argv.slice(2);

  if (!example) {
    console.error('Usage: pnpm check-example <chapter/slug> [step ...]');
    process.exitCode = 2;
    return;
  }

  const steps = stepArgs.map(parseStep);
  const host = process.env.CHECK_EXAMPLE_HOST ?? DEFAULT_HOST;

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleLines: string[] = [];

  page.on('console', message => {
    if (message.type() === 'error') consoleLines.push(`[console] ${message.text()}`);
  });
  page.on('pageerror', error => consoleLines.push(`[pageerror] ${String(error)}`));

  try {
    await page.goto(`${host}${SITE_BASE}/en/playground/?version=current&example=${encodeURIComponent(example)}`, { waitUntil: 'networkidle' });

    const frame = await findPreviewFrame(page.frames());
    const canvas = await frame.waitForSelector('canvas', { timeout: 15_000 });
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error('canvas has no bounding box (zero-sized or detached)');
    }

    for (const step of steps) {
      switch (step.kind) {
        case 'wait':
          await page.waitForTimeout(step.ms);
          break;
        case 'click':
        case 'rclick':
          await page.mouse.click(box.x + box.width * step.fx, box.y + box.height * step.fy, step.kind === 'rclick' ? { button: 'right' } : {});
          break;
        case 'key':
          await page.keyboard.press(step.key);
          break;
        case 'shot': {
          const path = join(outDir, `${step.name}.png`);

          await page.screenshot({ path });
          console.log('screenshot:', path);
          break;
        }
      }
    }

    console.log('console output:', consoleLines.length > 0 ? `\n${consoleLines.join('\n')}` : '(none)');
  } finally {
    await browser.close();
  }
};

await main();
