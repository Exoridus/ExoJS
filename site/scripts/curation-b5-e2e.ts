import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Application, AudioBus, Pausable, Sound, Voice } from '@codexo/exojs';
import type { AudioAnalyser, DelayEffect, DuckingEffect, ReverbEffect } from '@codexo/exojs/audio-fx';
import { chromium, firefox, type Frame, type Page } from 'playwright';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'http://127.0.0.1:4327/ExoJS' },
    browser: { type: 'string', default: 'chromium' },
    backend: { type: 'string', default: 'webgl2' },
    shots: { type: 'string', default: '../docs/curation/evidence/b5' },
    only: { type: 'string', default: '' },
  },
});
assert(['webgl2', 'webgpu'].includes(values.backend!));
assert(['chromium', 'firefox'].includes(values.browser!));
const output = resolve(values.shots!),
  backend = values.backend!;
const browser =
  values.browser === 'firefox'
    ? await firefox.launch({ firefoxUserPrefs: { 'dom.webgpu.enabled': true } })
    : await chromium.launch({ channel: 'chromium', args: ['--enable-webgl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
interface ProbeScene {
  panel: { values: Record<string, string | number | boolean> };
  sounds?: Sound[];
  sfx?: Sound;
  speech?: Sound;
  voice?: Voice & Pausable & { playbackRate?: number; time?: number };
  musicVoice?: Voice | null;
  voices?: Voice[];
  speechVoice?: Voice;
  bus?: AudioBus;
  musicBus?: AudioBus;
  voiceBus?: AudioBus;
  analyser?: AudioAnalyser;
  voiceLevel?: AudioAnalyser;
  musicLevel?: AudioAnalyser;
  reverb?: ReverbEffect;
  delay?: DelayEffect;
  ducking?: DuckingEffect;
  playing?: boolean;
  rms?: number;
  peak?: number;
  source?: { x: number; y: number };
  listener?: { x: number; y: number };
  dragging?: boolean;
}
declare global {
  interface Window {
    __b5: {
      app: Application;
      samples: Array<{ peak: number; rms: number; gain?: number; time?: number }>;
      testTap?: AudioAnalyser;
      timer?: number;
    };
  }
}
const records: Array<{ example: string; size: string; status: string; checks?: string[]; measured?: unknown; error?: string }> = [];
const sceneState = (frame: Frame) =>
  frame.evaluate(() => {
    const scene = window.__b5.app.scenes.currentScene as unknown as ProbeScene;

    return {
      backend: window.__b5.app.backend.backendType,
      locked: window.__b5.app.audio.locked,
      playing: scene.playing,
      voice: Boolean(scene.voice ?? scene.musicVoice),
      paused: scene.voice?.paused,
      rate: scene.voice?.playbackRate,
      time: scene.voice?.time,
      voices: scene.voices?.length ?? 0,
      speech: Boolean(scene.speechVoice),
      source: scene.source,
      listener: scene.listener,
      dragging: scene.dragging,
      panel: scene.panel?.values ?? {},
      bus: scene.bus ? { volume: scene.bus.volume, muted: scene.bus.muted } : undefined,
      master: window.__b5.app.audio.master.volume,
      sound: window.__b5.app.audio.sound.volume,
      music: window.__b5.app.audio.music.volume,
      reverb: scene.reverb ? { wet: scene.reverb.wet, duration: scene.reverb.durationSeconds } : undefined,
      delay: scene.delay?.wet,
      ratio: scene.ducking?.ratio,
      threshold: scene.ducking?.threshold,
      samples: window.__b5.samples,
    };
  });
const capture = async (frame: Frame, name: string) =>
  (await frame.frameElement()).screenshot({ path: resolve(output, `${name}.png`), scale: 'css' });

const open = async (page: Page, slug: string, width: number, height: number): Promise<Frame> => {
  await page.route(`**/examples/${slug}.js*`, async route => {
    const response = await route.fetch(),
      source = await response.text();
    const body = source
      .replace('const app = new Application({', `const app = new Application({ backend: { type: '${backend}' },`)
      .replace(/await (?:app\.start|startExample)\(/, match => `window.__b5 = { app, samples: [] };\n${match}`);
    await route.fulfill({ response, body });
  });
  await page.goto(`${values.host}/en/playground/?version=current&example=${slug}`);
  await page.waitForSelector('iframe[src*="preview.html"]', { timeout: 45000 });

  {
    await page.frameLocator('iframe[src*="preview.html"]').locator('.exo-demo-bar').waitFor({ timeout: 45000 });
  }

  const frame = page.frames().find(candidate => candidate.url().includes('preview.html'))!;
  await frame.waitForFunction(() => Boolean(window.__b5?.app.scenes.currentScene));
  const stack = page.getByRole('button', { name: 'Switch to stacked layout', exact: true });

  if (await stack.isVisible()) {
    await stack.click();
  }

  await page.locator('iframe[src*="preview.html"]').evaluate(
    (element, size) => {
      const frameElement = element as HTMLIFrameElement;
      Object.assign(frameElement.parentElement!.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        zIndex: '10000',
        width: `${size.width}px`,
        height: `${size.height}px`,
        overflow: 'visible',
      });
      Object.assign(frameElement.style, { width: '1280px', height: '720px', transform: `scale(${size.width / 1280})` });
    },
    { width, height },
  );
  await frame.waitForTimeout(150);
  assert.equal((await sceneState(frame)).backend, backend, 'actual backend must equal requested backend');
  const box = (await (await frame.frameElement()).boundingBox())!;
  assert(Math.abs(box.width - width) < 1 && Math.abs(box.height - height) < 1);

  return frame;
};

const monitor = async (frame: Frame, source: 'analyser' | 'voiceLevel' | 'musicLevel' = 'analyser') =>
  frame.evaluate(source => {
    window.__b5.samples = [];
    clearInterval(window.__b5.timer);
    window.__b5.timer = window.setInterval(() => {
      const scene = window.__b5.app.scenes.currentScene as unknown as ProbeScene;
      const analyser = scene?.[source];

      if (!analyser) {
        return;
      }

      const samples = analyser.getWaveformFloat();
      let peak = 0,
        energy = 0;

      for (const sample of samples) {
        peak = Math.max(peak, Math.abs(sample));
        energy += sample * sample;
      }

      const output = scene.bus?.getOutputNode() as GainNode | null;
      window.__b5.samples.push({
        peak,
        rms: Math.sqrt(energy / samples.length),
        gain: output?.gain.value,
        time: output?.context.currentTime,
      });
    }, 10);
  }, source);

const tapBus = async (frame: Frame, bus: 'sound' | 'music') =>
  frame.evaluate(async bus => {
    const { AudioAnalyser } = await import('@codexo/exojs/audio-fx');
    const probe = window.__b5;
    probe.testTap = new AudioAnalyser({ source: probe.app.audio[bus], smoothingTimeConstant: 0 });
    (probe.app.scenes.currentScene as unknown as ProbeScene).analyser = probe.testTap;
  }, bus);

const expectSignal = async (frame: Frame) => {
  await frame.waitForFunction(() => window.__b5.samples.some(sample => sample.peak > 0.001), undefined, { timeout: 5000 });
  const samples = (await sceneState(frame)).samples;
  assert(Math.max(...samples.map(sample => sample.peak)) < 1, 'output retains digital headroom');
};

const choose = async (frame: Frame, label: string, value: string) =>
  frame.getByRole('combobox', { name: label, exact: true }).selectOption(value);

const changeSlider = async (frame: Frame, label: string, value: string) => {
  const input = frame.getByRole('slider', { name: label, exact: true });
  await input.fill(value);
  await input.dispatchEvent('input');
};

const click = async (frame: Frame, name: string) => frame.getByRole('button', { name, exact: true }).click();

await mkdir(output, { recursive: true });

try {
  for (const slug of [
    'audio-basics/play-sound',
    'audio-basics/music-loop',
    'audio-basics/audio-buses',
    'audio-fx/ducking',
    'audio-fx/reverb-and-delay',
    'showcase/audio-visualisation',
    'spatial-audio/listener-and-source',
  ].filter(slug => !values.only || slug.includes(values.only))) {
    for (const [width, height] of [
      [1280, 720],
      [512, 288],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, colorScheme: 'dark' });
      const name = `${values.browser}-${backend}-${slug.split('/')[1]}-${width}`,
        checks: string[] = [],
        errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));

      try {
        const frame = await open(page, slug, width!, height!),
          start = await sceneState(frame);
        assert.equal(start.voice, false);
        assert.equal(start.voices, 0);
        assert.equal(start.speech, false);
        checks.push('no voice before explicit playback gesture');
        await capture(frame, `${name}-startup`);

        if (slug.endsWith('play-sound')) {
          await frame.waitForFunction(() =>
            (window.__b5.app.scenes.currentScene as unknown as ProbeScene).sounds?.every(sound => sound.ready),
          );
          await monitor(frame);
          await click(frame, '1  Click');
          await expectSignal(frame);
          await changeSlider(frame, 'Sound volume', '0.2');
          assert.equal((await sceneState(frame)).bus?.volume, 0.2);
          await frame.getByRole('button', { name: 'Mute', exact: true }).click();
          assert.equal((await sceneState(frame)).bus?.muted, true);
          // An idle audio clock may stop advancing; the next source must still stay silent.
          await frame.waitForTimeout(100);
          await monitor(frame);
          await click(frame, '3  Jump');
          await frame.waitForTimeout(150);

          {
            const state = await sceneState(frame);
            const peak = Math.max(...state.samples.map(sample => sample.peak));
            assert(
              peak < 0.0001,
              `muted sample peak ${peak}; bus ${JSON.stringify(state.bus)}; loud ${JSON.stringify(state.samples.filter(sample => sample.peak > 0.0001).slice(0, 10))}; first ${JSON.stringify(state.samples.slice(0, 5))}; last ${JSON.stringify(state.samples.slice(-5))}`,
            );
          }

          await frame.getByRole('button', { name: 'Mute', exact: true }).click();
          await click(frame, '4  Hurt');
          await expectSignal(frame);
          await (await frame.locator('canvas').elementHandle())!.focus();
          await page.keyboard.press('2');
          await frame.getByText('Coin', { exact: false }).last().waitFor();
          checks.push('Click/Hurt samples; muted Jump produces digital silence; volume updates bus; keyboard Coin pad');
        } else if (slug.endsWith('music-loop')) {
          await tapBus(frame, 'music');
          await monitor(frame);
          await click(frame, 'Play / Pause');
          await expectSignal(frame);
          await changeSlider(frame, 'Playback rate', '1.5');
          assert.equal((await sceneState(frame)).rate, 1.5);
          await click(frame, 'Play / Pause');
          assert.equal((await sceneState(frame)).paused, true);
          await click(frame, 'Restart');

          {
            const state = await sceneState(frame);
            assert.equal(state.paused, false);
            assert(state.time! < 1, 'Restart seeks to the start');
          }

          checks.push('music stream samples; playback rate; pause; restart seeks to 0');
        } else if (slug.endsWith('audio-buses')) {
          await tapBus(frame, 'sound');
          await monitor(frame);
          await frame.waitForFunction(() => (window.__b5.app.scenes.currentScene as unknown as ProbeScene).sfx?.ready);
          await changeSlider(frame, 'Master', '0.4');
          await changeSlider(frame, 'Music', '0.3');
          await changeSlider(frame, 'Sound', '0.2');
          const state = await sceneState(frame);
          assert.equal(state.master, 0.4);
          assert.equal(state.music, 0.3);
          assert.equal(state.sound, 0.2);
          await click(frame, 'Play SFX');
          await expectSignal(frame);
          await frame.waitForFunction(() => (window.__b5.app.scenes.currentScene as unknown as ProbeScene).voices?.length === 1);
          await frame.getByRole('button', { name: 'Music bed', exact: true }).click();
          assert.equal((await sceneState(frame)).voice, true, 'music bed voice on the music bus');
          checks.push('three real bus gain controls; SFX voice; music bed voice');
        } else if (slug.endsWith('ducking')) {
          await frame.waitForFunction(() => (window.__b5.app.scenes.currentScene as unknown as ProbeScene).speech?.ready);
          await monitor(frame, 'musicLevel');
          await frame.getByRole('button', { name: 'Music', exact: true }).click();
          await expectSignal(frame);
          await monitor(frame, 'voiceLevel');
          await click(frame, 'Speak');
          await expectSignal(frame);
          assert(Math.abs((await sceneState(frame)).threshold! - (-30 + 20 * Math.log10(0.4))) < 0.001);
          await frame.getByRole('button', { name: 'Ducking', exact: true }).click();
          assert.equal((await sceneState(frame)).ratio, 1);
          checks.push('music samples on ducked bus; speech samples on sidechain; calibrated threshold; ratio-1 bypass');
        } else if (slug.endsWith('reverb-and-delay')) {
          await frame.waitForFunction(() =>
            (window.__b5.app.scenes.currentScene as unknown as ProbeScene).sounds?.every(sound => sound.ready),
          );
          await monitor(frame);
          await click(frame, 'Play');
          await expectSignal(frame);
          await choose(frame, 'Space', 'Small room');
          assert.equal((await sceneState(frame)).reverb?.duration, 0.55);
          await choose(frame, 'Space', 'Hall');
          assert.equal((await sceneState(frame)).reverb?.duration, 2.6);
          assert.equal((await sceneState(frame)).reverb?.wet, 0.35);
          await click(frame, 'Play');
          await frame.waitForTimeout(800);
          await monitor(frame);
          await frame.waitForTimeout(100);
          assert(
            Math.max(...(await sceneState(frame)).samples.map(sample => sample.peak)) > 0.00001,
            'Hall has a real tail after the short impulse',
          );
          await click(frame, 'Stop');

          {
            const state = await sceneState(frame);
            assert.equal(state.voices, 0, 'Stop ends the voices');
            assert.equal(state.bus?.muted, false, 'Stop leaves the effect bus at full gain for the next transient');
          }

          await choose(frame, 'Source', 'Short voice');
          await click(frame, 'Play');
          await choose(frame, 'Space', 'Echo');
          assert.equal((await sceneState(frame)).delay, 0.4);
          await frame.getByRole('button', { name: 'Bypass', exact: true }).click();
          assert.equal((await sceneState(frame)).reverb?.wet, 0);
          assert.equal((await sceneState(frame)).delay, 0);
          checks.push('wood samples; Small room duration; real Hall tail; Stop ends voices without muting; voice source; Echo; dry bypass');
        } else if (slug.endsWith('audio-visualisation')) {
          await choose(frame, 'Source', 'Pulse');
          await monitor(frame);
          await click(frame, 'Play / Pause');
          await expectSignal(frame);
          await click(frame, 'Play / Pause');
          assert.equal((await sceneState(frame)).playing, false);
          await frame.waitForTimeout(150);
          await monitor(frame);
          await frame.waitForTimeout(150);
          assert(Math.max(...(await sceneState(frame)).samples.map(sample => sample.peak)) < 0.0001);
          await choose(frame, 'Source', 'Noise');
          await click(frame, 'Play / Pause');
          await expectSignal(frame);
          await choose(frame, 'Source', 'Music');
          assert.equal((await sceneState(frame)).voice, false, 'source change stops the previous voice');
          await monitor(frame);
          await click(frame, 'Play / Pause');
          await expectSignal(frame);
          checks.push('real Music/Pulse/Noise spectrum+waveform; pause digital silence; source change stops the voice');
        } else {
          await tapBus(frame, 'sound');
          await monitor(frame);
          await frame.getByRole('button', { name: 'Sound', exact: true }).click();
          await frame.waitForFunction(() => Boolean((window.__b5.app.scenes.currentScene as unknown as ProbeScene).voice));
          await expectSignal(frame);
          const before = (await sceneState(frame)).source!;
          const listener = (await sceneState(frame)).listener!;
          const box = (await (await frame.frameElement()).boundingBox())!;
          await page.mouse.move(box.x + (before.x * width!) / 1280, box.y + (before.y * height!) / 720);
          await page.mouse.down();
          await page.mouse.move(box.x + ((before.x - 80) * width!) / 1280, box.y + ((before.y + 20) * height!) / 720, { steps: 4 });
          await page.mouse.up();
          assert((await sceneState(frame)).source!.x < before.x - 50, 'source drag');
          assert.deepEqual((await sceneState(frame)).listener, listener, 'listener stays fixed');
          assert.equal((await sceneState(frame)).dragging, false);
          await (await frame.locator('canvas').elementHandle())!.focus();
          await page.keyboard.down('ArrowLeft');
          await frame.waitForTimeout(450);
          await page.keyboard.up('ArrowLeft');
          assert((await sceneState(frame)).source!.x < before.x - 80);
          await choose(frame, 'Falloff', 'exponential');
          await frame.getByRole('button', { name: 'Orbit', exact: true }).click();
          const orbit = (await sceneState(frame)).source!;
          await frame.waitForTimeout(300);
          assert.notDeepEqual((await sceneState(frame)).source, orbit);
          await frame.getByRole('button', { name: 'Sound', exact: true }).click();
          assert.equal((await sceneState(frame)).voice, false);
          checks.push('spatial pulse samples; source drag and keyboard motion; fixed listener; falloff; orbit; Sound off stops voice');
        }

        await capture(frame, `${name}-interaction`);

        await click(frame, 'Reset');

        {
          const reset = await sceneState(frame);
          assert.equal(reset.voice, false);
          assert.equal(reset.voices, 0);
          assert.equal(reset.speech, false);
          checks.push('Reset stops voices and restores controls');
        }

        const measured = await sceneState(frame);
        assert.deepEqual(errors, [], 'no uncaught browser error');
        await frame.evaluate(() => {
          clearInterval(window.__b5.timer);
          window.__b5.testTap?.destroy();
          window.__b5.app.destroy();
        });
        assert.equal(await frame.locator('.exo-demo-bar').count(), 0);
        checks.push('application teardown removes controls');
        records.push({
          example: slug,
          size: `${width}x${height}`,
          status: 'PASS',
          checks,
          measured: {
            peak: Math.max(0, ...measured.samples.map(sample => sample.peak)),
            rms: Math.max(0, ...measured.samples.map(sample => sample.rms)),
          },
        });
      } catch (error) {
        console.error('Acceptance failure', error);
        await page
          .screenshot({ path: resolve(output, `${name}-failure.png`), timeout: 5000 })
          .catch(captureError => console.error('Failure capture', String(captureError)));
        records.push({
          example: slug,
          size: `${width}x${height}`,
          status: slug.endsWith('play-sound') && String(error).includes('muted sample peak') ? 'BLOCKED' : 'FAIL',
          error: `${String(error)} | page errors: ${errors.join('; ')}`,
        });
      } finally {
        await page.unrouteAll({ behavior: 'wait' });
        await page.close();
      }

      console.log(JSON.stringify(records.at(-1)));
    }
  }
} finally {
  const version = browser.version();
  await browser.close();
  await writeFile(
    resolve(output, `${values.browser}-${backend}${values.only ? `-${values.only.replaceAll('/', '-')}` : ''}-results.json`),
    `${JSON.stringify({ executedAt: new Date().toISOString(), browser: values.browser, version, backend, humanListening: 'NOT_TESTED', materialBlockers: ['M4'], records }, null, 2)}\n`,
  );
}

assert(
  records.every(record => record.status === 'PASS'),
  'B5 browser acceptance has failed or blocked cases',
);
