import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { expect, it } from 'vitest';

const source = readFileSync('examples/scene-graph/parallax-starfield.ts', 'utf8');
const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

it.each([
  [Exo.Keyboard.A, Exo.Keyboard.D],
  [Exo.Keyboard.Left, Exo.Keyboard.Right],
])('keeps the hero facing its last movement through overlapping and released keys %s/%s', (left, right) => {
  const scene = runInNewContext(`${compiled}\nObject.create(ParallaxStarfieldScene.prototype)`, { ...Exo });
  const move = new Exo.VectorAction({ left, right });
  const values = new Float32Array(Math.max(left, right) + 1);
  const fit = { scale: 1, contentHeight: 600 };
  const hero = new Exo.Sprite();
  const layers = [new Exo.Container(), new Exo.Container(), new Exo.Container()];
  Object.assign(scene, {
    hero,
    layers,
    factorLabels: [],
    actions: { move },
    scroll: 0,
    playing: true,
    panel: { fit: () => fit, status() {}, values: { factors: false } },
  });
  Object.defineProperty(scene, 'app', { value: { width: 1280, canvas: document.createElement('canvas') } });

  try {
    for (const [negative, positive, facing, scroll] of [
      [1, 0, -0.6, -2.6],
      [1, 1, -0.6, -2.6],
      [0, 1, 0.6, 0],
      [0, 0, 0.6, 0],
      [1, 0, -0.6, -2.6],
      [0, 0, -0.6, -2.6],
    ] as const) {
      values[left] = negative;
      values[right] = positive;
      move._update({ values, batches: [], frameId: 1, timestamp: 0 });
      scene.update(Exo.Time.seconds(0.01));
      expect(hero.scale.x).toBe(facing);
      expect(hero.scale.y).toBe(0.6);
      expect(scene.scroll).toBeCloseTo(scroll);
    }

    fit.scale = 2;
    scene.update(Exo.Time.seconds(0));
    expect(hero.scale.x).toBe(-1.2);
    expect(hero.scale.y).toBe(1.2);
  } finally {
    hero.destroy();
    layers.forEach(layer => layer.destroy());
  }
});
