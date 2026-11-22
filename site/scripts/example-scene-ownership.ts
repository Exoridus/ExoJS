import { readFile } from 'node:fs/promises';

import type { Browser } from 'playwright';

interface OwnershipResult {
  retained: boolean;
  restored: boolean;
  reentered: boolean;
  inactive: boolean;
  sharedAlive: boolean | null;
  sharedAsset: string | null;
  lighting: Record<string, boolean> | null;
  cancelled: boolean;
  voiceStopped: boolean;
  destroyed: Array<{ key: string; calls: number }>;
  before: number[];
  after: number[];
  applicationErrors: string[];
}

/** Exercise the actual example classes across scene transitions inside one application. */
export const exampleSceneOwnershipChecks = async (
  browser: Browser,
  origin: string,
  base: string,
  check: (name: string, run: () => Promise<void>) => Promise<void>,
): Promise<void> => {
  const cases = [
    ['showcase/audio-reactive-particles', ['analyser', 'detector', 'ps'], 'particleLight'],
    ['render-targets/water-mirror', ['target', 'map', 'source', 'mirror', 'ripple', 'pipeline'], 'ship'],
    ['tilemap/tiled-infinite-map', ['camera', 'mapNode', 'groundStreamer', 'propsStreamer', 'borders'], 'tiledSource'],
    ['showcase/boss-intro-cinematic', ['view', 'bg', 'bars', 'title', 'boss', 'tapPrompt'], 'spaceBossRed'],
    ['lighting/radiance-rooms', ['world', 'lamp'], null],
    ['lighting/shadow-casters', ['world', 'torch', 'beam'], null],
  ] as const;

  for (const [example, fields, sharedAsset] of cases) {
    await check(`same-application scene ownership: ${example}`, async () => {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(error.message));

      try {
        await page.goto(`${origin}${base}/preview.html?v=current`, { waitUntil: 'domcontentloaded' });
        let source = await readFile(new URL(`../../examples/${example}.js`, import.meta.url), 'utf8');
        const sceneName = source.match(/class (\w+Scene) extends Scene/)?.[1];

        if (!sceneName) {
          throw new Error(`Cannot identify the example Scene: ${example}`);
        }

        // Extra registered scene and a reference to the unmodified class are
        // test instrumentation only. Reduced radiance resolution bounds this
        // lifetime test; it is not a visual acceptance or performance result.
        source = source
          .replace('const app = new Application(', 'class OwnershipEmptyScene extends Scene {}\nconst app = new Application(')
          .replace(`scenes: { ${sceneName} }`, `scenes: { ${sceneName}, OwnershipEmptyScene }`)
          .replace('\nawait ', '\nconst applicationErrors = []; app.onError.add(error => applicationErrors.push(error.message));\nawait ');

        if (example === 'lighting/radiance-rooms') {
          source = source.replace('const lightResolution = 1;', 'const lightResolution = 0.125;');
        }

        await page.evaluate(
          async ({ source, sceneName }) => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  `${source}\nglobalThis.__ownership = { app, SceneType: ${sceneName}, Empty: OwnershipEmptyScene, applicationErrors, assets: typeof assets === "undefined" ? null : assets };`,
                ],
                { type: 'text/javascript' },
              ),
            );

            try {
              await import(url);
            } finally {
              URL.revokeObjectURL(url);
            }
          },
          { source, sceneName },
        );
        await page.waitForFunction('globalThis.__ownership?.app.scenes.currentScene');

        if (example === 'showcase/audio-reactive-particles') {
          const clickAction = async (action: string): Promise<void> => {
            await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
            const point = await page.evaluate<{ x: number; y: number }>(`(() => {
              const { app } = globalThis.__ownership;
              const bounds = app.scenes.currentScene.panel.actions[${JSON.stringify(action)}].getBounds();
              const canvas = app.canvas.getBoundingClientRect();
              return { x: canvas.x + (bounds.x + bounds.width / 2) * canvas.width / app.width,
                y: canvas.y + (bounds.y + bounds.height / 2) * canvas.height / app.height };
            })()`);
            await page.mouse.click(point.x, point.y);
          };

          const silent = await page.evaluate<boolean>(`(() => {
            const scene = globalThis.__ownership.app.scenes.currentScene;
            return !scene.playing && !scene.musicVoice && scene.ps.aliveCount === 0;
          })()`);

          if (!silent) {
            throw new Error('Audio must wait for Start before playback and emission.');
          }

          await clickAction('Start');
          await page.waitForFunction(`(() => {
            const { app } = globalThis.__ownership, scene = app.scenes.currentScene;
            return !app.audio.locked && scene.musicVoice && !scene.musicVoice.paused && scene.ps.aliveCount > 0;
          })()`);
          await clickAction('Pause');
          await page.waitForFunction('globalThis.__ownership.app.scenes.currentScene.musicVoice.paused');
          const pausedCount = await page.evaluate<number>('globalThis.__ownership.app.scenes.currentScene.ps.aliveCount');
          await page.waitForTimeout(100);

          if ((await page.evaluate<number>('globalThis.__ownership.app.scenes.currentScene.ps.aliveCount')) !== pausedCount) {
            throw new Error('Audio Pause must freeze the particle simulation.');
          }

          await clickAction('Start');
          await page.waitForFunction('!globalThis.__ownership.app.scenes.currentScene.musicVoice.paused');
          await page.evaluate('globalThis.__ownership.app.scenes.currentScene.panel.set("muted", true)');
          await page.waitForFunction(`(() => {
            const scene = globalThis.__ownership.app.scenes.currentScene;
            return scene.musicVoice.volume === 0 && scene.rate.value === 0;
          })()`);
          await page.evaluate(`(() => {
            const panel = globalThis.__ownership.app.scenes.currentScene.panel;
            panel.set('muted', false);
            panel.set('swapped', true);
          })()`);
          await page.waitForFunction(`(() => {
            const scene = globalThis.__ownership.app.scenes.currentScene;
            return scene.labels[0].text.includes('spread') && scene.labels[1].text.includes('density');
          })()`);
        } else if (example === 'showcase/boss-intro-cinematic') {
          await page.mouse.click(320, 100);
          await page.waitForFunction('globalThis.__ownership.app.scenes.currentScene.started');
        }

        const result = await page.evaluate<OwnershipResult>(`(async () => {
          const fields = ${JSON.stringify(fields)};
          const sharedAsset = ${JSON.stringify(sharedAsset)};
          const { app, SceneType, Empty, applicationErrors, assets } = globalThis.__ownership;
          const first = app.scenes.currentScene;
          // Claim an asset the scene genuinely uses, not an unrelated survivor.
          let shared = null;
          if (sharedAsset === 'tiledSource') {
            const { Asset } = await import('@codexo/exojs');
            await app.loader.load(Asset.type('tiledSource', assets.driftFieldsMap.source));
            shared = first.mapNode.map.tilesets[0].texture.texture;
          } else if (sharedAsset !== null) {
            shared = await app.loader.load(assets[sharedAsset]);
            if (![first.ps?.texture, first.source?.texture, first.boss?.texture].includes(shared)) {
              throw new Error('Shared asset claim does not match a texture used by the scene: ' + sharedAsset);
            }
          }
          const resources = fields.map(key => ({ key, value: first[key], calls: 0 }));

          if (first.world?.children) {
            for (const child of first.world.children) {
              if (child.texture && !resources.some(entry => entry.value === child.texture)) {
                resources.push({ key: 'generatedTexture' + resources.length, value: child.texture, calls: 0 });
              }
            }
          }

          if (first.mapNode?.map) {
            resources.push({ key: 'runtimeMap', value: first.mapNode.map, calls: 0 });
          }

          for (const entry of resources) {
            if (!entry.value?.destroy) {
              throw new Error('Missing owned resource: ' + entry.key);
            }

            const destroy = entry.value.destroy.bind(entry.value);
            entry.value.destroy = () => {
              entry.calls++;
              return destroy();
            };
          }

          const lighting = first.lighting ? {} : null;
          let ownedPasses = [];
          const retiredPasses = [];
          const absent = passes => passes.every(pass => !app.framePasses.hasPass(pass));
          const presentOnce = passes => passes.length > 0 && passes.every(pass =>
            [...app.framePasses].filter(candidate => candidate === pass).length === 1);
          if (lighting) {
            lighting.rebuildKeepsLamp = true;
            lighting.rebuildRemovesOldPasses = true;
            if (typeof first.build === 'function') {
              const lamp = first.lamp;
              for (const [cascading, bounce] of [[false, true], [true, false], [true, true]]) {
                const outgoing = [...app.framePasses];
                retiredPasses.push(...outgoing);
                first.build(cascading, bounce);
                lighting.rebuildKeepsLamp &&= first.lamp === lamp;
                lighting.rebuildRemovesOldPasses &&= absent(outgoing) && presentOnce([...app.framePasses]);
              }
            }
            ownedPasses = [...app.framePasses];
            lighting.activePasses = presentOnce(ownedPasses);
          }

          const signals = ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerTap', 'onPointerCancel'];
          const counts = () => signals.map(key => app.input[key].count);
          const before = counts();
          const snapshot = () => ({
            tint: first.spawn?.config.tint,
            title: first.titleState?.count,
            drag: first.dragPointer,
            emitter: [first.emitterX, first.emitterY],
            light: [first.lightX, first.lightY],
            ripple: first.panel?.values?.strength,
          });
          await app.scenes.change(Empty, { suspendCurrent: true });
          const retained = resources.every(entry => entry.calls === 0) && !first.musicVoice?.ended;
          if (lighting) lighting.retainedPassesAbsent = absent(ownedPasses);
          const retainedVoiceTime = first.musicVoice?.time;
          if (first.musicVoice) await new Promise(resolve => setTimeout(resolve, 100));
          const held = !first.musicVoice || first.musicVoice.time === retainedVoiceTime;
          const dormant = snapshot();
          app.input.onPointerDown.dispatch({ id: 71, buttons: 1 }, 320, 180);
          app.input.onPointerMove.dispatch({ id: 71 }, 480, 200);
          app.input.onPointerUp.dispatch({ id: 71 }, 480, 200);
          first.detector?.onBeat.dispatch({});
          const afterDormant = snapshot();
          const inactive = held && dormant.tint === afterDormant.tint && JSON.stringify(dormant) === JSON.stringify(afterDormant);
          await app.scenes.restore(SceneType);
          const restored = app.scenes.currentScene === first;
          if (lighting) lighting.restoredPassesOnce = presentOnce(ownedPasses);
          await app.scenes.change(Empty);
          const destroyed = resources.map(entry => ({ key: entry.key, calls: entry.calls }));
          const voiceStopped = !first.musicVoice || first.musicVoice.ended;
          if (lighting) lighting.destroyedPassesAbsent = absent([...retiredPasses, ...ownedPasses]);
          await app.scenes.change(SceneType);
          const reentered = app.scenes.currentScene !== first;
          const after = counts();
          const sharedAlive = shared === null ? null : !shared.destroyed;
          let cancelled = true;

          if (lighting) {
            await app.scenes.change(Empty);
            const originalInit = SceneType.prototype.init;
            let prepared;
            SceneType.prototype.init = function (...args) {
              prepared = this;
              return originalInit.apply(this, args);
            };
            try {
              await app.scenes.preload(SceneType);
            } finally {
              SceneType.prototype.init = originalInit;
            }
            const whilePrepared = [...app.framePasses];
            await app.scenes.change(SceneType);
            const preparedPasses = [...app.framePasses];
            // Compare the actual prepared renderer's pass identities after
            // activation, when scene-bound systems first publish them.
            lighting.preloadedPassesAbsent = app.scenes.currentScene === prepared &&
              preparedPasses.length > 0 && preparedPasses.every(pass => !whilePrepared.includes(pass));
            lighting.preloadedActivationOnce = presentOnce(preparedPasses);
            await app.scenes.change(Empty);
            lighting.preloadedDestroyRemovesPasses = absent(preparedPasses);
          }

          if (Object.hasOwn(SceneType.prototype, 'load')) {
            await app.scenes.change(Empty);
            const originalLoad = SceneType.prototype.load;
            let lateScene;
            let release;
            let arrived;
            const gate = new Promise(resolve => { release = resolve; });
            const loaded = new Promise(resolve => { arrived = resolve; });
            // Hold the first resolved asset at the asynchronous boundary. The
            // real production load body continues after real director unload.
            SceneType.prototype.load = function (...args) {
              lateScene = this;
              const load = this.loader.load.bind(this.loader);
              let held = false;
              this.loader.load = (...assetArgs) => {
                const result = load(...assetArgs);
                if (held) return result;
                held = true;
                return result.then(asset => {
                  arrived();
                  return gate.then(() => asset);
                });
              };
              return originalLoad.apply(this, args);
            };

            try {
              const preparation = app.scenes.preload(SceneType);
              await loaded;
              const cancellation = app.scenes.unload(SceneType);
              const aborted = lateScene.lifecycleSignal.aborted;
              release();
              await Promise.all([preparation, cancellation]);
              cancelled = aborted && lateScene.root.destroyed && fields.every(key => lateScene[key] === undefined);
            } finally {
              release();
              SceneType.prototype.load = originalLoad;
            }

            // Cancellation must not poison a later fresh entry.
            await app.scenes.change(SceneType);
          }

          await app.destroy();
          return { retained, restored, reentered, inactive, sharedAlive, sharedAsset, lighting, cancelled, voiceStopped, destroyed, before, after, applicationErrors };
        })()`);

        if (
          !result.retained ||
          !result.restored ||
          !result.reentered ||
          !result.inactive ||
          result.sharedAlive === false ||
          (result.lighting !== null && Object.values(result.lighting).some(passed => !passed)) ||
          !result.cancelled ||
          !result.voiceStopped
        ) {
          throw new Error(`${example}: retention/restore/reentry failed: ${JSON.stringify(result)}`);
        }

        const missed = result.destroyed.filter(entry => entry.calls !== 1);

        if (
          missed.length ||
          JSON.stringify(result.before) !== JSON.stringify(result.after) ||
          pageErrors.length ||
          result.applicationErrors.length
        ) {
          throw new Error(`${example}: ${JSON.stringify({ ...result, missed, pageErrors })}`);
        }
      } finally {
        await context.close();
      }
    });
  }
};
