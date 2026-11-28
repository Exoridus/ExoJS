import {
  ActionMap,
  Application,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  InputScope,
  isSequenceCancellation,
  Keyboard,
  type RenderingContext,
  Scene,
  SceneAvailability,
  type Seconds,
  Sequence,
  type SequenceContext,
  type SequenceHandle,
  type SequenceStep,
  type Sound,
  Sprite,
  Text,
  Time,
  type Tween,
  TweenState,
  VectorAction,
  View,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample } from '@examples/runtime';

const bossLine = 'VOID EMPEROR: You came all this way to be erased?';
const worldWidth = 2600;

/** Tween `target` on the scene's own clock; stopping the step stops the tween where it is. */
const tweenTo =
  <T extends object>(target: T, properties: Parameters<Tween<T>['to']>[0], duration: number): SequenceStep =>
  async context => {
    const tween = context.scene.tweens.create(target, { when: SceneAvailability.Active }).to(properties, duration).start();

    context.defer(() => tween.stop());
    await context.waitUntil(() => tween.state === TweenState.Complete);
  };

/** A camera shake that lasts `duration`; cancelling it settles the camera at once. */
const shake =
  (view: View, intensity: number, duration: number): SequenceStep =>
  async context => {
    view.shake(intensity, Time.seconds(duration), { frequency: 22, decay: true });
    context.defer(() => view.clearShake());
    await context.wait(duration);
  };

