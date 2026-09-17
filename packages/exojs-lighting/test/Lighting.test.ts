import {
  type Application,
  Color,
  ColorMatrixFilter,
  Container,
  type Filter,
  Matrix,
  Rectangle,
  RenderPipeline,
  RenderTexture,
  Signal,
  Sprite,
  Texture,
  TextureFormat,
} from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import type { ForwardBackend } from '../src/backends/ForwardBackend';
import type { LightmapBackend } from '../src/backends/LightmapBackend';
import { Lighting } from '../src/Lighting';
import { LineLight } from '../src/lights/LineLight';
import { PointLight } from '../src/lights/PointLight';
import { SpotLight } from '../src/lights/SpotLight';
import { LitMaterial } from '../src/LitMaterial';
import { normalMap } from '../src/normals/Normals';

const channels = 4;

/** The packed texture the forward renderer publishes into. */
const textureOf = (lighting: Lighting): (typeof ForwardBackend.prototype)['lightTexture'] => (lighting.backend as ForwardBackend).lightTexture;

/**
 * Enough of an application for a renderer that never draws here: a frame slot,
 * a frame to multiply, a surface size, and an answer about float targets.
 */
const fakeApp = (floatTargets = true): Application =>
  ({
    framePasses: new RenderPipeline(),
    frameTexture: new RenderTexture(64, 64),
    onResize: new Signal(),
    rendering: {
      supportsColorFormat: (format: TextureFormat): boolean => format === TextureFormat.Rgba8 || floatTargets,
      // The world view the light field and the occluder mask are drawn through.
      view: { getBounds: (): Rectangle => new Rectangle(0, 0, 64, 64) },
    },
    width: 64,
    height: 64,
  }) as unknown as Application;

/** A `Lighting` on the renderer that reads occluders. */
const lightmapLighting = (floatTargets = true): Lighting => new Lighting({ quality: 'lightmap', app: fakeApp(floatTargets), ambient: Color.black });

/** Byte offset of light `index`'s slot in row `row`. */
const slot = (lighting: Lighting, row: number, index: number): number => (textureOf(lighting).width * row + index + 1) * channels;

