import { ActionMap, Application, BehaviorComponent, ButtonAction, Container, Keyboard, Scene, SystemOrder } from '@codexo/exojs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BoxShape,
  CapsuleShape,
  CharacterMovementComponent,
  KinematicMovementComponent,
  PhysicsBodyComponent,
  PhysicsWorld,
} from '../src/index';
import { colliderAt } from './support';

/**
 * A character driven from fixed steps through an action's `tick` view, in a
 * scene-owned world, under a real Application frame loop: one press launches
 * the character once, whatever the frame rate, and a press a pause interrupts
 * never launches it after resume.
 */

vi.mock('../../../src/rendering/OutputTransform', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/rendering/OutputTransform')>();

  class StubOutputTransform extends actual.OutputTransform {
    public override present(): void {}
  }

  return { ...actual, OutputTransform: StubOutputTransform };
});

vi.mock('../../../src/rendering/webgl2/WebGl2Backend', async () => {
  const { View } = await import('../../../src/rendering/View');

  return {
    WebGl2Backend: vi.fn().mockImplementation(function () {
      return {
        onContextLost: { add: vi.fn(), destroy: vi.fn() },
        onContextRestored: { add: vi.fn(), destroy: vi.fn() },
        onRenderError: { add: vi.fn(), destroy: vi.fn() },
        stats: {
          frameTimeMs: 0,
          drawCalls: 0,
          culledNodes: 0,
          submittedNodes: 0,
          batches: 0,
          renderPasses: 0,
          renderTargetChanges: 0,
          frame: 0,
          rawFrameDeltaMs: 0,
        },
        resetStats: vi.fn().mockReturnThis(),
        flush: vi.fn().mockReturnThis(),
        initialize: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        resize: vi.fn().mockReturnThis(),
        view: new View(400, 300, 800, 600),
        renderTarget: {},
        rendererRegistry: { bindRenderer: vi.fn() },
        backendType: 'webgl2',
        setView: vi.fn().mockReturnThis(),
        draw: vi.fn().mockReturnThis(),
        execute: vi.fn().mockReturnThis(),
        setRenderTarget: vi.fn().mockReturnThis(),
        resolveRenderTarget: vi.fn(),
        clearColor: { red: 0, green: 0, blue: 0, alpha: 1 },
        clear: vi.fn().mockReturnThis(),
        pushScissorRect: vi.fn().mockReturnThis(),
        popScissorRect: vi.fn().mockReturnThis(),
        acquireRenderTexture: vi.fn(),
        releaseRenderTexture: vi.fn().mockReturnThis(),
        composeWithAlphaMask: vi.fn().mockReturnThis(),
      };
    }),
  };
});

const FLOOR = 100;
const REST_Y = FLOOR - 20;
const STEP_MS = 1000 / 60;

type Controls = ActionMap<{ jump: ButtonAction }>;

/** Jumps from the ground, and once more in the air: the game's rule. */
class Jumper extends BehaviorComponent {
  public launches = 0;
  public airJumps = 1;
  /** Whether the jump was pressed, as this jumper reads it. */
  public read: (controls: Controls) => boolean = controls => controls.jump.tick.pressed;
  private readonly _controls: Controls;
  private readonly _character: CharacterMovementComponent;

  public constructor(controls: Controls, character: CharacterMovementComponent) {
    super();
    this._controls = controls;
    this._character = character;
  }

  public override fixedUpdate(): void {
    const character = this._character;

    character.move(0);

    if (character.grounded) {
      this.airJumps = 1;
    }

    if (!this.read(this._controls)) {
      return;
    }

    if (character.grounded) {
      character.launch({ x: 0, y: -520 });
      this.launches++;
    } else if (this.airJumps > 0) {
      this.airJumps--;
      character.launch({ x: 0, y: -440 });
      this.launches++;
    }
  }
}

/** A second, independent reader of the same action. */
class PressCounter extends BehaviorComponent {
  public presses = 0;
  private readonly _controls: Controls;

  public constructor(controls: Controls) {
    super();
    this._controls = controls;
  }

  public override fixedUpdate(): void {
    this.presses += this._controls.jump.tick.pressCount;
  }
}

class PlatformScene extends Scene {
  public readonly world = new PhysicsWorld();
  public controls!: Controls;
  public character!: CharacterMovementComponent;
  public jumper!: Jumper;
  public counter!: PressCounter;

