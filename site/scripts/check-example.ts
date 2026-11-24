/**
 * Interactive driver for one playground example, for manual verification
 * while editing an `examples/**\/*.ts` source - screenshots and console
 * errors, no visual assertions. An explicit renderer is checked before capture.
 *
 * Companion to `smoke-examples.ts`: that one batch-checks the whole catalog
 * against a built `site/dist`; this one drives a single example against a
 * live `pnpm dev` so a source edit shows up on the very next run, and prints
 * a screenshot after each step instead of pass/fail.
 *
 * Usage (from `site/`, with `pnpm dev` already running):
 *   pnpm check-example <chapter/slug> [step ...] [--viewport 1920x1080] [--dpr 1]
 *     [--renderer auto|webgl2|webgpu] [--browser chromium|firefox] [--headed]
 *     [--out <directory>]
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
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { chromium, firefox, type Frame } from 'playwright';

import { resolveSiteChannel } from '../../scripts/pages/site-channel.ts';

// The base `astro.config.ts` resolves from the same environment - every URL in
// the served page carries it, dev server included.
const SITE_BASE = resolveSiteChannel(process.env).basePath.replace(/\/$/, '');
const DEFAULT_HOST = 'http://localhost:4321';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

type Step =
  | { kind: 'wait'; ms: number }
  | { kind: 'click' | 'rclick'; fx: number; fy: number }
  | { kind: 'key'; key: string }
  | { kind: 'shot'; name: string };

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
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      viewport: { type: 'string', default: '1400x900' },
      dpr: { type: 'string', default: '1' },
      renderer: { type: 'string', default: 'auto' },
      browser: { type: 'string', default: 'chromium' },
      headed: { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  });
  const [example, ...stepArgs] = positionals;

  if (!example) {
    console.error('Usage: pnpm check-example <chapter/slug> [step ...]');
    process.exitCode = 2;

    return;
  }

  const steps = stepArgs.map(parseStep);
  const host = process.env.CHECK_EXAMPLE_HOST ?? DEFAULT_HOST;
  const dimensions = /^(\d+)x(\d+)$/.exec(values.viewport);
  const dpr = Number(values.dpr);

  if (!dimensions || Number(dimensions[1]) <= 0 || Number(dimensions[2]) <= 0 || !Number.isFinite(dpr) || dpr <= 0) {
    throw new Error('Use a positive WIDTHxHEIGHT viewport and a positive DPR.');
  }

  if (!['auto', 'webgl2', 'webgpu'].includes(values.renderer) || !['chromium', 'firefox'].includes(values.browser)) {
    throw new Error('Renderer must be auto, webgl2 or webgpu; browser must be chromium or firefox.');
  }

  const viewport = { width: Number(dimensions[1]), height: Number(dimensions[2]) };
  const outDir = values.out ? resolve(values.out) : resolve(repoRoot, '.workspace', 'tmp', 'check-example');
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }).trim() !== '';

  await mkdir(outDir, { recursive: true });

  const browser = await (values.browser === 'firefox' ? firefox : chromium).launch({ headless: !values.headed });
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
  const consoleLines: string[] = [];
  const captures: Array<{ name: string; elapsedMs: number; renderer: unknown }> = [];
  let servedBuild: unknown = null;

  if (values.renderer === 'webgl2') {
    await page.addInitScript("Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, value: undefined });");
  }

  page.on('console', message => {
    if (message.type() === 'error') {
      consoleLines.push(`[console] ${message.text()}`);
    }
  });
  page.on('pageerror', error => consoleLines.push(`[pageerror] ${String(error)}`));

  try {
    const manifest = await page.request.get(`${host}${SITE_BASE}/site-build.json`);

    if (manifest.ok()) {
      servedBuild = await manifest.json();
    }

    await page.goto(`${host}${SITE_BASE}/en/playground/?version=current&example=${encodeURIComponent(example)}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.locator('iframe').first().waitFor();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('iframe')).some(iframe => iframe.contentWindow?.location.href.includes('preview.html')),
    );
    const frame = await findPreviewFrame(page.frames());
    const canvas = await frame.waitForSelector('canvas', { timeout: 15_000 });
    const mounted = performance.now();

    for (const step of steps) {
      switch (step.kind) {
        case 'wait':
          await page.waitForTimeout(step.ms);
          break;
        case 'click':
        case 'rclick': {
          const box = await canvas.boundingBox();

          if (!box) {
            throw new Error('canvas has no bounding box (zero-sized or detached)');
          }

          await page.mouse.click(
            box.x + box.width * step.fx,
            box.y + box.height * step.fy,
            step.kind === 'rclick' ? { button: 'right' } : {},
          );
          break;
        }
        case 'key':
          await page.keyboard.press(step.key);
          break;
        case 'shot': {
          const path = join(outDir, `${step.name}.png`);
          const renderer = await frame.evaluate<{ actual: string | null } | null>('globalThis.__EXAMPLE_RENDERER_STATUS__ ?? null');

          if (values.renderer !== 'auto' && renderer?.actual !== values.renderer) {
            throw new Error(`Requested ${values.renderer} is not confirmed by the running example: ${JSON.stringify(renderer)}`);
          }

          await page.screenshot({ path });
          await canvas.screenshot({ path: join(outDir, `${step.name}-canvas.png`) });
          captures.push({ name: step.name, elapsedMs: Math.round(performance.now() - mounted), renderer });
          console.log('screenshot:', path);
          break;
        }
      }
    }

    console.log('console output:', consoleLines.length > 0 ? `\n${consoleLines.join('\n')}` : '(none)');
  } finally {
    await writeFile(
      join(outDir, 'capture-metadata.json'),
      JSON.stringify(
        {
          sourceSha,
          dirty,
          servedBuild,
          example,
          viewport,
          dpr,
          browser: values.browser,
          browserVersion: browser.version(),
          requestedRenderer: values.renderer,
          steps,
          captures,
          consoleLines,
        },
        null,
        2,
      ),
    );
    await browser.close();
  }
};

await main();
