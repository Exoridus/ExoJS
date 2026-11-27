/**
 * Scene root rendering and components against a real application, shared by
 * the WebGL2 and WebGPU specs so both backends run the identical scenario.
 *
 * Every colour is a pure primary, black or white, so the bytes read back do
 * not depend on the target's transfer function.
 */
import { Application } from '#core/Application';
import { BehaviorComponent } from '#core/BehaviorComponent';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { FadeSceneTransition } from '#core/scene/transitions/FadeSceneTransition';
import { Time } from '#core/units';
import { Container } from '#rendering/Container';
import type { RenderingContext } from '#rendering/RenderingContext';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { PIXEL_TOLERANCE, type RgbaTuple } from './_pixels';

const size = 64;

const black: RgbaTuple = [0, 0, 0, 255];
const red: RgbaTuple = [255, 0, 0, 255];
const green: RgbaTuple = [0, 255, 0, 255];
const blue: RgbaTuple = [0, 0, 255, 255];
const white: RgbaTuple = [255, 255, 255, 255];

const block = (color: Color, width: number, height: number, x = 0, y = 0): Sprite => {
  const sprite = new Sprite(Texture.fromColor(color, 1));

  sprite.width = width;
  sprite.height = height;
  sprite.setPosition(x, y);

  return sprite;
};

/** No draw override: the root is rendered by default. */
class DefaultRootScene extends Scene {
  public override init(): void {
    this.addChild(block(Color.red, size, size));
  }
}

/** An override that renders a node outside the root - the root must not be rendered as well. */
class CustomDrawScene extends Scene {
  private readonly elsewhere = new Container();

  public override init(): void {
    this.addChild(block(Color.red, size, size));
    this.elsewhere.addChild(block(Color.blue, size, size));
  }

  public override draw(context: RenderingContext): void {
    context.render(this.elsewhere);
  }
}

/** `super.draw` keeps the root pass; the override adds a corner on top. */
class SuperDrawScene extends Scene {
  private readonly overlay = block(Color.green, 8, 8);

  public override init(): void {
    this.addChild(block(Color.red, size, size));
  }

  public override draw(context: RenderingContext): void {
    super.draw(context);
    context.render(this.overlay);
  }
}

/** An empty override renders no root, while the UI layer still renders. */
class EmptyDrawScene extends Scene {
  public override init(): void {
    this.addChild(block(Color.red, size, size));
    this.ui.addChild(block(Color.white, 8, 8));
  }

  public override draw(): void {
    // Intentionally renders nothing.
  }
}

/** Turns its sprite green after it has been ticked a few times by the real frame loop. */
class TurnGreen extends BehaviorComponent<Sprite> {
  public ticks = 0;

  public override update(): void {
    if (++this.ticks === 3) {
      this.node.tint = Color.green;
    }
  }
}

class ComponentScene extends Scene {
  public readonly behaviour = new TurnGreen();

  public override init(): void {
    const sprite = block(Color.white, size, size);

    sprite.addComponent(this.behaviour);
    this.addChild(sprite);
  }
}

const nextFrames = async (count: number): Promise<void> => {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
};

export interface SceneRootScenarioResult {
  readonly errors: readonly string[];
}

/**
 * Run the scenario on `backend`. On WebGPU, a browser without an adapter, or
 * one where the backend cannot be created, skips through `ctx` with the reason
 * instead of passing.
 */
export const runSceneRootScenario = async (
  backend: 'webgl2' | 'webgpu',
  ctx: { skip: (reason: string) => void },
): Promise<SceneRootScenarioResult> => {
  if (backend === 'webgpu' && (!('gpu' in navigator) || (await navigator.gpu.requestAdapter()) === null)) {
    ctx.skip('No WebGPU adapter is available in this browser.');
  }

  const container = document.createElement('div');
  const errors: string[] = [];
  const originalError = console.error;

  document.body.appendChild(container);

  console.error = (...args: unknown[]): void => {
    errors.push(args.map(String).join(' '));
    originalError(...args);
  };

  const app = new Application({
    hello: false,
    scenes: { DefaultRootScene, CustomDrawScene, SuperDrawScene, EmptyDrawScene, ComponentScene },
    canvas: { width: size, height: size, pixelRatio: 1, mount: container },
    clearColor: Color.black,
    backend: { type: backend },
  } as ConstructorParameters<typeof Application>[0]);

  app.onError.add(error => errors.push(`app.onError: ${error.message}`));

  /** Render the active scene's whole surface - draw(), systems, UI - into a texture and read it back. */
  const capture = async (): Promise<(x: number, y: number) => RgbaTuple> => {
    const target = app.backend.acquireRenderTexture(size, size);

    try {
      app.rendering._renderSurfaceInto(target, Color.black, () => app.scenes.draw(app.rendering));
      app.backend.flush();

      const pixels = await app.backend.readPixels(target, 0, 0, size, size);

      return (x, y) => {
        const offset = (y * size + x) * 4;

        return [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!, pixels[offset + 3]!];
      };
    } finally {
      app.backend.releaseRenderTexture(target);
    }
  };

  const expectPixel = (label: string, actual: RgbaTuple, expected: RgbaTuple): void => {
    for (let i = 0; i < 4; i++) {
      expect
        .soft(Math.abs(actual[i]! - expected[i]!), `${label}: channel ${i} of [${actual.join(', ')}]`)
        .toBeLessThanOrEqual(PIXEL_TOLERANCE);
    }
  };

  try {
    try {
      await app.start(DefaultRootScene);
    } catch (error) {
      if (backend === 'webgpu') {
        ctx.skip(`The WebGPU backend could not be created in this browser: ${String(error)}`);
      }

      throw error;
    }

    await nextFrames(3);
    let read = await capture();
    expectPixel('default draw renders the root', read(32, 32), red);

    await app.scenes.change(CustomDrawScene);
    await nextFrames(3);
    read = await capture();
    expectPixel('custom draw replaces the root pass', read(32, 32), blue);

    await app.scenes.change(SuperDrawScene);
    await nextFrames(3);
    read = await capture();
    expectPixel('super.draw keeps the root', read(32, 32), red);
    expectPixel('super.draw plus overlay', read(2, 2), green);

    await app.scenes.change(EmptyDrawScene);
    await nextFrames(3);
    read = await capture();
    expectPixel('empty draw renders no root', read(32, 32), black);
    expectPixel('UI still renders under an empty draw', read(2, 2), white);

    await app.scenes.change(ComponentScene, { transition: new FadeSceneTransition({ duration: Time.seconds(0.05) }) });
    await nextFrames(6);

    const scene = app.scenes.currentScene as ComponentScene;

    expect.soft(scene.behaviour.ticks, 'behaviour ticked by the frame loop').toBeGreaterThanOrEqual(3);
    expect.soft(scene.query(TurnGreen).size, 'query sees the behaviour').toBe(1);

    read = await capture();
    expectPixel('behaviour result is rendered after a fade transition', read(32, 32), green);

    await app.scenes.change(DefaultRootScene, { transition: new FadeSceneTransition({ duration: Time.seconds(0.05) }) });
    await nextFrames(3);
    read = await capture();
    expectPixel('default draw after a transition back', read(32, 32), red);
    expect.soft(scene.behaviour.destroyed, 'the ended scene destroyed its component').toBe(true);
  } finally {
    console.error = originalError;
    await app.destroy();
    container.remove();
  }

  return { errors };
};
