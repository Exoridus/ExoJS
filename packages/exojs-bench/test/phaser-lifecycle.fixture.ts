import * as Phaser from 'phaser';

import { createPhaserAdapter } from '../src/rendering/adapters/phaser';
import type { ArchetypeSpec } from '../src/rendering/EngineAdapter';

interface InputState extends Phaser.Input.InputPlugin {
  _list: Phaser.GameObjects.GameObject[];
  _pendingInsertion: Phaser.GameObjects.GameObject[];
  _pendingRemoval: Phaser.GameObjects.GameObject[];
}

const picking: ArchetypeSpec = {
  id: 'interaction-picking',
  category: 'interaction',
  crossArm: true,
  nodeCounts: [1590],
  nestingDepth: 1,
  textureCount: 1,
  mutationFraction: 0,
  cullingEnabled: false,
  pointerQueriesPerFrame: 100,
};

const createHarness = () => {
  const state: { game?: Phaser.Game } = {};
  const prototype = Phaser.Game.prototype as unknown as { boot(this: Phaser.Game): void };
  const boot = prototype.boot;

  prototype.boot = function (this: Phaser.Game): void {
    state.game = this;
    boot.call(this);
  };

  const adapter = createPhaserAdapter();
  const canvas = document.createElement('canvas');

  document.body.append(canvas);

  const releaseCanvas = (): void => {
    prototype.boot = boot;
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };

  return {
    adapter,
    canvas,
    get game(): Phaser.Game {
      if (state.game === undefined) {
        throw new Error('The Phaser game has not booted.');
      }

      return state.game;
    },
    dispose(): void {
      try {
        adapter.teardown();
      } finally {
        releaseCanvas();
      }
    },
    releaseCanvas,
  };
};

const startupResources = (game: Phaser.Game) => ({
  texturesReleased: Object.keys(game.textures.list).length === 0,
  rendererReleased: (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl === null,
  inputReleased: game.input.canvas === null && game.input.mouse!.target === null,
  scaleReleased: game.scale.canvas === null,
  loopReleased: game.loop.game === null,
  gameListeners: game.events.eventNames().length,
});

const holdDefaultImages = () => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');

  if (descriptor?.set === undefined) {
    throw new Error('The browser image src setter is unavailable.');
  }

  const setSource = descriptor.set;
  const pending: Array<{ image: HTMLImageElement; source: string; loaded: Promise<void> }> = [];

  // Retain the real images and Phaser's real onload handlers. Only starting the
  // default image loads is delayed until the test releases them.
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...descriptor,
    set(this: HTMLImageElement, source: string): void {
      if (!source.startsWith('data:image/png;base64,')) {
        setSource.call(this, source);

        return;
      }

      const loaded = new Promise<void>((resolve, reject) => {
        this.addEventListener('load', () => resolve(), { once: true });
        this.addEventListener('error', () => reject(new Error('The delayed default image failed to load.')), { once: true });
      });

      pending.push({ image: this, source, loaded });
    },
  });

  const restore = (): void => {
    Object.defineProperty(HTMLImageElement.prototype, 'src', descriptor);
  };

  return {
    restore,
    async release(): Promise<number> {
      restore();

      for (const entry of pending) {
        setSource.call(entry.image, entry.source);
      }

      await Promise.all(pending.map(entry => entry.loaded));

      return pending.length;
    },
  };
};

