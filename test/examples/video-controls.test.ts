// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import ts from 'typescript';
import { expect, it } from 'vitest';

const createScene = () => {
  const source = readFileSync('examples/sprites-textures/video-drawable.ts', 'utf8');
  const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const selected: string[] = [];
  const bindings = new Map<number, () => void>();
  const options: string[] = [];
  const scene = runInNewContext(`${compiled}\nnew VideoDrawableScene()`, {
    ...Exo,
    assets,
    choice: (_label: string, values: string[]) => {
      options.push(...values);

      return values[0];
    },
    slider: () => 0,
    toggle: (_label: string, value: boolean) => value,
    demoPanel: () => ({ set: (_key: string, value: string) => selected.push(value), status() {}, dispose() {} }),
  }) as Exo.Scene & { switchVideo(index: number): Promise<void>; generation: number };
  Object.defineProperty(scene, 'loader', { value: { get: () => null } });
  Object.defineProperty(scene, 'inputs', { value: { onStart: (key: number, callback: () => void) => bindings.set(key, callback) } });
  scene.init();

  return { scene, selected, bindings, options };
};

it('offers exactly the same two video choices through the panel and number keys', () => {
  const { scene, selected, bindings, options } = createScene();

  try {
    for (const key of [Exo.Keyboard.One, Exo.Keyboard.Two, Exo.Keyboard.Three]) {
      expect(() => bindings.get(key)?.()).not.toThrow();
    }

    expect(selected).toEqual(options);
    expect(options).toHaveLength(2);
    expect(bindings.has(Exo.Keyboard.Three)).toBe(false);
  } finally {
    scene.destroy();
  }
});

it('ignores invalid selection indexes without loading or replacing the current clip', async () => {
  const { scene } = createScene();

  try {
    await expect(scene.switchVideo(-1)).resolves.toBeUndefined();
    await expect(scene.switchVideo(2)).resolves.toBeUndefined();
    expect(scene.generation).toBe(0);
  } finally {
    scene.destroy();
  }
});