  public override init(): void {
    this.systems.add(this.world, { order: SystemOrder.Physics });
    this.controls = this.inputs.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));

    colliderAt(this.world, new BoxShape(4000, 20), { x: 0, y: FLOOR + 10 });

    const hero = new Container();
    const physics = hero.addComponent(
      new PhysicsBodyComponent(this.world, {
        type: 'kinematic',
        position: { x: 0, y: REST_Y - 0.05 },
        colliders: [{ shape: new CapsuleShape(0, -12, 0, 12, 8) }],
      }),
    );
    const movement = hero.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 240 }));

    this.character = hero.addComponent(new CharacterMovementComponent(movement, { gravity: 1600 }));
    this.jumper = hero.addComponent(new Jumper(this.controls, this.character));
    this.addChild(hero);

    const reader = new Container();

    this.counter = reader.addComponent(new PressCounter(this.controls));
    this.addChild(reader);
  }
}

const apps: Application[] = [];

const setup = async (): Promise<{ app: Application; scene: PlatformScene; frame: (ms: number) => void }> => {
  const app = new Application({ backend: { type: 'webgl2' }, fixedTimeStep: 1 / 60, scenes: { platform: PlatformScene } });

  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});
  apps.push(app);

  await app.start(PlatformScene);

  let now = 0;

  (app as unknown as { _scheduler: { _lastFrameTimestamp: number } })._scheduler._lastFrameTimestamp = now;
  app.canvas.dispatchEvent(new FocusEvent('focus'));

  const frame = (ms: number): void => {
    now += ms;
    app.update(now);
  };

  // Settle onto the floor.
  for (let i = 0; i < 10; i++) {
    frame(STEP_MS);
  }

  return { app, scene: app.scenes.currentScene as PlatformScene, frame };
};

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.destroy();
  }
});

const tap = (): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
};

describe('character driven by tick input', () => {
  it('a tap in a 144 Hz frame without a fixed step launches the character once', async () => {
    const { scene, frame } = await setup();

    expect(scene.character.grounded).toBe(true);

    tap();
    frame(5);

    expect(scene.jumper.launches).toBe(0);

    frame(STEP_MS);

    expect(scene.jumper.launches).toBe(1);
    expect(scene.character.velocity.y).toBeLessThan(0);
    expect(scene.counter.presses).toBe(1);

    for (let i = 0; i < 20; i++) {
      frame(1000 / 144);
    }

    expect(scene.jumper.launches).toBe(1);
    expect(scene.jumper.airJumps).toBe(1);
  });

  it('a press before three catch-up steps launches once and leaves the air jump unused', async () => {
    const { scene, frame } = await setup();

    tap();
    frame(STEP_MS * 3);

    expect(scene.jumper.launches).toBe(1);
    expect(scene.jumper.airJumps).toBe(1);
    expect(scene.counter.presses).toBe(1);
  });

  it('two taps before the next step are one launch for the jumper and two presses for a counter', async () => {
    const { scene, frame } = await setup();

    tap();
    frame(5);
    tap();
    frame(STEP_MS);

    expect(scene.jumper.launches).toBe(1);
    expect(scene.counter.presses).toBe(2);
  });

  it('a tap a pause interrupts never launches the character after resume', async () => {
    const { app, scene, frame } = await setup();
    const epoch = scene.world._stepEpoch;

    tap();
    frame(5);
    app.scenes.pause();
    frame(STEP_MS);
    frame(STEP_MS);

    expect(scene.world._stepEpoch).toBe(epoch);

    app.scenes.resume();
    frame(STEP_MS);
    frame(STEP_MS);

    expect(scene.jumper.launches).toBe(0);
    expect(scene.character.grounded).toBe(true);
  });
});

describe('the same character driven by the frame API, for comparison', () => {
  const frameJumper = async () => {
    const harness = await setup();

    harness.scene.jumper.read = controls => controls.jump.pressed;

    return harness;
  };

  it('a press before three catch-up steps reads as pressed in each of them and spends the air jump', async () => {
    const { scene, frame } = await frameJumper();

    tap();
    frame(STEP_MS * 3);

    expect(scene.jumper.launches).toBe(2);
    expect(scene.jumper.airJumps).toBe(0);
  });

  it('a tap in a frame without a fixed step is gone by the next step', async () => {
    const { scene, frame } = await frameJumper();

    tap();
    frame(5);
    frame(STEP_MS);

    expect(scene.jumper.launches).toBe(0);
  });
});
