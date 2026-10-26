// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

it('starts two independent streams and keeps their playback and gain controls together', () => {
  const source = readFileSync('examples/audio-basics/music-loop.ts', 'utf8');
  const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const scene = runInNewContext(`${compiled}\nObject.create(MusicLoopScene.prototype)`, {
    ...Exo,
    slider: () => ({}),
    demoPanel: (options: { onChange(key: string, value: number, values: unknown): void }) => {
      const values = { mix: 0.25, volume: 0.4 };
      options.onChange('mix', values.mix, values);

      return { values };
    },
  });
  const makeVoice = () => ({ fade: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn() });
  const voices = [makeVoice(), makeVoice()];
  const play = vi.fn().mockReturnValueOnce(voices[0]).mockReturnValueOnce(voices[1]);
  Object.assign(scene, { tracks: [{}, {}], voices: [], playing: false });
  Object.defineProperty(scene, 'inputs', { value: { onTrigger: () => {} } });
  const bus = {};
  Object.defineProperty(scene, 'app', { value: { audio: { play, music: bus } } });
  scene.init();
  scene.togglePause();
  expect(play).toHaveBeenCalledTimes(2);
  expect(play.mock.calls[0]![1].volume).toBeCloseTo(0.3);
  expect(play.mock.calls[1]![1].volume).toBeCloseTo(0.1);
  expect(play.mock.calls.every(([, options]) => options.bus === bus && options.loop)).toBe(true);
  scene.togglePause();
  expect(voices.every(voice => voice.pause.mock.calls.length === 1)).toBe(true);
  scene.togglePause();
  expect(voices.every(voice => voice.resume.mock.calls.length === 1)).toBe(true);
  scene.panel.values.mix = 1;
  scene.applyMix(scene.panel.values);
  expect(voices[0]!.fade).toHaveBeenCalledWith(0, expect.any(Number));
  expect(voices[1]!.fade).toHaveBeenCalledWith(0.4, expect.any(Number));
  scene.stop();
  expect(voices.every(voice => voice.stop.mock.calls.length === 1)).toBe(true);
  expect(scene.voices).toEqual([]);
});
