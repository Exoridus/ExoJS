import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';

import { GallerySceneTransition } from '../../examples/shared/gallery-transitions';

interface DirectScene extends Exo.Scene {
  sprite: Exo.Sprite;
  background: Exo.Graphics;
  playing: boolean;
}

const scenes: DirectScene[] = [];
class Control extends Exo.Container {
  readonly onChange = new Exo.Signal();
  readonly onClick = new Exo.Signal();

  setSize() {
    return this;
  }

  close() {}
}

const load = (path: string, names: string) => {
  const source = readFileSync(`examples/${path}.ts`, 'utf8');
  const body = source.slice(0, source.indexOf('const app = new Application(')).replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

  return runInNewContext(`${compiled}\n({${names}})`, {
    ...Exo,
    GallerySceneTransition,
    Panel: Control,
    Dropdown: Control,
    Button: Control,
    Label: Control,
    unitsPerCssPixel: () => 1,
    demoPanel: () => ({ dispose() {} }),
  }) as Record<string, new () => DirectScene>;
};

const mount = (Scene: new () => DirectScene) => {
  const scene = new Scene();
  const change = vi.fn(async (_scene: unknown, _options: { transition: Exo.SceneTransition }) => undefined);
  Object.defineProperty(scene, 'app', {
    value: {
      width: 1280,
      height: 720,
      canvas: document.createElement('canvas'),
      clearColor: new Exo.Color(),
      scenes: { change },
    },
  });
  Object.defineProperty(scene, 'inputs', { value: { onTrigger() {}, attach() {} } });
  Object.defineProperty(scene, 'ui', { value: new Exo.Container() });
  scenes.push(scene);

  return { scene, change };
};

afterEach(() => {
  for (const scene of scenes.splice(0)) {
    scene.ui.destroy();
    Exo.Scene.prototype.destroy.call(scene);
  }
});

it('ignores the key tile padding while keeping the visible key clickable through rotation', () => {
  const { HelloWorldScene } = load('getting-started/hello-world', 'HelloWorldScene');
  const { scene } = mount(HelloWorldScene!);
  scene.sprite = new Exo.Sprite(null).setLocalBounds(0, 0, 64, 64);
  scene.init();

  for (const rotation of [0, 45, 120]) {
    scene.sprite.rotation = rotation;
    const transform = scene.sprite.getGlobalTransform();
    const point = (x: number, y: number) => ({
      x: transform.a * x + transform.b * y + transform.x,
      y: transform.c * x + transform.d * y + transform.y,
    });
    const key = point(32, 32);
    const padding = point(32, 4);
    expect(scene.sprite.contains(key.x, key.y)).toBe(true);
    expect(scene.sprite.contains(padding.x, padding.y)).toBe(false);
  }
});

it.each(['multiple-scenes', 'custom-transition'])('%s changes scenes by tapping the scene itself', path => {
  const module = load(`application-scenes/${path}`, 'MenuScene, GameScene');
  const { scene, change } = mount(module.MenuScene!);
  scene.init();
  expect(scene.background?.interactive).toBe(true);
  scene.background.onPointerTap.dispatch({} as never);
  expect(change).toHaveBeenCalledExactlyOnceWith(module.GameScene, { transition: expect.any(Exo.SceneTransition) });
});

it('cycles all eight gallery effects through direct taps without queuing duplicate scene changes', async () => {
  const { HarborScene } = load('application-scenes/transition-gallery', 'HarborScene');
  const { scene, change } = mount(HarborScene!);
  scene.init();
  expect(scene.background.interactive).toBe(true);

  for (let index = 0; index < 8; index++) {
    scene.background.onPointerTap.dispatch({} as never);
    scene.background.onPointerTap.dispatch({} as never);
    await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(index + 1));
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const effects = change.mock.calls.map(([, options]) => options.transition);
  expect(new Set(effects).size).toBe(8);
  expect(effects[0]).toBeInstanceOf(Exo.FadeSceneTransition);
  expect(effects[1]).toBeInstanceOf(Exo.CrossFadeSceneTransition);
  expect(effects.slice(2, 5).every(effect => effect instanceof Exo.SlideSceneTransition)).toBe(true);
  expect(effects.slice(5).every(effect => effect instanceof GallerySceneTransition)).toBe(true);
});
