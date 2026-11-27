import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { afterEach, expect, it } from 'vitest';

const source = readFileSync('examples/spatial-audio/listener-and-source.ts', 'utf8');
const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

interface SpatialScene extends Exo.Scene {
  source: { x: number; y: number };
  dragging: boolean;
  panel: { values: { orbit: boolean } };
  onDown(pointer: unknown, x: number, y: number): void;
  onMove(pointer: unknown, x: number, y: number): void;
  onUp(): void;
}

const scenes: SpatialScene[] = [];

afterEach(() => {
  for (const scene of scenes.splice(0)) {
    Exo.Scene.prototype.destroy.call(scene);
  }
});

const createScene = (locked: boolean) => {
  const audio = { locked, listener: { target: null, position: { x: 0, y: 0 } } };
  let hit: Exo.RenderNode | null = null;
  const scene = runInNewContext(`${compiled}\nnew ListenerAndSourceScene()`, {
    ...Exo,
    Sound: class {},
    AudioBuffer: class {
      getChannelData() {
        return new Float32Array(48000);
      }
    },
    window: { addEventListener() {} },
    toggle: (_label: string, value: boolean) => ({ value }),
    choice: (_label: string, values: string[]) => ({ value: values[0] }),
    demoPanel: (options: { onChange(key: string, value: boolean, values: object): void }) => {
      const values = { orbit: true, sound: true, falloff: 'linear' };

      return {
        values,
        fit: () => ({ scale: 1, width: 1280, contentHeight: 560 }),
        set: (_key: string, value: boolean) => {
          values.orbit = value;
          options.onChange('orbit', value, values);
        },
      };
    },
  }) as SpatialScene;
  Object.defineProperty(scene, 'app', {
    value: {
      audio,
      canvas: {},
      interaction: { nodeAt: () => hit },
      input: { onPointerDown: new Exo.Signal(), onPointerMove: new Exo.Signal(), onPointerUp: new Exo.Signal() },
    },
  });
  Object.defineProperty(scene, 'inputs', { value: { attach() {} } });
  scene.init();
  scenes.push(scene);

  return { scene, audio, hitUI: () => (hit = new Exo.Container()) };
};

it('keeps orbiting when audio unlocks before its queued first pointer press is delivered', () => {
  const { scene, audio } = createScene(true);
  scene.update(Exo.Time.seconds(0));
  audio.locked = false;
  const before = { ...scene.source };
  scene.onDown({}, 300, 200);
  expect(scene.panel.values.orbit).toBe(true);
  expect(scene.source).toEqual(before);
  expect(scene.dragging).toBe(false);

  scene.update(Exo.Time.seconds(0));
  scene.onDown({}, 400, 250);
  expect(scene.panel.values.orbit).toBe(false);
  expect(scene.source).toEqual({ x: 400, y: 250 });
});

it('ignores a popup row above the control bar while orbiting', () => {
  const { scene, hitUI } = createScene(false);
  const popup = hitUI();
  const before = { ...scene.source };

  try {
    scene.onDown({}, 380, 500);
    expect(scene.panel.values.orbit).toBe(true);
    expect(scene.source).toEqual(before);
    expect(scene.dragging).toBe(false);
  } finally {
    popup.destroy();
  }
});

it('places an already unlocked source, drags it, and stops moving after release', () => {
  const { scene } = createScene(false);
  scene.onDown({}, 300, 200);
  expect(scene.panel.values.orbit).toBe(false);
  expect(scene.source).toEqual({ x: 300, y: 200 });
  scene.onMove({}, 450, 250);
  expect(scene.source).toEqual({ x: 450, y: 250 });
  scene.onUp();
  scene.onMove({}, 600, 350);
  expect(scene.source).toEqual({ x: 450, y: 250 });
  expect(scene.dragging).toBe(false);
});