export const observeRepeatedPickingBuilds = async () => {
  const harness = createHarness();
  const { adapter, canvas } = harness;

  try {
    await adapter.init(canvas, 'webgl2');
    const scene = harness.game.scene.getScene('bench');
    const input = scene.input as InputState;
    const hitTestPointer = input.hitTestPointer;
    let queryResults: number[] = [];

    input.hitTestPointer = function (pointer: Phaser.Input.Pointer): Phaser.GameObjects.GameObject[] {
      const hits = hitTestPointer.call(this, pointer);

      queryResults.push(hits.length);

      return hits;
    };

    const oldObjects: Phaser.GameObjects.GameObject[] = [];
    const oldTextures: Phaser.Textures.Texture[] = [];
    const oldSources: Phaser.Textures.TextureSource[] = [];
    const observations = [];

    for (const count of [1590, 4, 0, 1590]) {
      adapter.buildScene(picking, count, 0xc0ffee);
      queryResults = [];
      // Cameras must have the render transform before the first point query.
      scene.cameras.main.preRender();
      adapter.mutate(0);
      const container = scene.children.getAt(0) as Phaser.GameObjects.Container;

      observations.push({
        count,
        containers: scene.children.length,
        interactive: input._list.length,
        pendingInsertion: input._pendingInsertion.length,
        pendingRemoval: input._pendingRemoval.length,
        oldDestroyed: oldObjects.every(object => object.scene === undefined && object.input == null),
        textures: harness.game.textures.getTextureKeys(),
        oldTexturesDestroyed: oldTextures.every(texture => texture.manager === null && texture.source.length === 0),
        oldSourcesReleased: oldSources.every(source => source.glTexture === null && source.image === null),
        hits: adapter.pickHits!(),
        queryResults,
      });
      oldObjects.push(container, ...container.list);
      const texture = harness.game.textures.get('bench-pick');

      oldTextures.push(texture);
      oldSources.push(...texture.source);
    }

    return observations;
  } finally {
    harness.dispose();
  }
};

export const observeLeavingPicking = async () => {
  const harness = createHarness();
  const { adapter, canvas } = harness;

  try {
    await adapter.init(canvas, 'webgl2');
    const scene = harness.game.scene.getScene('bench');
    const input = scene.input as InputState;

    adapter.buildScene(picking, 4, 0xc0ffee);
    const container = scene.children.getAt(0) as Phaser.GameObjects.Container;
    const previous = [container, ...container.list];
    const texture = harness.game.textures.get('bench-pick');
    const source = texture.source[0]!;

    adapter.buildScene({ ...picking, id: 'static-heavy', category: 'node-scaling', pointerQueriesPerFrame: 0 }, 3, 0xc0ffee);
    adapter.renderFrame();

    return {
      containers: scene.children.length,
      interactive: input._list.length,
      pendingRemoval: input._pendingRemoval.length,
      oldDestroyed: previous.every(object => object.scene === undefined && object.input == null),
      pickingTexturePresent: harness.game.textures.exists('bench-pick'),
      textureDestroyed: texture.manager === null && texture.source.length === 0,
      sourceReleased: source.glTexture === null && source.image === null,
      loopRunning: harness.game.loop.running,
    };
  } finally {
    harness.dispose();
  }
};

export const observeSuccessfulReinitialization = async () => {
  const harness = createHarness();
  const context = harness.canvas.getContext('webgl2');
  const observations = [];

  try {
    for (let cycle = 0; cycle < 2; cycle++) {
      await harness.adapter.init(harness.canvas, 'webgl2');
      harness.adapter.buildScene(picking, 4, 0xc0ffee);
      harness.adapter.renderFrame();
      observations.push({
        sameContext: harness.game.context === context,
        loopRunning: harness.game.loop.running,
        scenes: harness.game.scene.scenes.length,
        canvasConnected: harness.canvas.isConnected,
      });
      harness.adapter.teardown();
      harness.adapter.teardown();
    }

    return observations;
  } finally {
    harness.dispose();
  }
};