class BossIntroSequenceScene extends Scene {
  private readonly view = new View(0, 0, 1280, 720);
  private readonly world = new Graphics();
  private readonly player = new Graphics();
  private boss!: Sprite;
  private escorts: Sprite[] = [];
  private roar!: Sound;
  private readonly panel = new Graphics();
  private readonly dialogue = new Text('', { fillColor: Color.white, fontSize: 24 });
  private readonly hud = new Text('', { fillColor: new Color(170, 200, 230), fontSize: 15, fontFamily: 'monospace' });
  private readonly controls = new ActionMap({
    move: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
    ]),
  });
  /**
   * Pushed for the length of the intro. It claims the movement keys as well as
   * its own, so the player's map stops seeing them without being touched.
   */
  private readonly cutsceneControls = new ActionMap({
    confirm: new ButtonAction([Keyboard.Enter, Keyboard.Space]),
    hold: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
    ]),
  });
  private readonly cutscene = new InputScope(this.cutsceneControls);
  private run: SequenceHandle | null = null;
  private runs = 0;
  private triggered = false;
  private time = 0;

  // #region guide:boss-intro-sequence
  private readonly intro = new Sequence(async context => {
    const { view, player, boss } = this;

    // 1. Take control of input and camera; cleanup gives both back, however the run ends.
    this.inputs.pushScope(this.cutscene);
    view.clearFollow();
    context.defer(() => {
      this.inputs.popScope(this.cutscene);
      this.dialogue.text = '';
      view.center.set(player.x, player.y);
      view.follow(player);
    });

    // 2. Pan to the boss.
    await context.run(tweenTo(view.center, { x: boss.x - 140, y: boss.y }, 1.4));

    // 3 + 4. A finite spatial roar and a shake together; the roar counts as done when it
    // ends, or after a bound in case audio is still locked and it never starts.
    const voice = this.audio.play(this.roar, { position: { x: boss.x, y: boss.y }, when: SceneAvailability.Active });

    context.defer(() => voice.stop());
    await context.all([
      (c: SequenceContext) => c.race([(r: SequenceContext) => r.waitFor(voice.onEnd), (r: SequenceContext) => r.wait(2.5)]),
      shake(view, 16, 0.9),
    ]);

    // 5 + 6. Screen-space dialogue, then a fresh confirmation press.
    this.dialogue.text = bossLine;
    await context.wait(0.25);
    await context.waitUntil(() => this.cutsceneControls.confirm.pressed);
    this.dialogue.text = '';

    // 7. Back to the player; the deferred cleanup restores control.
    await context.run(tweenTo(view.center, { x: player.x, y: player.y }, 0.8));
  });
  // #endregion guide:boss-intro-sequence

  override async load(): Promise<void> {
    this.roar = await this.loader.load(assets.soundImpactMetalHeavy);
  }

  override init(): void {
    const { width, height } = this.app;

    this.view.reset(320, height / 2, width, height);
    this.dialogue.layout = { maxWidth: width - 300 };
    this.world.fillColor = new Color(9, 15, 30);
    this.world.drawRectangle(0, 0, worldWidth, height);

    for (let i = 0; i < 260; i++) {
      this.world.fillColor = new Color(170, 195, 230, 0.25 + (i % 4) * 0.15);
      this.world.drawCircle((i * 137) % worldWidth, (i * 193) % height, 1 + (i % 2));
    }

    this.player.fillColor = new Color(240, 217, 138);
    this.player.drawPolygon([28, 0, -20, -20, -10, 0, -20, 20]).setPosition(320, height / 2);
    this.boss = new Sprite(this.loader.get(assets.spaceBossRed))
      .setAnchor(0.5)
      .setScale(1.4)
      .setPosition(worldWidth - 420, height / 2);
    this.escorts = [0, 1, 2].map(() => new Sprite(this.loader.get(assets.spaceEnemyRed)).setAnchor(0.5).setScale(0.7));
    this.root.addChild(this.world);

    for (const node of [...this.escorts, this.boss, this.player]) {
      this.root.addChild(node);
    }

    this.view.follow(this.player);
    this.app.audio.listener.target = this.player;
    this.inputs.attach(this.controls);

    // Skip, pause, replay and scene replacement stay available whatever the intro holds.
    this.inputs.onTrigger(Keyboard.Escape, () => this.run?.cancel());
    this.inputs.onTrigger(Keyboard.B, () => this.startIntro());
    this.inputs.onTrigger(Keyboard.N, () => void this.app.scenes.change(BossIntroSequenceScene));
    this.inputs.onTrigger(Keyboard.P, () => (this.app.scenes.paused ? this.app.scenes.resume() : this.app.scenes.pause()), {
      when: SceneAvailability.Always,
    });
  }

  private startIntro(): void {
    this.run?.cancel();
    this.runs++;
    this.run = this.intro.start(this);
    // A skip is a cancellation, not a failure; anything else still surfaces.
    this.run.then(undefined, (error: unknown) => {
      if (!isSequenceCancellation(error)) {
        throw error;
      }
    });
  }

  override update(delta: Seconds): void {
    this.time += delta;

    // The world keeps living while the intro runs.
    this.escorts.forEach((escort, index) => {
      const angle = this.time * 0.8 + (index * Math.PI * 2) / 3;

      escort.setPosition(this.boss.x + Math.cos(angle) * 260, this.boss.y + Math.sin(angle) * 200).setRotation(angle + Math.PI / 2);
    });

    const move = this.controls.move.value;

    this.player.x = Math.min(worldWidth - 60, Math.max(60, this.player.x + move.x * 320 * delta));
    this.player.y = Math.min(this.app.height - 60, Math.max(60, this.player.y + move.y * 320 * delta));

    if (!this.triggered && this.player.x > worldWidth - 1300) {
      this.triggered = true;
      this.startIntro();
    }
  }

  override draw(context: RenderingContext): void {
    const { width, height } = this.app;

    context.render(this.root, { view: this.view });

    if (this.dialogue.text !== '') {
      this.panel.clear();
      this.panel.fillColor = new Color(0, 0, 0, 0.75);
      this.panel.drawRectangle(120, height - 190, width - 240, 130);
      this.dialogue.setPosition(150, height - 165);
      context.render(this.panel, { view: context.screenView });
      context.render(this.dialogue, { view: context.screenView });
    }

    const status = this.run === null ? 'not started' : this.run.status;

    this.hud.text =
      `Move: WASD/arrows   Fly right to meet the boss   B: replay   Esc: skip   P: pause   N: replace scene\n` +
      `intro: ${status}   runs: ${this.runs}   paused: ${this.app.scenes.paused}${
        this.dialogue.text === '' ? '' : '   Enter/Space: continue'
      }`;
    this.hud.setPosition(16, 12);
    context.render(this.hud, { view: context.screenView });
  }
}

const app = new Application({
  scenes: { BossIntroSequenceScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(16, 16, 24),
});

await startExample(app, () => app.start(BossIntroSequenceScene));
