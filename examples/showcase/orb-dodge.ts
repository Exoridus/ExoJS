import {
  ActionMap,
  Application,
  BlurFilter,
  ButtonAction,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  GamepadButton,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  SceneAvailability,
  type Seconds,
  type Sprite,
  Spritesheet,
  type SpritesheetData,
  Text,
  type Tween,
  VectorAction,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample } from '@examples/runtime';

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const PLAYER_RADIUS = 18;
const PLAYER_SPEED = 260;
const ORB_RADIUS = 14;
const SPAWN_INTERVAL = 0.9;
const ORB_SPEED_MIN = 80;
const ORB_SPEED_MAX = 200;

interface OrbData {
  gfx: Graphics;
  vx: number;
  vy: number;
  danger: boolean;
}

class PlayScene extends Scene {
  private world!: Container;
  private player!: Sprite;
  private sheetData!: SpritesheetData;
  private panel!: ReturnType<typeof demoPanel>;
  private pauseText!: Text;
  private readonly blur = new BlurFilter({ strength: 0 });
  private blurTween: Tween | null = null;
  private navigating = false;
  private orbs: OrbData[] = [];
  private px = CANVAS_WIDTH / 2;
  private py = CANVAS_HEIGHT / 2;
  private readonly actions = new ActionMap({
    pause: new ButtonAction([Keyboard.P, Keyboard.Escape, GamepadButton.Start]),
    restart: new ButtonAction([Keyboard.R, Keyboard.Space, GamepadButton.South]),
    move: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
  });
  private score = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private scoreText!: Text;
  private timeText!: Text;

  override async load(): Promise<void> {
    await this.loader.load(assets.platformerCharactersImage);
    this.sheetData = await this.loader.load(assets.platformerCharactersAtlas);
  }

  private togglePause(): void {
    const pausing = !this.paused;
    this.blurTween?.stop();

    if (pausing) {
      this.app.scenes.pause();
      this.world.filters = [this.blur];
      this.blurTween = this.app.tweens.create(this.blur).to({ strength: 3 }, 0.35).start();
    } else {
      this.app.scenes.resume();
      this.world.clearFilters();
      this.blur.strength = 0;
    }

    this.panel.status(
      pausing ? 'Paused - overlay blur keeps tweening while gameplay time freezes.' : 'Collect circles; avoid pointed red hazards.',
    );
  }

  private restart(): void {
    if (this.navigating) {
      return;
    }

    this.navigating = true;
    void this.app.scenes.change(PlayScene);
  }