describe('Lighting', () => {
  test('allocates one header column plus one column per light slot, three rows deep', () => {
    const lighting = new Lighting({ maxLights: 8 });
    const texture = textureOf(lighting);

    expect(texture.format).toBe(TextureFormat.Rgba32F);
    expect(texture.width).toBe(9);
    expect(texture.height).toBe(3);
  });

  test('publishes the light count and the ambient term in the header column', () => {
    const lighting = new Lighting({ maxLights: 4, ambient: new Color(51, 102, 153) });

    lighting.add(new PointLight());
    lighting.add(new PointLight());
    lighting.update();

    const buffer = textureOf(lighting).buffer;

    expect(buffer[0]).toBe(2);
    expect(lighting.activeLightCount).toBe(2);
    expect(buffer[textureOf(lighting).width * channels]).toBeCloseTo(51 / 255, 6);
  });

  test('a light publishes the world position its transform gives it', () => {
    const lighting = new Lighting({ maxLights: 2 });
    const carrier = new Container().setPosition(300, 120);
    const light = lighting.add(new PointLight({ radius: 90 }));

    carrier.addChild(light.setPosition(20, 5));
    lighting.update();

    const buffer = textureOf(lighting).buffer;
    const offset = slot(lighting, 0, 0);

    expect(buffer[offset]).toBeCloseTo(320, 5);
    expect(buffer[offset + 1]).toBeCloseTo(125, 5);
    expect(buffer[offset + 2]).toBe(90);
  });

  test('a disabled light and one without intensity are skipped, and the rest close the gap', () => {
    const lighting = new Lighting({ maxLights: 4 });

    lighting.add(new PointLight({ enabled: false, radius: 10 }));
    lighting.add(new PointLight({ intensity: 0, radius: 20 }));
    lighting.add(new PointLight({ radius: 30 }));
    lighting.update();

    const buffer = textureOf(lighting).buffer;

    expect(lighting.activeLightCount).toBe(1);
    expect(buffer[0]).toBe(1);
    expect(buffer[slot(lighting, 0, 0) + 2]).toBe(30);
  });

  test('lights beyond the renderer capacity are dropped rather than overwriting the last slot', () => {
    const lighting = new Lighting({ maxLights: 2 });

    lighting.add(new PointLight({ radius: 1 }));
    lighting.add(new PointLight({ radius: 2 }));
    lighting.add(new PointLight({ radius: 3 }));
    lighting.update();

    const buffer = textureOf(lighting).buffer;

    expect(lighting.activeLightCount).toBe(2);
    expect(buffer[slot(lighting, 0, 1) + 2]).toBe(2);
  });

  test('a point light writes a cone no direction can fail', () => {
    const lighting = new Lighting({ maxLights: 1 });

    lighting.add(new PointLight());
    lighting.update();

    const buffer = textureOf(lighting).buffer;
    const cone = slot(lighting, 2, 0);

    expect(buffer[cone + 2]).toBe(-1);
    expect(buffer[cone + 3]).toBe(-1);
  });

  test('a spot light aims along its own rotation and fades across its cone softness', () => {
    const lighting = new Lighting({ maxLights: 1 });
    const spot = lighting.add(new SpotLight({ angle: 60, coneSoftness: 0.5 }));

    // Unrotated, the cone points along the node's local +x.
    lighting.update();
    expect(textureOf(lighting).buffer[slot(lighting, 2, 0)]).toBeCloseTo(1, 5);

    // Rotation is in degrees, and the cone turns with the node - a quarter turn
    // lands the axis on the engine's -y, which is up the screen.
    spot.rotation = 90;
    lighting.update();

    const buffer = textureOf(lighting).buffer;
    const cone = slot(lighting, 2, 0);

    expect(buffer[cone]).toBeCloseTo(0, 5);
    expect(buffer[cone + 1]).toBeCloseTo(-1, 5);
    // Outer edge at 60 degrees, inner edge at 30 - the fade starts halfway in.
    expect(buffer[cone + 2]).toBeCloseTo(Math.cos((60 * Math.PI) / 180), 5);
    expect(buffer[cone + 3]).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 5);
  });

  test('a hard-edged spot collapses both cone cosines onto one value', () => {
    const lighting = new Lighting({ maxLights: 1 });

    lighting.add(new SpotLight({ angle: 45, coneSoftness: 0 }));
    lighting.update();

    const buffer = textureOf(lighting).buffer;
    const cone = slot(lighting, 2, 0);

    expect(buffer[cone + 2]).toBeCloseTo(buffer[cone + 3]!, 6);
  });

  test('registering a light twice shades it once', () => {
    const lighting = new Lighting({ maxLights: 4 });
    const light = new PointLight();

    lighting.add(light);
    lighting.add(light);
    lighting.update();

    expect(lighting.lights).toHaveLength(1);
    expect(lighting.activeLightCount).toBe(1);
  });

  test('registering with a second system moves the light rather than shading it twice', () => {
    const first = new Lighting({ maxLights: 4 });
    const second = new Lighting({ maxLights: 4 });
    const light = new PointLight();

    first.add(light);
    second.add(light);

    expect(first.lights).toHaveLength(0);
    expect(second.lights).toHaveLength(1);
  });

  test('destroying a registered light unregisters it', () => {
    const lighting = new Lighting({ maxLights: 4 });
    const light = lighting.add(new PointLight());

    light.destroy();

    expect(lighting.lights).toHaveLength(0);
  });

  test('destroying the system unregisters its lights without destroying them', () => {
    const lighting = new Lighting({ maxLights: 4 });
    const light = lighting.add(new PointLight());

    lighting.destroy();

    expect(lighting.lights).toHaveLength(0);
    expect(light.destroyed).toBe(false);
  });
  test('registering an occluder source twice collects it once', () => {
    const lighting = new Lighting({ maxLights: 4 });
    const source = { collect: (): void => {} };

    lighting.occludeFrom(source);
    lighting.occludeFrom(source);

    expect(lighting.occluders).toHaveLength(1);
    expect(lighting.stopOccluding(source)).toBe(true);
    expect(lighting.stopOccluding(source)).toBe(false);
  });

  test('sources are asked for the region the enabled lights jointly reach', () => {
    const lighting = lightmapLighting();
    const regions: string[] = [];

    lighting.occludeFrom({
      collect: (bounds): void => {
        regions.push(`${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`);
      },
    });
    lighting.add(new PointLight({ radius: 100 })).setPosition(0, 0);
    lighting.add(new PointLight({ radius: 50 })).setPosition(300, 0);
    lighting.add(new PointLight({ radius: 400, enabled: false })).setPosition(0, 0);
    lighting.update();

    expect(regions).toEqual(['-100,-100,350,100']);
  });

  test('a line light reaches its falloff past both ends of its own segment', () => {
    const lighting = lightmapLighting();
    const regions: string[] = [];

    lighting.occludeFrom({
      collect: (bounds): void => {
        regions.push(`${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`);
      },
    });
    // 32 long and 20 of falloff: 16 + 20 from the centre, in every direction,
    // because the region is a box around the reach rather than the capsule.
    lighting.add(new LineLight({ length: 32, radius: 20 })).setPosition(0, 0);
    lighting.update();

    expect(regions).toEqual(['-36,-36,36,36']);
  });

  test('no light means no region, so a source is never walked for nothing', () => {
    const lighting = lightmapLighting();

    let walks = 0;

    lighting.occludeFrom({ collect: (): void => void walks++ });
    lighting.update();

    expect(walks).toBe(0);
  });

  test('a renderer without shadows never walks a source at all', () => {
    const lighting = new Lighting({ maxLights: 4 });

    let walks = 0;

    lighting.occludeFrom({ collect: (): void => void walks++ });
    lighting.add(new PointLight({ radius: 100 }));
    lighting.update();

    expect(walks).toBe(0);
  });

  test('destroying the system forgets its occluder sources', () => {
    const lighting = new Lighting({ maxLights: 4 });

    lighting.occludeFrom({ collect: (): void => {} });
    lighting.destroy();

    expect(lighting.occluders).toHaveLength(0);
  });
  test('light accumulates in half float where one can be rendered into', () => {
    const lighting = lightmapLighting();

    expect(lighting.hdr).toBe(true);
    expect((lighting.backend as LightmapBackend).lightTexture.format).toBe(TextureFormat.Rgba16F);
  });

  test('a context without renderable floats falls back to rgba8 and reports it', () => {
    const lighting = lightmapLighting(false);

    expect(lighting.hdr).toBe(false);
    expect((lighting.backend as LightmapBackend).lightTexture.format).toBe(TextureFormat.Rgba8);
  });

  test('the forward renderer shades into the frame, so it never has headroom', () => {
    expect(new Lighting({ maxLights: 4 }).hdr).toBe(false);
  });

  test('auto takes the lightmap renderer when there is a frame to light, and forward when there is not', () => {
    expect(new Lighting({ app: fakeApp() }).quality).toBe('lightmap');
    expect(new Lighting({}).quality).toBe('forward');
    // The default, so a scene that names nothing still gets shadows where it
    // can have them.
    expect(new Lighting({ app: fakeApp(), quality: 'auto' }).quality).toBe('lightmap');
    // Naming one still wins over what auto would have picked.
    expect(new Lighting({ app: fakeApp(), quality: 'forward' }).quality).toBe('forward');
  });

  test('a filter chain with no application to run in is refused rather than ignored', () => {
    const post: readonly Filter[] = [new ColorMatrixFilter()];

    expect(() => new Lighting({ post })).toThrow(/post/);
    expect(() => new Lighting({ quality: 'lightmap', post })).toThrow();
  });

  test('a filter chain installs one pass, in either renderer, and takes it out again', () => {
    const forwardApp = fakeApp();
    const lightmapApp = fakeApp();
    const grade = new ColorMatrixFilter();

    const forward = new Lighting({ app: forwardApp, quality: 'forward', post: [grade] });
    const lightmap = new Lighting({ quality: 'lightmap', app: lightmapApp, post: [grade] });

    expect(forwardApp.framePasses.size).toBe(1);
    expect(lightmap.post).toEqual([grade]);
    // The lightmap renderer's own seven, plus the chain.
    expect(lightmapApp.framePasses.size).toBe(8);

    forward.destroy();
    lightmap.destroy();

    expect(forwardApp.framePasses.size).toBe(0);
    expect(lightmapApp.framePasses.size).toBe(0);
  });

  test('a source may hand a drawable over only while the renderer rasterises occluders', () => {
    const lighting = lightmapLighting();
    const backend = lighting.backend as LightmapBackend;
    const sprite = new Sprite(new Texture(null));

    let taken: boolean | null = null;

    lighting.add(new PointLight({ radius: 50 })).setPosition(32, 32);
    lighting.occludeFrom({
      collect(_bounds, out) {
        taken = out.addDrawable(sprite);
      },
    });

    lighting.update();

    // The segment walk is the shipped filler and has nothing to do with a
    // drawable, so the offer is refused and the source keeps its geometry path.
    expect(taken).toBe(false);

    backend.shadowFiller = 'gpu';
    lighting.update();

    expect(taken).toBe(true);

    lighting.destroy();
  });

  test('the shadow march is installed only where its float atlas can be rendered into', () => {
    const app = fakeApp(false);
    const lighting = new Lighting({ quality: 'lightmap', app });
    const backend = lighting.backend as LightmapBackend;

    // Two passes fewer than the float-capable renderer - neither the march nor
    // the distance field it shares the mask with - and the request for the
    // marching filler resolves back to the segment walk rather than failing.
    expect(app.framePasses.size).toBe(5);

    backend.shadowFiller = 'gpu';

    expect(backend.shadowFiller).toBe('cpu');

    lighting.destroy();
  });

  test('no filters means no pass at all, which is what keeps forward free of them', () => {
    const app = fakeApp();

    new Lighting({ app, quality: 'forward' });

    expect(app.framePasses.size).toBe(0);
  });

  test('a drawable registered twice replaces its normals instead of describing the surface twice', () => {
    const lighting = lightmapLighting();
    const drawable = {
      texture: null,
      textureFrame: new Rectangle(),
      visible: true,
      getLocalBounds: () => new Rectangle(),
      getWorldTransform: () => new Matrix(),
    };
    const first = normalMap(Texture.fromColor(Color.white, 1));
    const second = normalMap(Texture.fromColor(Color.black, 1));

    expect(lighting.normalsFrom(drawable, first)).toBe(drawable);
    lighting.normalsFrom(drawable, second);

    expect(lighting.surfaces).toHaveLength(1);
    expect(lighting.surfaces[0]?.normals).toBe(second);
    expect(lighting.stopNormals(drawable)).toBe(true);
    expect(lighting.stopNormals(drawable)).toBe(false);
  });

  test('destroying the system forgets its normal surfaces', () => {
    const lighting = lightmapLighting();
    const drawable = {
      texture: null,
      textureFrame: new Rectangle(),
      visible: true,
      getLocalBounds: () => new Rectangle(),
      getWorldTransform: () => new Matrix(),
    };

    lighting.normalsFrom(drawable, normalMap(Texture.fromColor(Color.white, 1)));
    lighting.destroy();

    expect(lighting.surfaces).toHaveLength(0);
  });

  test('a lit material refuses a renderer whose light texture it cannot read', () => {
    const lighting = lightmapLighting();

    // Both renderers expose a `lightTexture` and they hold different things:
    // binding the wrong one shades garbage instead of failing.
    expect(() => new LitMaterial({ lighting })).toThrow(/lightmap/);
  });
});
