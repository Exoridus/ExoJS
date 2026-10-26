import { type Application, Color, Signal, Text, Texture, Time } from '@codexo/exojs';

import type { SceneScope } from '#core/scene/SceneScope';

import { DialogScene } from '../../examples/guides/ui-patterns/dialog';

test('dialog tap completes the visible line immediately and detaches when the scene ends', () => {
  const taps = new Signal<[]>();
  const texture = Texture.fromColor(Color.white, 1);
  const app = { input: { onPointerTap: taps }, audio: { play: vi.fn() } } as unknown as Application;
  const scope = {
    loader: { get: (path: string) => (path.endsWith('.png') ? texture : {}) },
    audio: { play: vi.fn() },
  } as unknown as SceneScope<void>;
  const scene = new DialogScene();
  scene._attach(app, scope);
  scene.init();
  scene.update(Time.seconds(0.08));
  const text = scene.root.children.find(node => node instanceof Text)!;

  expect(text?.text).toBe('Co');
  taps.dispatch();
  expect(text.text).toBe('Commander, the anomaly has entered low orbit.');
  scene.update(Time.seconds(1));
  expect(text.text).toBe('Commander, the anomaly has entered low orbit.');
  taps.dispatch();
  expect(text.text).toBe('');
  scene.update(Time.seconds(0.04));
  expect(text.text).toBe('A');

  scene._teardownInternals();
  expect(taps.count).toBe(0);
  texture.destroy();
});
