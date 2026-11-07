import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

type FilterScene = Exo.Scene & Record<string, unknown>;

const loadScene = (path: string): FilterScene => {
  const source = readFileSync(`examples/${path}.ts`, 'utf8').split('const app = new Application(')[0]!;
  const name = /class (\w+) extends Scene/.exec(source)![1]!;
  const body = source.replace(/^import[\s\S]*?from '[^']+';\s*/gm, '').replace(/^export \{[^}]+\};/gm, '');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const Scene = runInNewContext(`${compiled}\n${name}`, {
    ...Exo,
    assets,
    Uint8Array,
    Uint8ClampedArray,
    Float32Array,
    Label: class extends Exo.Container {
      anchorIn() {
        return this;
      }
    },
    document: {
      createElement: (tag: string) => {
        const canvas = document.createElement(tag) as HTMLCanvasElement;
        Object.assign(canvas.getContext('2d')!, {
          createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
          putImageData() {},
        });

        return canvas;
      },
      addEventListener() {},
    },
    mountControls: () => ({ setStatus() {}, dispose() {} }),
    demoPanel: () => ({ status() {}, dispose() {} }),
    slider: () => ({}),
    toggle: () => ({}),
    choice: () => ({}),
  }) as new () => FilterScene;
  const scene = new Scene();
  const tween = { to: () => tween, start: () => tween, stop() {} };
  Object.defineProperties(scene, {
    app: {
      value: {
        width: 1280,
        height: 720,
        clearColor: new Exo.Color(),
        input: {
          onPointerMove: new Exo.Signal(),
          onPointerDown: new Exo.Signal(),
          onPointerUp: new Exo.Signal(),
          onPointerCancel: new Exo.Signal(),
          onPointerTap: new Exo.Signal(),
        },
        tweens: { create: () => tween },
      },
    },
    loader: {
      value: {
        get: () => Exo.Texture.empty,
        load: async (asset: unknown) =>
          asset === assets.platformerCharactersAtlas
            ? { frames: { character_green_front: { frame: { x: 0, y: 0, w: 16, h: 16 } } } }
            : Exo.Texture.empty,
      },
    },
    inputs: { value: { attach() {}, onTrigger() {}, onActive() {}, onStop() {} } },
  });

  return scene;
};

it.each([
  ['filters/custom-fragment-shader', ['filter']],
  ['filters/chromatic-aberration', ['filter']],
  ['filters/displacement-filter', ['ripple']],
  ['filters/drop-shadow-filter', ['shadow']],
  ['filters/filter-stack', ['blur', 'tint', 'custom']],
  ['filters/metaballs', ['blur', 'threshold']],
  ['filters/noise-vignette', ['filter']],
  ['filters/palette-cycling', ['filter']],
  ['geometry-graphics/infinite-grid', ['filter']],
  ['text-fonts/text-glitch', ['filter']],
  ['showcase/color-grading', ['filter']],
  ['showcase/loading-progress-with-shader', ['filter']],
  ['showcase/orb-dodge', ['blur']],
  ['showcase/pause-blur', ['blur']],
  ['guides/filters/wave-filter', ['waveFilter']],
  ['guides/pause-menu/pause-scene', ['blur']],
  ['guides/post-processing/blur-pipeline', ['blur']],
  ['guides/post-processing/bloom-pipeline', ['blur']],
  ['guides/post-processing/nested-passes', ['blur', 'color']],
] as const)('%s releases every owned filter when the scene ends', async (path, fields) => {
  const scene = loadScene(path);
  await scene.load();
  scene.init();
  const releases = fields.map(field => vi.spyOn(scene[field] as Exo.Filter, 'destroy'));

  scene.destroy();
  scene._teardownInternals();

  for (const release of releases) {
    expect(release).toHaveBeenCalledTimes(1);
  }
});

it('keeps a shared example filter alive until its scene owner releases it exactly once', () => {
  const scene = loadScene('filters/custom-fragment-shader');
  scene.init();
  const filter = scene.filter as Exo.Filter;
  const release = vi.spyOn(filter, 'destroy');
  const sibling = new Exo.Sprite();
  sibling.filters = [filter];

  (scene.sprite as Exo.Sprite).destroy();
  expect(release).not.toHaveBeenCalled();

  scene.destroy();
  scene._teardownInternals();
  expect(release).toHaveBeenCalledTimes(1);

  sibling.destroy();
  expect(release).toHaveBeenCalledTimes(1);
});
