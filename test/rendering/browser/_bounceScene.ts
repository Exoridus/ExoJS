/**
 * The scene the bounce contracts are read from, drawn the way an application
 * draws one.
 *
 * The host below runs a frame the way `Application._drawFrame()` does: the
 * unlit scene goes into `app.frameTexture` through a `BackendTargetPass`, and
 * the frame passes run after it. The earlier lighting fixtures paint that
 * texture once and then only execute the passes, which is enough for a static
 * direct-light reading and not enough for a bounce - the bounce wants this
 * frame's albedo, this frame's mask, the previous frame's light and the
 * previous frame's camera at the same time.
 *
 * The bar is a drawable: the camera draws it, so the frame holds its colour,
 * and the lighting takes it through `AlphaOccluder`, so the mask holds its
 * shape. It is rendered twice per frame - once as scenery, once into the mask -
 * which is what the product path does too.
 */

import { AlphaOccluder, type Lighting, PointLight, PolygonOccluder, RadianceLighting } from '@codexo/exojs-lighting';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { Container } from '#rendering/Container';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';

export const BOUNCE_SIZE = 128;

/**
 * The bar, wider than the field so nothing travels around its ends, and the
 * lamp above it. Its top face is lit and its underside is not.
 */
export const BAR = { x: -BOUNCE_SIZE, y: 64, width: BOUNCE_SIZE * 3, height: 8 } as const;
const LAMP = { x: 64, y: 20, radius: 200, intensity: 1 } as const;

/** Just above the bar, where its top face is lit, and just below it, where nothing is. */
export const ABOVE: readonly [number, number] = [64, 56];
export const BELOW: readonly [number, number] = [64, 80];

/** A receiver the bar covers once it has moved up. */
export const UNDER_MOVED: readonly [number, number] = [64, 40];

export interface BounceHost {
  readonly backend: RenderBackend;
  readonly context: RenderingContext;
  readonly app: Application;
  readonly frameTexture: RenderTexture;
  /** The scene the camera draws, which the frame redirect renders into the frame texture. */
  readonly scene: Container;
  /** One frame, in the order an application runs one. */
  frame(lighting: Lighting): void;
  destroy(): void;
}

/** Wrap a live backend in the pieces an application would have around it. */
export const createBounceHost = (backend: RenderBackend, app: Application, size = BOUNCE_SIZE): BounceHost => {
  const frameTexture = new RenderTexture(size, size);
  const onResize = new Signal<[number, number, Application]>();
  const framePasses = new RenderPipeline();
  const scene = new Container();

  Object.assign(app, { framePasses, frameTexture, onResize, width: size, height: size });

  const context = new RenderingContext(backend);

  context.view = new View(size / 2, size / 2, size, size);
  Object.assign(app, { rendering: context });

  const redirect = new BackendTargetPass(() => context.render(scene));

  return {
    backend,
    context,
    app,
    frameTexture,
    scene,
    frame: (lighting: Lighting): void => {
      lighting.update();
      backend.execute(redirect.retarget(frameTexture, frameTexture.view, Color.black));
      framePasses.execute(context);
      backend.flush();
    },
    destroy: (): void => {
      scene.destroy();
      framePasses.destroy();
      frameTexture.destroy();
      onResize.destroy();
      context.destroy();
      backend.destroy();
    },
  };
};

export interface BounceOptions {
  readonly bounce: number;
  readonly colour: Color;
  /** Moves the bar, for the case where a wall arrives over a receiver. */
  readonly offsetY?: number;
  /** An outline instead of a drawable: it blocks, and it has no material to give back. */
  readonly outline?: boolean;
  /** Light-field texels per pixel, which is what the bounce's step back is measured in. */
  readonly resolution?: number;
}

export interface BounceScene {
  readonly lighting: Lighting;
  destroy(): void;
}

/** The scene itself: floor, bar, lamp, and whichever occluder the case asks for. */
export const createBounceScene = (host: BounceHost, options: BounceOptions): BounceScene => {
  const offsetY = options.offsetY ?? 0;
  const floor = new Sprite(Texture.fromColor(Color.white, 1));
  const bar = new Sprite(Texture.fromColor(options.colour, 1));
  const lighting = new RadianceLighting(host.app, {
    ambient: Color.black,
    lightResolution: options.resolution ?? 1,
    probeSpacing: 2,
    bounce: options.bounce,
  });

  floor.width = BOUNCE_SIZE;
  floor.height = BOUNCE_SIZE;
  bar.width = BAR.width;
  bar.height = BAR.height;
  bar.position.set(BAR.x, BAR.y + offsetY);
  host.scene.addChild(floor);
  host.scene.addChild(bar);

  lighting.add(new PointLight({ radius: LAMP.radius, intensity: LAMP.intensity, softness: 0.2 })).setPosition(LAMP.x, LAMP.y);

  if (options.outline === true) {
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: BAR.x, y: BAR.y + offsetY + BAR.height / 2 },
          { x: BAR.x + BAR.width, y: BAR.y + offsetY + BAR.height / 2 },
        ],
        { closed: false },
      ),
    );
  } else {
    lighting.occludeFrom(new AlphaOccluder(bar));
  }

  return {
    lighting,
    destroy: (): void => {
      lighting.destroy();
      host.scene.removeChild(floor);
      host.scene.removeChild(bar);
      floor.destroy();
      bar.destroy();
    },
  };
};
