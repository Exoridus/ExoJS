import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
  Text,
} from '@codexo/exojs';

// #region guide:constants
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const PLAYER_RADIUS = 18;
const PLAYER_SPEED = 260;
const ORB_RADIUS = 14;
const SPAWN_INTERVAL = 0.9;
const ORB_SPEED_MIN = 80;
const ORB_SPEED_MAX = 200;
// #endregion guide:constants

interface OrbData {
  gfx: Graphics;
  vx: number;
  vy: number;
  danger: boolean;
}

class PlayScene extends Scene {
  private world!: Container;
  private player!: Graphics;
  private orbs: OrbData[] = [];
  private px = CANVAS_WIDTH / 2;
  private py = CANVAS_HEIGHT / 2;
  private dx = 0;
  private dy = 0;
  private score = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private scoreText!: Text;
  private timeText!: Text;

  // #region guide:play-init
  override init(): void {
    this.px = CANVAS_WIDTH / 2;
    this.py = CANVAS_HEIGHT / 2;
    this.score = 0;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.dx = 0;
    this.dy = 0;
    this.orbs = [];

    this.world = new Container();

    this.player = new Graphics();
    this.player.fillColor = new Color(80, 160, 255);
    this.player.drawCircle(0, 0, PLAYER_RADIUS);
    this.player.setPosition(this.px, this.py);
    this.world.addChild(this.player);

    this.scoreText = new Text('Score: 0', { fillColor: Color.white, fontSize: 20 });
    this.scoreText.setPosition(16, 14);

    this.timeText = new Text('0.0 s', { fillColor: Color.white, fontSize: 20 });
    this.timeText.setPosition(CANVAS_WIDTH - 90, 14);

    this.inputs.onActive(Keyboard.W, () => {
      this.dy = -1;
    });
    this.inputs.onStop(Keyboard.W, () => {
      if (this.dy < 0) this.dy = 0;
    });
    this.inputs.onActive(Keyboard.Up, () => {
      this.dy = -1;
    });
    this.inputs.onStop(Keyboard.Up, () => {
      if (this.dy < 0) this.dy = 0;
    });

    this.inputs.onActive(Keyboard.S, () => {
      this.dy = 1;
    });
    this.inputs.onStop(Keyboard.S, () => {
      if (this.dy > 0) this.dy = 0;
    });
    this.inputs.onActive(Keyboard.Down, () => {
      this.dy = 1;
    });
    this.inputs.onStop(Keyboard.Down, () => {
      if (this.dy > 0) this.dy = 0;
    });

    this.inputs.onActive(Keyboard.A, () => {
      this.dx = -1;
    });
    this.inputs.onStop(Keyboard.A, () => {
      if (this.dx < 0) this.dx = 0;
    });
    this.inputs.onActive(Keyboard.Left, () => {
      this.dx = -1;
    });
    this.inputs.onStop(Keyboard.Left, () => {
      if (this.dx < 0) this.dx = 0;
    });

    this.inputs.onActive(Keyboard.D, () => {
      this.dx = 1;
    });
    this.inputs.onStop(Keyboard.D, () => {
      if (this.dx > 0) this.dx = 0;
    });
    this.inputs.onActive(Keyboard.Right, () => {
      this.dx = 1;
    });
    this.inputs.onStop(Keyboard.Right, () => {
      if (this.dx > 0) this.dx = 0;
    });
  }

  // #endregion guide:play-init
  // #region guide:spawn-orb
  private spawnOrb(): void {
    const danger = Math.random() < 0.4;
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
    gfx.drawCircle(0, 0, ORB_RADIUS);
    gfx.setPosition(ox, oy);
    this.world.addChild(gfx);
    this.orbs.push({ gfx, vx: ((tx - ox) / dist) * speed, vy: ((ty - oy) / dist) * speed, danger });
  }

  // #endregion guide:spawn-orb
  // #region guide:play-update
  override update(delta: Seconds): void {
    const app = this.app;
    this.elapsed += delta;
    this.spawnTimer += delta;

    if (this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnTimer -= SPAWN_INTERVAL;
      this.spawnOrb();
    }

    const mag = Math.hypot(this.dx, this.dy) || 1;
    if (this.dx !== 0 || this.dy !== 0) {
      this.px += (this.dx / mag) * PLAYER_SPEED * delta;
      this.py += (this.dy / mag) * PLAYER_SPEED * delta;
    }
    this.px = Math.max(PLAYER_RADIUS, Math.min(CANVAS_WIDTH - PLAYER_RADIUS, this.px));
    this.py = Math.max(PLAYER_RADIUS, Math.min(CANVAS_HEIGHT - PLAYER_RADIUS, this.py));
    this.player.setPosition(this.px, this.py);

    // #region guide:collision-loop
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
    // #endregion guide:collision-loop
  }

  // #endregion guide:play-update
  // #region guide:play-draw
  override draw(context: RenderingContext): void {
    context.render(this.world);
    context.render(this.scoreText);
    context.render(this.timeText);
  }

  // #endregion guide:play-draw
  // #region guide:play-destroy
  override destroy(): void {
    for (const orb of this.orbs) {
      orb.gfx.destroy();
    }
    this.world?.destroy();
    super.destroy();
  }
  // #endregion guide:play-destroy
}

// #region guide:game-over-scene
interface GameOverData {
  score: number;
  time: number;
}

class GameOverScene extends Scene<GameOverData> {
  private title!: Text;
  private stats!: Text;
  private hint!: Text;

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
    this.inputs.onTrigger(Keyboard.Space, restart);
    this.inputs.onTrigger(Keyboard.R, restart);
  }

  override draw(context: RenderingContext): void {
    context.render(this.title);
    context.render(this.stats);
    context.render(this.hint);
  }
}
// #endregion guide:game-over-scene

// #region guide:application-setup
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
// #endregion guide:application-setup

app.start(PlayScene);
