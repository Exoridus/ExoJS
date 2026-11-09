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
      prototype.boot = boot;
      adapter.teardown();
      canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
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
        hits: adapter.pickHits!(),
        queryResults,
      });
      oldObjects.push(container, ...container.list);
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

    adapter.buildScene({ ...picking, id: 'static-heavy', category: 'node-scaling', pointerQueriesPerFrame: 0 }, 3, 0xc0ffee);
    adapter.renderFrame();

    return {
      containers: scene.children.length,
      interactive: input._list.length,
      pendingRemoval: input._pendingRemoval.length,
      oldDestroyed: previous.every(object => object.scene === undefined && object.input == null),
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
