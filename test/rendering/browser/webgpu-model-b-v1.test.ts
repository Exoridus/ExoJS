import { expect, test, vi } from 'vitest';

import { Sound } from '#audio/Sound';
import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { LoadingSceneTransition } from '#core/scene/transitions/LoadingSceneTransition';
import { Prefab } from '#core/serialization/Prefab';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';

import { Atlas, type AtlasDocument, atlasMigrations, AtlasParser } from '../../assets/atlas-document-pilot';
import atlasV1 from '../../fixtures/documents/atlas-v1.json';
import { webGpuAvailable } from './_backendSetup';

test.for(['webgl2', 'webgpu'] as const)(
  'registered document migrations and live scene assets work in one Application on %s',
  async (type, context) => {
    if (type === 'webgpu' && !(await webGpuAvailable())) {
      context.skip('no WebGPU adapter');
    }

    const sample = new URL('../../../examples/assets/audio/digital-sound-sprite.ogg', import.meta.url);
    const audio = await (await fetch(sample)).blob();
    const source = new OffscreenCanvas(16, 16);
    const drawing = source.getContext('2d')!;
    drawing.fillStyle = '#ff0000';
    drawing.fillRect(0, 0, 16, 16);
    const png = await source.convertToBlob({ type: 'image/png' });
    const webp = await source.convertToBlob({ type: 'image/webp' });
    expect(webp.type).toBe('image/webp');

    const fetchAsset = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
      if (typeof path !== 'string') {
        throw new Error('Expected an asset request path');
      }

      switch (path) {
        case 'theme.ogg':
          return new Response(audio);
        case 'ui.atlas.json':
          return Response.json(atlasV1);
        case 'variant@2x.webp':
          return new Response(webp);
        case 'hero.png':
          return new Response(png);
        default:
          throw new Error(`Unexpected asset request: ${path}`);
      }
    });
    const explicit = new Texture('variant@2x.webp');
    const sound = new Sound('theme.ogg');
    const textureReference = {
      $type: 'texture',
      source: 'variant@{1,2}x.{webp,png}',
      options: { textureOptions: { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat } },
    };
    const prefab = Prefab.fromJSON({ version: 4, root: { type: 'Sprite', texture: textureReference } });
    const parser = new AtlasParser();
    const parse = vi.spyOn(parser, 'parse');
    let demand!: Sprite;
    let demandTexture!: Texture;
    let variant!: Sprite;
    let variantTexture!: Texture;
    let loadedSource!: Texture['source'];

    class MainScene extends Scene {
      public override async load(): Promise<void> {
        expect(fetchAsset).not.toHaveBeenCalled();
        await expect(this.app.assets.load([explicit, sound])).resolves.toEqual([explicit, sound]);
        const atlas = await this.app.loader.load('ui.atlas.json');
        expect(atlas).toBeInstanceOf(Atlas);
        expect((atlas as Atlas).document).toEqual({
          density: 1,
          pages: [{ $type: 'texture', source: 'ui.png' }],
          frames: [{ name: 'button', page: 0, x: 0, y: 0, width: 32, height: 16, pivotX: 0.5, pivotY: 0.5 }],
        });
        expect(parse).toHaveBeenCalledTimes(1);
        expect(parse).toHaveBeenCalledWith((atlas as Atlas).document);
      }

      public override init(): void {
        demand = new Sprite('hero.png');
        demandTexture = demand.texture as Texture;
        variant = prefab.instantiate(this.app.loader) as Sprite;
        variantTexture = variant.texture as Texture;
        variant.setPosition(16, 0);
        expect(variantTexture.loadState).toBe('idle');
        expect(fetchAsset).toHaveBeenCalledTimes(3);
        this.addChild(demand);
        this.addChild(variant);
        this.addChild(new Sprite(explicit).setPosition(16, 8));
      }
    }

    class EmptyScene extends Scene {}

    const app = new Application({
      backend: { type },
      canvas: { width: 32, height: 16, pixelRatio: 2 },
      clearColor: Color.black,
      hello: false,
      rendering: { webglAttributes: { preserveDrawingBuffer: true } },
      scenes: { MainScene, EmptyScene },
      assetTypes: [
        [
          Atlas,
          {
            type: 'atlas',
            extensions: ['atlas.json'],
            version: 3,
            migrations: atlasMigrations,
            parser,
            loader: { create: async (document: AtlasDocument) => new Atlas(document) },
          },
        ],
      ],
    });

    try {
      await app.start(MainScene);
      expect(app.loader.variants.profile.imageFormats).toContain('webp');
      expect(sound.ready).toBe(true);
      await Promise.all([demandTexture.loaded, variantTexture.loaded]);
      loadedSource = explicit.source;
      expect(demand.texture).toBe(demandTexture);
      expect(variant.texture).toBe(variantTexture);
      expect(variantTexture.source).toBe(loadedSource);
      expect(variantTexture.scaleMode).toBe(ScaleModes.Nearest);
      expect(variantTexture.wrapMode).toBe(WrapModes.Repeat);
      expect(variant.textureFrame.width).toBe(16);
      expect(variant.width).toBe(8);
      expect(Prefab.from(variant, app.loader).toJSON().root.texture).toEqual(textureReference);
      expect(fetchAsset.mock.calls.map(([path]) => path).sort()).toEqual(['hero.png', 'theme.ogg', 'ui.atlas.json', 'variant@2x.webp']);

      const readback = new OffscreenCanvas(app.canvas.width, app.canvas.height).getContext('2d')!;
      await expect
        .poll(() => {
          app.update();
          readback.drawImage(app.canvas, 0, 0);

          return [
            readback.getImageData(8, 8, 1, 1).data[0]! > 240,
            readback.getImageData(40, 8, 1, 1).data[0]! > 240,
            readback.getImageData(52, 8, 1, 1).data[0],
            readback.getImageData(52, 24, 1, 1).data[0]! > 240,
          ];
        })
        .toEqual([true, true, 0, true]);

      const overlay = new Container();
      const transition = new LoadingSceneTransition({ createOverlay: () => ({ node: overlay }) });
      await app.scenes.change(EmptyScene, { transition });
      expect(overlay.destroyed).toBe(true);
      expect(demandTexture.source).toBeNull();
      expect(explicit.source).toBe(loadedSource);
    } finally {
      await app.destroy();
      fetchAsset.mockRestore();
    }

    expect(explicit.source).not.toBe(loadedSource);
    await expect(explicit.loaded).rejects.toMatchObject({ name: 'AbortError' });
  },
);