export const observeNeverCreatedScene = async () => {
  const harness = createHarness();
  const prototype = Phaser.Scenes.SceneManager.prototype as unknown as { create(scene: Phaser.Scene): void };
  const create = prototype.create;
  let createReached = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  prototype.create = () => {
    createReached = true;
  };

  try {
    const initialized = harness.adapter.init(harness.canvas, 'webgl2').then(
      () => ({ initialization: 'resolved', error: '' }),
      (error: unknown) => ({ initialization: 'rejected', error: error instanceof Error ? error.message : String(error) }),
    );
    const result = await Promise.race([
      initialized,
      new Promise<{ initialization: string; error: string }>(resolve => {
        timer = setTimeout(() => resolve({ initialization: 'pending', error: '' }), 11_000);
      }),
    ]);
    const beforeCleanup = {
      ...result,
      createReached,
      loopRunning: harness.game.loop.running,
      scenes: harness.game.scene.scenes.length,
      inputDestroyed: harness.game.input.canvas === null,
      canvasConnected: harness.canvas.isConnected,
    };

    prototype.create = create;
    let recovered = false;

    if (result.initialization === 'rejected') {
      await harness.adapter.init(harness.canvas, 'webgl2');
      recovered = harness.game.scene.scenes.length === 1 && !harness.game.loop.running;
    }

    harness.adapter.teardown();
    harness.adapter.teardown();

    return { ...beforeCleanup, recovered };
  } finally {
    clearTimeout(timer);
    prototype.create = create;
    harness.dispose();
  }
};

export const observeNeverReadyGame = async () => {
  const harness = createHarness();
  const prototype = Phaser.Textures.TextureManager.prototype as unknown as { updatePending(this: Phaser.Textures.TextureManager): void };
  const updatePending = prototype.updatePending;
  const sources: Phaser.Textures.TextureSource[] = [];
  let textureLoadReached = false;
  let sceneManagerWasBooted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Keep the actual renderer, managers, default textures and DOM listeners;
  // withhold only the readiness transition that starts scenes and the game loop.
  prototype.updatePending = function (this: Phaser.Textures.TextureManager): void {
    textureLoadReached = true;
    sceneManagerWasBooted = this.game.scene.isBooted;
    sources.length = 0;

    for (const texture of Object.values(this.list)) {
      sources.push(...texture.source);
    }
  };

  try {
    const initialized = harness.adapter.init(harness.canvas, 'webgl2').then(
      () => ({ initialization: 'resolved', error: '' }),
      (error: unknown) => ({ initialization: 'rejected', error: error instanceof Error ? error.message : String(error) }),
    );
    const result = await Promise.race([
      initialized,
      new Promise<{ initialization: string; error: string }>(resolve => {
        timer = setTimeout(() => resolve({ initialization: 'pending', error: '' }), 11_000);
      }),
    ]);
    const game = harness.game;
    const beforeCleanup = {
      ...result,
      textureLoadReached,
      sceneManagerWasBooted,
      sourceCount: sources.length,
      sourcesReleased: sources.every(source => source.glTexture === null && source.image === null),
      ...startupResources(game),
      canvasConnected: harness.canvas.isConnected,
    };

    prototype.updatePending = updatePending;
    let teardownError = '';
    let recovered = false;

    if (result.initialization === 'rejected' && beforeCleanup.inputReleased && beforeCleanup.rendererReleased) {
      await harness.adapter.init(harness.canvas, 'webgl2');
      harness.adapter.buildScene(picking, 4, 0xc0ffee);
      harness.adapter.renderFrame();
      recovered = !harness.game.loop.running;
    }

    try {
      harness.adapter.teardown();
      harness.adapter.teardown();
    } catch (error) {
      teardownError = error instanceof Error ? error.message : String(error);
    }

    return { ...beforeCleanup, recovered, teardownError };
  } finally {
    clearTimeout(timer);
    prototype.updatePending = updatePending;
    // The observations include teardown failures. Closing the test-owned canvas
    // must not replace that evidence with a second early-destruction exception.
    harness.releaseCanvas();
  }
};

