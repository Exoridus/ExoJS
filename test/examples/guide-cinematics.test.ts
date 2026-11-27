import { type Application, Color, type RenderingContext, Sprite, Text, Texture, Time, TweenSystem } from '@codexo/exojs';

import type { SceneScope } from '#core/scene/SceneScope';
import { SceneState } from '#core/scene/SceneState';
import { SceneTweens } from '#core/scene/SceneTweens';

import { CinematicScene } from '../../examples/guides/cinematics/cinematic-scene';

class SkippableCinematic extends CinematicScene {
  public skip(): void {
    this.stopAndSnap();
  }
}

test('skipping a cinematic snaps its visible state and stops only its own tweens', async () => {
  const system = new TweenSystem();
  const voice = { volume: 0.2 };
  const app = { tweens: system, clearColor: Color.black.clone(), audio: { play: () => voice } } as unknown as Application;
  const tweens = new SceneTweens(app, () => SceneState.Active);
  tweens.activate();
  const texture = Texture.fromColor(Color.white, 1);
  const scope = {
    tweens,
    loader: { load: async (asset: unknown) => (typeof asset === 'string' ? texture : {}) },
    audio: { play: () => voice },
  } as unknown as SceneScope<void>;
  const scene = new SkippableCinematic();
  scene._attach(app, scope);
  await scene.load();
  scene.init();
  const unrelated = { value: 0 };
  system.create(unrelated).to({ value: 1 }, 2).start();
  system.preFrame(Time.seconds(0.5));

  scene.skip();
  system.preFrame(Time.seconds(0.5));
  expect(unrelated.value).toBeCloseTo(0.5);
  expect(voice.volume).toBe(0.85);
  system.preFrame(Time.seconds(1));
  const nodes: unknown[] = [];
  scene.draw({ render: (node: unknown) => nodes.push(node) } as unknown as RenderingContext);
  expect(nodes.find(node => node instanceof Sprite)).toMatchObject({ scale: { x: 2.1, y: 2.1 } });
  expect(nodes.find(node => node instanceof Text)).toMatchObject({ text: 'VOID EMPEROR' });

  tweens.destroy();
  scene._teardownInternals();
  system.destroy();
  texture.destroy();
});
