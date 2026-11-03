import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as Exo from '@codexo/exojs';
import * as Particles from '@codexo/exojs/particles';
import * as Aseprite from '@codexo/exojs-aseprite';
import { pixelVfxAssets as assets } from '@codexo/exojs-demo-assets/pixel-vfx';
import ts from 'typescript';

import type { SceneScope } from '#core/scene/SceneScope';

import { demoPanel, toggle } from '../../examples/shared/runtime.ts';
import { createUIApp } from '../support/text-field-harness';

interface GalleryScene extends Exo.Scene {
  sparks: Particles.ParticleSystem;
  smoke: Particles.ParticleSystem;
  cards: Array<{ sprites: Exo.AnimatedSprite[]; panel: Exo.Panel }>;
  panel: { set(key: 'playing' | 'live' | 'loop', value: boolean): void };
  nextFrame(card: GalleryScene['cards'][number]): void;
}

const createGallery = async (): Promise<{ scene: GalleryScene; systems: Exo.SystemRegistry; dispose(): void }> => {
  const source = readFileSync('examples/showcase/pixel-vfx-gallery.ts', 'utf8').split('const app = new Application(')[0]!;
  const body = source.replace(/^import[\s\S]*?from '[^']+';\s*/gm, '');
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const Gallery = runInNewContext(`${compiled}\nPixelVfxGalleryScene`, {
    ...Exo,
    ...Particles,
    ...Aseprite,
    assets,
    demoPanel,
    siteUITheme: () => Exo.defaultUITheme,
    toggle,
  });
  const scene = new Gallery() as GalleryScene;
  const harness = createUIApp();
  const systems = new Exo.SystemRegistry();
  const textures: Exo.Texture[] = [];
  const loader = {
    load: async (asset: { type: string; source: string }): Promise<unknown> => {
      const path = asset.source.split('/media/')[1]!;
      const bytes = readFileSync(`examples/assets/${path}`);

      if (asset.type === 'json') {
        return JSON.parse(bytes.toString('utf8'));
      }

      const canvas = document.createElement('canvas');
      canvas.width = bytes.readUInt32BE(16);
      canvas.height = bytes.readUInt32BE(20);
      const texture = new Exo.Texture(canvas);
      textures.push(texture);

      return texture;
    },
  };
  scene._attach(harness.scene.app, { systems, loader } as unknown as SceneScope<void>);
  await scene.load();
  scene.init();

  return {
    scene,
    systems,
    dispose: () => {
      scene.destroy();
      scene._teardownInternals();
      systems.destroy();
      harness.scene._teardownInternals();
      textures.forEach(texture => texture.destroy());
    },
  };
};

test('both live emitters run immediately and pause through the native control', async () => {
  const { scene, systems, dispose } = await createGallery();

  try {
    systems._update(Exo.Time.seconds(0.2));
    expect(scene.sparks.aliveCount).toBeGreaterThan(0);
    expect(scene.smoke.aliveCount).toBeGreaterThan(0);
    scene.panel.set('live', false);
    const counts = [scene.sparks.aliveCount, scene.smoke.aliveCount];
    systems._update(Exo.Time.seconds(5));
    expect([scene.sparks.aliveCount, scene.smoke.aliveCount]).toEqual(counts);
    scene.panel.set('live', true);
    expect(systems.has(scene.sparks)).toBe(true);
    expect(systems.has(scene.smoke)).toBe(true);
  } finally {
    dispose();
  }
});

test.each([
  { cardIndex: 0, loop: true, label: 'a looping one-shot preview' },
  { cardIndex: 3, loop: false, label: 'authored looping smoke' },
])('stepping then resuming preserves $label', async ({ cardIndex, loop }) => {
  const { scene, dispose } = await createGallery();

  try {
    const card = scene.cards[cardIndex]!;
    scene.panel.set('loop', loop);
    scene.nextFrame(card);
    scene.panel.set('playing', true);

    for (const sprite of card.sprites) {
      sprite.update(3);
    }

    expect(card.sprites.map(sprite => sprite.playing)).toEqual([true, true]);
  } finally {
    dispose();
  }
});

test('manual stepping keeps both native previews on the same authored frame', async () => {
  const { scene, dispose } = await createGallery();

  try {
    const card = scene.cards[0]!;
    scene.nextFrame(card);
    expect(card.sprites.map(sprite => sprite.currentFrame)).toEqual([1, 1]);
    expect(card.sprites.map(sprite => sprite.playing)).toEqual([false, false]);
    expect(card.sprites.map(sprite => sprite.scale.x)).toEqual([1, 2]);
    expect(card.sprites.every(sprite => sprite.texture?.scaleMode === Exo.ScaleModes.Nearest)).toBe(true);
  } finally {
    dispose();
  }
});
