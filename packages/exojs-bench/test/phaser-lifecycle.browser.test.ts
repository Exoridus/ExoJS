// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { readEngineVersion, startViteServer, type ViteDevServer } from '../src/shared/viteServer';

type BrowserFixture = typeof import('./phaser-lifecycle.fixture');

describe('Phaser adapter lifecycle', () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await startViteServer({
      pageDir: fileURLToPath(new URL('../src/rendering/page', import.meta.url)),
      version: readEngineVersion(),
      libraryArms: ['phaser'],
    });
    browser = await chromium.launch({
      channel: 'chromium',
      headless: true,
      ...(process.env['EXOJS_CHROMIUM_BINARY'] ? { executablePath: process.env['EXOJS_CHROMIUM_BINARY'] } : {}),
    });
  }, 60_000);

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    // The lifecycle probe needs no harness boot or unrelated engine imports.
    await page.route('**/harness.ts', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(server.resolvedUrls!.local[0]!);
    const fixturePath = `/@fs/${fileURLToPath(new URL('./phaser-lifecycle.fixture.ts', import.meta.url)).replaceAll('\\', '/')}`;

    // Keep browser imports in a string so Vitest cannot rewrite them to its SSR loader.
    await page.evaluate(`import(${JSON.stringify(fixturePath)}).then(fixture => { globalThis.phaserLifecycle = fixture; })`);
  }, 60_000);

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  test('repeated picking builds replace the container and interactive objects without changing the queries', async () => {
    const results = await page.evaluate(() =>
      (globalThis as unknown as { phaserLifecycle: BrowserFixture }).phaserLifecycle.observeRepeatedPickingBuilds(),
    );

    for (const result of results) {
      expect(result, `picking build with ${result.count} objects`).toMatchObject({
        containers: 1,
        interactive: result.count,
        pendingInsertion: 0,
        pendingRemoval: 0,
        oldDestroyed: true,
        textures: ['bench-pick'],
        oldTexturesDestroyed: true,
        oldSourcesReleased: true,
      });
      expect(result.queryResults).toHaveLength(100);
    }

    expect(results[0]!.hits).toBeGreaterThan(0);
    expect(results[2]!.hits).toBe(0);
    expect(results[3]!.queryResults).toEqual(results[0]!.queryResults);
  }, 60_000);

  test('leaving a picking scene releases its input objects with the game loop stopped', async () => {
    const result = await page.evaluate(() =>
      (globalThis as unknown as { phaserLifecycle: BrowserFixture }).phaserLifecycle.observeLeavingPicking(),
    );

    expect(result).toMatchObject({ containers: 1, interactive: 0, pendingRemoval: 0, oldDestroyed: true, loopRunning: false });
  }, 60_000);

  test('leaving a picking scene releases its texture and GPU source', async () => {
    const result = await page.evaluate(() =>
      (globalThis as unknown as { phaserLifecycle: BrowserFixture }).phaserLifecycle.observeLeavingPicking(),
    );

    expect(result).toMatchObject({ pickingTexturePresent: false, textureDestroyed: true, sourceReleased: true });
  }, 60_000);

  test('successful initialization retains the context and can repeat after teardown', async () => {
    const results = await page.evaluate(() =>
      (globalThis as unknown as { phaserLifecycle: BrowserFixture }).phaserLifecycle.observeSuccessfulReinitialization(),
    );

    expect(results).toEqual([
      { sameContext: true, loopRunning: false, scenes: 1, canvasConnected: true },
      { sameContext: true, loopRunning: false, scenes: 1, canvasConnected: true },
    ]);
  }, 60_000);

  test('a scene that never creates rejects within a bound and releases the game before settling', async () => {
    const result = await page.evaluate(() =>
      (globalThis as unknown as { phaserLifecycle: BrowserFixture }).phaserLifecycle.observeNeverCreatedScene(),
    );

    expect(result).toMatchObject({
      initialization: 'rejected',
      createReached: true,
      loopRunning: false,
      scenes: 0,
      inputDestroyed: true,
      canvasConnected: true,
      recovered: true,
    });
    expect(result.error).toMatch(/phaser.*(?:initializ|scene).*(?:timed out|timeout)/i);
  }, 60_000);

  test('a game that never reaches READY releases its partially booted resources before rejecting', async () => {
    const result = await page.evaluate(() =>
      (globalThis as unknown as { phaserLifecycle: BrowserFixture }).phaserLifecycle.observeNeverReadyGame(),
    );

    expect(result).toMatchObject({
      initialization: 'rejected',
      textureLoadReached: true,
      sceneManagerWasBooted: false,
      sourcesReleased: true,
      texturesReleased: true,
      rendererReleased: true,
      inputReleased: true,
      scaleReleased: true,
      loopReleased: true,
      gameListeners: 0,
      canvasConnected: true,
      recovered: true,
      teardownError: '',
    });
    expect(result.sourceCount).toBeGreaterThan(0);
    expect(result.error).toMatch(/phaser.*(?:initializ|scene).*(?:timed out|timeout)/i);
  }, 60_000);
});
