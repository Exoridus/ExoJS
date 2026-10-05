import { ColorMatrixFilter, Matrix, Rectangle, RenderPipeline, RenderTexture, SceneState, Signal, type TextureFormat } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import { ForwardLighting } from '../src/ForwardLighting';
import type { Lighting } from '../src/Lighting';
import type { LightingHost, LightingScene } from '../src/LightingHost';
import { LightmapLighting } from '../src/LightmapLighting';
import { RadianceLighting } from '../src/RadianceLighting';

const fakeApp = (): LightingHost =>
  ({
    framePasses: new RenderPipeline(),
    frameTexture: new RenderTexture(64, 64),
    onResize: new Signal(),
    rendering: {
      supportsColorFormat: (_format: TextureFormat): boolean => true,
      view: {
        center: { x: 32, y: 32 },
        width: 64,
        height: 64,
        rotation: 0,
        getBounds: (): Rectangle => new Rectangle(0, 0, 64, 64),
        getTransform: (): Matrix => new Matrix(),
        getInverseTransform: (): Matrix => new Matrix(),
      },
    },
    width: 64,
    height: 64,
  }) as unknown as LightingHost;

/**
 * A scene driven through the transitions the director puts a real one
 * through, dispatching the same signals in the same places.
 */
class FakeScene implements LightingScene {
  public readonly onActivate = new Signal();
  public readonly onSuspend = new Signal();
  private readonly _lifecycle = new AbortController();
  private _state: SceneState = SceneState.Preparing;

  public get state(): SceneState {
    return this._state;
  }

  public get lifecycleSignal(): AbortSignal {
    return this._lifecycle.signal;
  }

  public ready(): void {
    this._state = SceneState.Ready;
  }

  public activate(): void {
    this._state = SceneState.Active;
    this.onActivate.dispatch();
  }

  public suspend(): void {
    this._state = SceneState.Suspended;
    this.onSuspend.dispatch();
  }

  public end(): void {
    this._lifecycle.abort();
    this._state = SceneState.Destroying;
  }
}

type Build = (host: LightingHost, scene: LightingScene | undefined) => Lighting;

const renderers: readonly (readonly [string, Build, number])[] = [
  ['lightmap', (host, scene) => new LightmapLighting(host, { ...(scene && { scene }) }), 6],
  ['radiance', (host, scene) => new RadianceLighting(host, { ...(scene && { scene }) }), 8],
  ['lightmap with post', (host, scene) => new LightmapLighting(host, { post: [new ColorMatrixFilter()], ...(scene && { scene }) }), 7],
  ['forward with post', (host, scene) => new ForwardLighting(host, { post: [new ColorMatrixFilter()], ...(scene && { scene }) }), 1],
];

describe.each(renderers)('scene-bound %s lighting', (_name, build, passes) => {
  test('stays out of the frame while its scene is prepared and enters it on activation', () => {
    const host = fakeApp();
    const scene = new FakeScene();
    const lighting = build(host, scene);

    expect(host.framePasses.size).toBe(0);

    scene.ready();
    lighting.update();

    expect(host.framePasses.size).toBe(0);

    scene.activate();

    expect(host.framePasses.size).toBe(passes);

    lighting.destroy();

    expect(host.framePasses.size).toBe(0);
  });

  test('leaves nothing behind when a prepared scene is discarded before it ever activated', () => {
    const host = fakeApp();
    const scene = new FakeScene();
    const lighting = build(host, scene);

    scene.ready();
    scene.end();
    lighting.destroy();

    expect(host.framePasses.size).toBe(0);
  });

  test('leaves the frame on suspension and comes back once on restore', () => {
    const host = fakeApp();
    const scene = new FakeScene();
    const lighting = build(host, scene);

    scene.ready();
    scene.activate();
    scene.suspend();

    expect(host.framePasses.size).toBe(0);

    scene.activate();

    expect(host.framePasses.size).toBe(passes);

    // A second activation signal - a restore racing a stale one - must not
    // install the passes twice.
    scene.onActivate.dispatch();

    expect(host.framePasses.size).toBe(passes);

    scene.suspend();
    scene.activate();

    expect(host.framePasses.size).toBe(passes);

    lighting.destroy();

    expect(host.framePasses.size).toBe(0);
  });

  test('leaves the frame as soon as its scene begins teardown, before the registry destroys it', () => {
    const host = fakeApp();
    const scene = new FakeScene();
    const lighting = build(host, scene);

    scene.ready();
    scene.activate();
    scene.end();

    expect(host.framePasses.size).toBe(0);

    // The scene's signals are torn down after its systems; nothing dispatched
    // on them afterwards reaches a system that has already let go.
    scene.onActivate.dispatch();

    expect(host.framePasses.size).toBe(0);

    lighting.destroy();

    expect(host.framePasses.size).toBe(0);
    expect(scene.onActivate.count).toBe(0);
    expect(scene.onSuspend.count).toBe(0);
  });

  test('enters the frame at once when built inside a scene that is already active', () => {
    const host = fakeApp();
    const scene = new FakeScene();

    scene.ready();
    scene.activate();

    const lighting = build(host, scene);

    expect(host.framePasses.size).toBe(passes);

    lighting.destroy();

    expect(host.framePasses.size).toBe(0);
  });

  test('two scenes on one host: only the active one is ever in the frame', () => {
    const host = fakeApp();
    const sceneA = new FakeScene();
    const sceneB = new FakeScene();
    const lightingA = build(host, sceneA);

    sceneA.ready();
    sceneA.activate();

    const lightingB = build(host, sceneB);

    sceneB.ready();

    expect(host.framePasses.size).toBe(passes);

    // Retention: the outgoing scene is suspended before the incoming one
    // activates, so at no point are both installed.
    sceneA.suspend();

    expect(host.framePasses.size).toBe(0);

    sceneB.activate();

    expect(host.framePasses.size).toBe(passes);

    sceneB.suspend();
    sceneA.activate();

    expect(host.framePasses.size).toBe(passes);

    lightingA.destroy();
    lightingB.destroy();

    expect(host.framePasses.size).toBe(0);
  });

  test('without a scene it is application-wide and enters the frame at construction', () => {
    const host = fakeApp();
    const lighting = build(host, undefined);

    expect(host.framePasses.size).toBe(passes);

    lighting.destroy();

    expect(host.framePasses.size).toBe(0);
  });
});
