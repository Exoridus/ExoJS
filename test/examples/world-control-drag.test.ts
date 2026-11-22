// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { expect, it } from 'vitest';

interface DragScene extends Exo.Scene {
  emitterX: number;
  emitterY: number;
  lightX: number;
  lightY: number;
  onDown(event: { pointer: { id: number }; x: number; y: number; button: number }): void;
  onMove(pointer: { id: number; x: number; y: number }, x: number, y: number): void;
  onUp(pointer: { id: number }): void;
  onBlur(): void;
}

const createScene = (path: string, name: string): DragScene => {
  const source = readFileSync(`examples/${path}.ts`, 'utf8');
  const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

  return runInNewContext(`${compiled}\nnew ${name}()`, {
    ...Exo,
    slider: () => 0,
    toggle: () => false,
    choice: () => '',
    document: { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) },
  }) as DragScene;
};

it.each([
  ['particles/emitter-basics', 'EmitterBasicsScene', 'emitterX', 'emitterY'],
  ['lighting/shadow-casters', 'ShadowCastersScene', 'lightX', 'lightY'],
] as const)('%s owns one world drag and uses phase coordinates until release, cancel, or blur', (path, name, xKey, yKey) => {
  const scene = createScene(path, name);
  const owner = { id: 7, x: -100, y: -100 };
  const second = { id: 8, x: 1000, y: 500 };
  const position = () => [scene[xKey], scene[yKey]];

  try {
    const initial = position();
    scene.onDown({ pointer: owner, x: 500, y: 300, button: 2 });
    expect(position()).toEqual(initial);
    scene.onDown({ pointer: owner, x: 500, y: 300, button: 0 });
    expect(scene[xKey]).toBeCloseTo(500 / 1280);
    expect(scene[yKey]).toBeCloseTo(300 / 600);
    const pressed = position();
    scene.onMove(second, 800, 300);
    expect(position()).toEqual(pressed);
    scene.onUp(second);
    scene.onMove(owner, 650, 360);
    expect(scene[xKey]).toBeCloseTo(650 / 1280);
    expect(scene[yKey]).toBeCloseTo(360 / 600);
    scene.onUp(owner);
    const released = position();
    scene.onMove(owner, 800, 400);
    expect(position()).toEqual(released);
    scene.onDown({ pointer: owner, x: 600, y: 300, button: 0 });
    scene.onBlur();
    const blurred = position();
    scene.onMove(owner, 800, 400);
    expect(position()).toEqual(blurred);
  } finally {
    Exo.Scene.prototype.destroy.call(scene);
  }
});
