import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const createScene = (): {
  sprite: Exo.Sprite;
  rectMask: Exo.Rectangle;
  shapeMask: Exo.Graphics;
  panel: { values: { shape: string }; fit: () => object; status: () => void };
  update(): void;
} => {
  const source = readFileSync(resolve('examples/scene-graph/masks.ts'), 'utf8')
    .replace(/^import[\s\S]*?from '[^']+';\s*/gm, '')
    .split('const app = new Application(')[0]!;
  const compiled = ts.transpileModule(`${source}\nnew MasksScene();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

  return runInNewContext(compiled, { ...Exo, choice: () => ({}) });
};

it('switches one image through the four supported mask shapes at the fitted canvas scale', () => {
  const scene = createScene();
  scene.sprite = new Exo.Sprite(null);
  Object.defineProperty(scene, 'app', { value: { canvas: {}, width: 800, height: 600 } });
  scene.panel = {
    values: { shape: 'Rectangle' },
    fit: () => ({ width: 400, contentHeight: 240, scale: 2 }),
    status: vi.fn(),
  };

  try {
    scene.update();
    expect(scene.sprite.mask).toBe(scene.rectMask);
    expect(scene.rectMask.x + scene.rectMask.width / 2).toBe(400);
    expect(scene.rectMask.y + scene.rectMask.height / 2).toBe(240);

    for (const shape of ['Circle', 'Ellipse', 'Polygon']) {
      scene.panel.values.shape = shape;
      scene.update();
      expect(scene.sprite.mask).toBe(scene.shapeMask);
      const bounds = scene.shapeMask.getBounds();
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      expect(bounds.x + bounds.width / 2).toBeCloseTo(400, 1);
      expect(bounds.y + bounds.height / 2).toBeCloseTo(240, 1);
    }
  } finally {
    scene.sprite.destroy();
    Exo.Scene.prototype.destroy.call(scene);
  }
});