  override init(): void {
    this.px = CANVAS_WIDTH / 2;
    this.py = CANVAS_HEIGHT / 2;
    this.score = 0;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.orbs = [];
    this.inputs.attach(this.actions, { when: SceneAvailability.Always });

    this.world = new Container();

    this.player = new Spritesheet(this.loader.get(assets.platformerCharactersImage), this.sheetData).getFrameSprite(
      'character_green_front',
    );
    this.player.setAnchor(0.5).setScale(0.38);
    this.player.setPosition(this.px, this.py);
    this.world.addChild(this.player);

    this.scoreText = new Text('Score: 0', { fillColor: Color.white, fontSize: 20 });
    this.scoreText.setPosition(16, 14);

    this.timeText = new Text('0.0 s', { fillColor: Color.white, fontSize: 20 });
    this.timeText.setPosition(CANVAS_WIDTH - 90, 14);
    this.pauseText = this.track(new Text('PAUSED', { fillColor: Color.white, fontWeight: 'bold' })).setAnchor(0.5);
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Orb Dodge',
      controls: {},
      hint: 'Move: WASD / arrows / stick. Pause: P / Esc / Start. Restart: R / Space / South.',
      actions: { 'Pause / Resume': () => this.togglePause(), Restart: () => this.restart() },
    });
    this.panel.status('Collect circles; avoid pointed red hazards.');
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden && !this.paused) {
          this.togglePause();
        }
      },
      { signal: this.lifecycleSignal },
    );
    [false, true, false].forEach((danger, index) => {
      this.spawnOrb(danger);
      this.orbs.at(-1)!.gfx.setPosition(((index + 1) * CANVAS_WIDTH) / 4, CANVAS_HEIGHT * 0.27);
    });
  }

  private spawnOrb(danger = Math.random() < 0.4): void {
    const side = Math.floor(Math.random() * 4);
    let ox: number;
    let oy: number;

    switch (side) {
      case 0:
        ox = Math.random() * CANVAS_WIDTH;
        oy = -ORB_RADIUS;
        break;
      case 1:
        ox = CANVAS_WIDTH + ORB_RADIUS;
        oy = Math.random() * CANVAS_HEIGHT;
        break;
      case 2:
        ox = Math.random() * CANVAS_WIDTH;
        oy = CANVAS_HEIGHT + ORB_RADIUS;
        break;
      default:
        ox = -ORB_RADIUS;
        oy = Math.random() * CANVAS_HEIGHT;
        break;
    }

    const tx = CANVAS_WIDTH / 2 + (Math.random() - 0.5) * (CANVAS_WIDTH * 0.6);
    const ty = CANVAS_HEIGHT / 2 + (Math.random() - 0.5) * (CANVAS_HEIGHT * 0.6);
    const dist = Math.hypot(tx - ox, ty - oy) || 1;
    const speed = ORB_SPEED_MIN + Math.random() * (ORB_SPEED_MAX - ORB_SPEED_MIN);

    const gfx = new Graphics();
    gfx.fillColor = danger ? new Color(255, 80, 80) : new Color(80, 220, 120);

    if (danger) {
      gfx.drawStar(0, 0, 4, ORB_RADIUS * 1.25, ORB_RADIUS * 0.68, Math.PI / 4);
    } else {
      gfx.drawCircle(0, 0, ORB_RADIUS);
    }

    gfx.setPosition(ox, oy);
    this.world.addChild(gfx);
    this.orbs.push({ gfx, vx: ((tx - ox) / dist) * speed, vy: ((ty - oy) / dist) * speed, danger });
  }

  override update(delta: Seconds): void {
    const app = this.app;
    this.elapsed += delta;
    this.spawnTimer += delta;

    if (this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnTimer -= SPAWN_INTERVAL;
      this.spawnOrb();
    }

    const { x, y } = this.actions.move.value;
    const mag = Math.max(1, Math.hypot(x, y));

    if (x !== 0 || y !== 0) {
      this.px += (x / mag) * PLAYER_SPEED * delta;
      this.py += (y / mag) * PLAYER_SPEED * delta;
    }

    this.px = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, this.px));
    const viewport = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.py = Math.max(PLAYER_RADIUS, Math.min(viewport.contentHeight * viewport.scale - PLAYER_RADIUS, this.py));
    this.player.setPosition(this.px, this.py);

    let gameEnded = false;
    const survived: OrbData[] = [];

    for (const orb of this.orbs) {
      orb.gfx.move(orb.vx * delta, orb.vy * delta);

      if (gameEnded) {
        this.world.removeChild(orb.gfx);
        orb.gfx.destroy();
        continue;
      }

      const ox = orb.gfx.x;
      const oy = orb.gfx.y;

      if (ox < -80 || ox > CANVAS_WIDTH + 80 || oy < -80 || oy > CANVAS_HEIGHT + 80) {
        this.world.removeChild(orb.gfx);
        orb.gfx.destroy();
        continue;
      }

      const dist = Math.hypot(ox - this.px, oy - this.py);

      if (dist < PLAYER_RADIUS + ORB_RADIUS) {
        this.world.removeChild(orb.gfx);
        orb.gfx.destroy();

        if (orb.danger) {
          for (const o of survived) {
            this.world.removeChild(o.gfx);
            o.gfx.destroy();
          }

          gameEnded = true;
          continue;
        }

        this.score++;
        this.scoreText.text = `Score: ${this.score}`;
        continue;
      }

      survived.push(orb);
    }

    this.orbs = gameEnded ? [] : survived;

    if (gameEnded) {
      void app.scenes.change(GameOverScene, { data: { score: this.score, time: this.elapsed } });

      return;
    }

    this.timeText.text = `${this.elapsed.toFixed(1)} s`;
  }

  override draw(context: RenderingContext): void {
    // Scene draw continues while paused, so these actions can resume the frozen update loop.
    if (this.actions.pause.pressed) {
      this.togglePause();
    }

    if (this.actions.restart.pressed) {
      this.restart();
    }

    const { scale: k, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.scoreText.style.fontSize = 16 * k;
    this.timeText.style.fontSize = 16 * k;
    this.scoreText.setPosition(12 * k, 12 * k);
    this.timeText.setPosition((width - 80) * k, 12 * k);
    this.pauseText.style.fontSize = 32 * k;
    this.pauseText.setPosition((width * k) / 2, (contentHeight * k) / 2);
    context.render(this.world);
    context.render(this.scoreText);
    context.render(this.timeText);

    if (this.paused) {
      context.render(this.pauseText);
    }
  }

  override destroy(): void {
    this.blurTween?.stop();
    this.world?.clearFilters();
    this.panel?.dispose();
    this.scoreText?.destroy();
    this.timeText?.destroy();

    for (const orb of this.orbs) {
      orb.gfx.destroy();
    }

    this.world?.destroy();
    super.destroy();
  }
}

