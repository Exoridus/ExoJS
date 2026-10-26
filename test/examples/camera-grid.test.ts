import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { expect, it } from 'vitest';

const source = readFileSync('examples/application-scenes/world-vs-screen-coords.ts', 'utf8');
const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

it.each([0.3, 1, 3])('keeps grid strokes one displayed pixel wide at zoom %s', zoom => {
  const scene = runInNewContext(`${compiled}\nObject.create(CameraNavigationScene.prototype)`, { ...Exo });
  const scale = 1280 / 900;
  Object.assign(scene, {
    view: new Exo.View(640, 360, 1280, 720).setZoom(zoom),
    grid: new Exo.Graphics(),
    labels: [],
    pointer: { x: 300, y: 200 },
    actions: { pan: { value: { x: 0, y: 0 } } },
    panel: { fit: () => ({ scale }), status: () => {} },
  });
  Object.defineProperty(scene, 'app', { value: { canvas: document.createElement('canvas') } });

  try {
    scene.update(Exo.Time.seconds(0));
    expect((scene.grid.lineWidth * zoom) / scale).toBeCloseTo(1);
    expect(scene.grid.children.length).toBeGreaterThan(100);
    const point = scene.view.worldToScreen(scene.world.x, scene.world.y);
    expect(point.x).toBeCloseTo(300);
    expect(point.y).toBeCloseTo(200);
  } finally {
    scene.grid.destroy();
    scene.view.destroy();
  }
});