export const observeLateBootImages = async () => {
  const images = holdDefaultImages();
  const lateErrors: string[] = [];

  const onError = (event: ErrorEvent): void => {
    lateErrors.push(event.message);
  };

  const harness = createHarness();
  let timer: ReturnType<typeof setTimeout> | undefined;

  window.addEventListener('error', onError);

  try {
    const initialized = harness.adapter.init(harness.canvas, 'webgl2').then(
      () => ({ initialization: 'resolved', error: '' }),
      (error: unknown) => ({ initialization: 'rejected', error: error instanceof Error ? error.message : String(error) }),
    );
    const game = harness.game;
    const sources = Object.values(game.textures.list).flatMap(texture => texture.source);
    const result = await Promise.race([
      initialized,
      new Promise<{ initialization: string; error: string }>(resolve => {
        timer = setTimeout(() => resolve({ initialization: 'pending', error: '' }), 11_000);
      }),
    ]);
    const beforeImages = {
      ...result,
      ...startupResources(game),
      sceneManagerWasBooted: game.scene.isBooted,
      sourceCount: sources.length,
      sourcesReleased: sources.every(source => source.glTexture === null && source.image === null),
      canvasConnected: harness.canvas.isConnected,
    };

    const loadedImages = await images.release();
    const afterImages = {
      ...startupResources(game),
      sceneManagerBooted: game.scene.isBooted,
      lateErrors,
      loadedImages,
    };
    let recovered = false;
    let teardownError = '';

    if (result.initialization === 'rejected' && afterImages.inputReleased && afterImages.rendererReleased) {
      await harness.adapter.init(harness.canvas, 'webgl2');
      harness.adapter.buildScene(picking, 4, 0xc0ffee);
      harness.adapter.renderFrame();
      recovered = !harness.game.loop.running;
    }

    try {
      harness.adapter.teardown();
      harness.adapter.teardown();
    } catch (error) {
      teardownError = error instanceof Error ? error.message : String(error);
    }

    return { beforeImages, afterImages, recovered, teardownError };
  } finally {
    clearTimeout(timer);
    images.restore();
    window.removeEventListener('error', onError);
    harness.releaseCanvas();
  }
};

export const observeBootFailure = async () => {
  const images = holdDefaultImages();
  const harness = createHarness();
  const prototype = Phaser.Game.prototype as unknown as { boot(this: Phaser.Game): void };
  const boot = prototype.boot;
  const lateErrors: string[] = [];

  const onError = (event: ErrorEvent): void => {
    lateErrors.push(event.message);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;

  prototype.boot = function (this: Phaser.Game): void {
    boot.call(this);

    throw new Error('Controlled Phaser boot failure.');
  };

  window.addEventListener('error', onError);

  try {
    const initialized = harness.adapter.init(harness.canvas, 'webgl2').then(
      () => ({ initialization: 'resolved', error: '' }),
      (error: unknown) => ({ initialization: 'rejected', error: error instanceof Error ? error.message : String(error) }),
    );
    const game = harness.game;
    const sources = Object.values(game.textures.list).flatMap(texture => texture.source);
    const result = await Promise.race([
      initialized,
      new Promise<{ initialization: string; error: string }>(resolve => {
        timer = setTimeout(() => resolve({ initialization: 'pending', error: '' }), 1_000);
      }),
    ]);
    const beforeImages = {
      ...result,
      ...startupResources(game),
      sceneManagerWasBooted: game.scene.isBooted,
      sourceCount: sources.length,
      sourcesReleased: sources.every(source => source.glTexture === null && source.image === null),
      canvasConnected: harness.canvas.isConnected,
    };

    prototype.boot = boot;
    const loadedImages = await images.release();
    const afterImages = {
      ...startupResources(game),
      sceneManagerBooted: game.scene.isBooted,
      lateErrors,
      loadedImages,
    };
    let recovered = false;

    if (result.initialization === 'rejected' && afterImages.inputReleased && afterImages.rendererReleased) {
      await harness.adapter.init(harness.canvas, 'webgl2');
      harness.adapter.buildScene(picking, 4, 0xc0ffee);
      harness.adapter.renderFrame();
      recovered = !harness.game.loop.running;
    }

    harness.adapter.teardown();
    harness.adapter.teardown();

    return { beforeImages, afterImages, recovered };
  } finally {
    clearTimeout(timer);
    prototype.boot = boot;
    images.restore();
    window.removeEventListener('error', onError);
    harness.releaseCanvas();
  }
};
