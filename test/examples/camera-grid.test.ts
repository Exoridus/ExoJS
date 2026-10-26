import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

interface CameraScene extends Exo.Scene {
  view: Exo.View;
  target: Exo.Graphics;
  actions: { move: { value: { x: number; y: number } } };
}

const source = readFileSync('examples/application-scenes/world-vs-screen-coords.ts', 'utf8');
const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

const createScene = () => {
  const SceneClass = runInNewContext(`${compiled}\nCameraNavigationScene;`, {
    ...Exo,
    window,
    unitsPerCssPixel: () => 1,
  }) as new () => CameraScene;
  const scene = new SceneClass();
  const input = {
    onPointerDown: new Exo.Signal<[Exo.Pointer, number, number]>(),
    onPointerMove: new Exo.Signal<[Exo.Pointer, number, number]>(),
    onPointerUp: new Exo.Signal<[Exo.Pointer, number, number]>(),
    onPointerCancel: new Exo.Signal<[Exo.Pointer, number, number]>(),
    onMouseWheel: new Exo.Signal<[number, number]>(),
  };
  const triggers = new Map<number, () => void>();
  Object.defineProperty(scene, 'app', { value: { width: 1280, height: 720, canvas: document.createElement('canvas'), input } });
  Object.defineProperty(scene, 'inputs', {
    value: { attach: vi.fn(), onTrigger: (key: number, callback: () => void) => triggers.set(key, callback) },
  });
  scene.init();
  scene.actions = { move: { value: { x: 0, y: 0 } } };

  return { scene, input, triggers };
};

it.each([60, 144])('moves the visible subject and follows it at %i Hz', rate => {
  const { scene } = createScene();

  try {
    scene.actions.move.value.x = 1;

    for (let frame = 0; frame < rate; frame++) {
      scene.update(Exo.Time.seconds(1 / rate));
      scene.view.update(1000 / rate);
    }

    expect(scene.target.x).toBeCloseTo(960);
    expect(scene.view.center.x).toBeCloseTo(scene.target.x);
  } finally {
    scene.destroy();
  }
});

it.each([0.4, 1, 3])('anchors wheel zoom at the same-frame pointer position from zoom %s', zoom => {
  const { scene, input } = createScene();
  const pointer = { id: 7 } as Exo.Pointer;

  try {
    scene.view.setZoom(zoom);
    const before = scene.view.screenToWorld(1000, 300);
    input.onMouseWheel.dispatch(0, -200);
    input.onPointerMove.dispatch(pointer, 1000, 300);
    scene.update(Exo.Time.seconds(0));
    scene.view.update(0);
    const after = scene.view.screenToWorld(1000, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(scene.view.zoomLevel).toBeCloseTo(Math.min(3, zoom * Math.exp(0.2)));
  } finally {
    scene.destroy();
  }
});

it('pans only in free mode and releases its input listeners on teardown', () => {
  const { scene, input, triggers } = createScene();
  const pointer = { id: 7 } as Exo.Pointer;

  try {
    input.onPointerDown.dispatch(pointer, 500, 350);
    input.onPointerMove.dispatch(pointer, 620, 410);
    expect(scene.view.center.x).toBe(640);
    triggers.get(Exo.Keyboard.F)!();
    input.onPointerDown.dispatch(pointer, 500, 350);
    input.onPointerMove.dispatch(pointer, 620, 410);
    expect(scene.view.center.x).toBe(520);
    expect(scene.view.center.y).toBe(300);
    input.onPointerCancel.dispatch(pointer, 620, 410);
    input.onPointerMove.dispatch(pointer, 700, 450);
    expect(scene.view.center.x).toBe(520);
  } finally {
    scene.destroy();
  }

  expect(Object.values(input).every(signal => signal.count === 0)).toBe(true);
});