interface GameOverData {
  score: number;
  time: number;
}

class GameOverScene extends Scene<GameOverData> {
  private title!: Text;
  private stats!: Text;
  private hint!: Text;
  private panel!: ReturnType<typeof demoPanel>;
  private readonly actions = new ActionMap({ restart: new ButtonAction([Keyboard.Space, Keyboard.R, GamepadButton.South]) });

  override init(data: Readonly<GameOverData>): void {
    const app = this.app;
    this.title = new Text('GAME OVER', {
      align: 'center',
      fillColor: new Color(255, 80, 80),
      fontSize: 52,
      fontWeight: 'bold',
    });
    this.title.setAnchor(0.5);
    this.title.setPosition(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 70);

    this.stats = new Text(`Score: ${data.score}   Time: ${data.time.toFixed(1)} s`, {
      align: 'center',
      fillColor: Color.white,
      fontSize: 26,
    });
    this.stats.setAnchor(0.5);
    this.stats.setPosition(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    this.hint = new Text('Press Space or R to play again', {
      align: 'center',
      fillColor: new Color(160, 160, 160),
      fontSize: 18,
    });
    this.hint.setAnchor(0.5);
    this.hint.setPosition(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);

    const restart = (): void => {
      void app.scenes.change(PlayScene);
    };

    this.inputs.attach(this.actions);
    this.panel = demoPanel({ layout: 'bar', title: 'Orb Dodge', controls: {}, actions: { Restart: restart } });
    this.track(this.title);
    this.track(this.stats);
    this.track(this.hint);
  }

  override draw(context: RenderingContext): void {
    if (this.actions.restart.pressed) {
      void this.app.scenes.change(PlayScene);
    }

    const { scale: k, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.title.style.fontSize = 32 * k;
    this.stats.style.fontSize = 16 * k;
    this.hint.style.fontSize = 14 * k;
    this.title.setPosition((width * k) / 2, (contentHeight / 2 - 48) * k);
    this.stats.setPosition((width * k) / 2, (contentHeight * k) / 2);
    this.hint.setPosition((width * k) / 2, (contentHeight / 2 + 44) * k);
    context.render(this.title);
    context.render(this.stats);
    context.render(this.hint);
  }

  override destroy(): void {
    this.panel?.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { PlayScene, GameOverScene },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(10, 14, 26),
});

await startExample(app, () => app.start(PlayScene));
