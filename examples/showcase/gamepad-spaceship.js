// Auto-generated from gamepad-spaceship.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  AudioBus,
  AudioGenerator,
  BlendModes,
  ButtonAction,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  GamepadButton,
  Graphics,
  Keyboard,
  LowpassFilter,
  Random,
  Scene,
  Sprite,
  Vector,
  VectorAction,
} from '@codexo/exojs';
import {
  AlphaFadeOverLifetime,
  BurstSpawn,
  ColorGradient,
  ColorOverLifetime,
  ConeDirection,
  Constant,
  Curve,
  Drag,
  particlesExtension,
  ParticleSystem,
  Range,
  ScaleOverLifetime,
} from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample, toggle } from '@examples/runtime';
const random = new Random(7);
// The hull points along local -Y; positive SceneNode rotation is counterclockwise.
const headingToRotation = heading => (-heading * 180) / Math.PI - 90;
class GamepadSpaceshipScene extends Scene {
  ship = new Container();
  flame = new Graphics();
  muzzle = new Container().setPosition(0, -32);
  hull;
  playing = true;
  velocity = new Vector(0, 0);
  actions = new ActionMap({
    move: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
    fire: new ButtonAction([Keyboard.Space, GamepadButton.RightTrigger]),
    restart: new ButtonAction([Keyboard.R, GamepadButton.Select]),
  });
  facing = -Math.PI / 2;
  thrust = 0;
  engineBus;
  engineFilter;
  engine = null;
  bullets = [];
  asteroids = [];
  stars = [new Graphics(), new Graphics()];
  fx;
  particles;
  burst;
  pad = null;
  score = 0;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.stars.forEach((layer, index) => {
      for (let i = 0; i < (index === 0 ? 100 : 45); i++) {
        layer.fillColor = new Color(200, 215, 255, index === 0 ? 0.25 : 0.6);
        layer.drawCircle(random.next(-64, width + 64), random.next(-64, height + 64), index === 0 ? 1 : 2);
      }
    });
    this.hull = new Sprite(this.loader.get(assets.ship)).setAnchor(0.5).setScale(0.75);
    this.ship.addChild(this.flame);
    this.ship.addChild(this.hull);
    this.ship.addChild(this.muzzle);
    this.ship.setPosition(width / 2, height / 2);
    this.inputs.attach(this.actions);
    // A raw sawtooth is harsh; a low-pass on its own bus turns it into a
    // rumble, and opening the filter with thrust reads as the engine spooling up.
    this.engineBus = new AudioBus('engine', { parent: app.audio.sound });
    app.audio.registerBus(this.engineBus);
    this.engineFilter = new LowpassFilter({ frequency: 300, resonance: 1.5 });
    this.engineBus.addEffect(this.engineFilter);
    // An oscillator started while audio is still locked is dropped, so the
    // engine starts from the unlock gesture; onUnlock replays if audio is
    // already unlocked.
    app.audio.onUnlock.add(this.startEngine);
    this.fx = new Graphics();
    this.particles = new ParticleSystem(this.loader.get(assets.particleSpark), { capacity: 4000 });
    this.particles.setBlendMode(BlendModes.Additive);
    this.systems.add(this.particles);
    this.burst = new BurstSpawn({
      schedule: [{ time: 0, count: 70 }],
      lifetime: new Range(0.35, 0.8),
      position: new Constant(new Vector(0, 0)),
      velocity: ConeDirection.omni(80, 420),
      scale: new Constant(new Vector(0.08, 0.08)),
    });
    this.particles.addSpawnModule(this.burst);
    this.particles.addUpdateModule(new Drag(2.5));
    this.particles.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(255, 250, 220, 1) },
          { t: 0.35, color: new Color(255, 170, 70, 1) },
          { t: 1, color: new Color(200, 60, 30, 1) },
        ]),
      ),
    );
    this.particles.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.08 },
          { t: 1, v: 0.02 },
        ]),
      ),
    );
    this.particles.addUpdateModule(new AlphaFadeOverLifetime());
    this.pad = app.input.getGamepad(0);
    this.hud = demoPanel({
      scene: this,
      layout: 'bar',
      controls: { sound: toggle('Engine sound'), haptics: toggle('Haptics') },
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
          if (!this.playing) {
            this.pad?.stopVibration();
            if (this.engine) {
              this.engine.volume = 0;
            }
          }
        },
        Restart: () => this.restart(),
      },
      onChange: (key, value) => {
        if (key === 'sound') {
          if (value) {
            this.startEngine();
          } else {
            this.engine?.stop();
            this.engine = null;
          }
        }
        if (key === 'haptics' && !value) {
          this.pad?.stopVibration();
        }
      },
    });
    this.restart();
  }
  restart() {
    random.reset();
    this.ship.setPosition(this.app.width / 2, this.app.height / 2).setRotation(0);
    this.facing = -Math.PI / 2;
    this.velocity.set(0, 0);
    this.thrust = 0;
    this.score = 0;
    this.bullets.length = 0;
    this.asteroids = Array.from({ length: 5 }, (_, index) => ({
      ...this.spawnAsteroid(this.app.width, this.app.height),
      x: this.app.width * (0.12 + index * 0.19),
      y: this.app.height * (index % 2 === 0 ? 0.2 : 0.55),
    }));
    this.pad?.stopVibration();
    if (this.engine) {
      this.engine.volume = 0;
    }
    this.playing = true;
  }
  startEngine = () => {
    if (!this.hud?.values.sound || this.app.audio.locked) {
      return;
    }
    this.engine ??= this.app.audio.play(new AudioGenerator({ type: 'sawtooth', frequency: 55 }), { bus: this.engineBus, volume: 0 });
  };
  spawnAsteroid(width, height) {
    const fromLeft = random.next() < 0.5;
    const radius = random.next(20, 38);
    return {
      x: fromLeft ? -40 : width + 40,
      y: random.next(0, height),
      vx: (fromLeft ? 1 : -1) * random.next(18, 42),
      vy: random.next(-18, 18),
      radius,
      angle: random.next(0, Math.PI * 2),
      spin: random.next(-0.8, 0.8),
      shape: Array.from({ length: 9 }, () => random.next(0.72, 1.05)),
    };
  }
  fire() {
    const origin = new Vector(0, 0).transform(this.muzzle.getGlobalTransform());
    const nose = new Vector(0, -1).transform(this.muzzle.getGlobalTransform()).subtract(origin.x, origin.y).normalize();
    this.bullets.push({ x: origin.x, y: origin.y, vx: nose.x * 680 + this.velocity.x, vy: nose.y * 680 + this.velocity.y, life: 1.1 });
    if (this.hud.values.haptics && this.pad?.canVibrate) {
      void this.pad.vibrate({ duration: 80, strongMagnitude: 0.15, weakMagnitude: 0.45 });
    }
  }
  impact(x, y) {
    this.particles.setPosition(x, y);
    this.burst.reset();
    this.score += 1;
    if (this.hud.values.haptics && this.pad?.canVibrate) {
      void this.pad.vibrate({ duration: 160, strongMagnitude: 0.7, weakMagnitude: 0.4 });
    }
  }
  update(delta) {
    const { width } = this.app;
    const fit = this.hud.fit(this.app, this.app.canvas);
    const height = fit.contentHeight * fit.scale;
    this.ship.setScale(fit.scale);
    this.hud.status(
      `Score ${this.score} | ${this.pad?.connected ? 'Pad 1 + keyboard' : 'Keyboard fallback; pad absent'} | ${this.playing ? 'Thrust / coast / fire' : 'Paused'}`,
    );
    if (this.actions.restart.pressed) {
      this.restart();
    }
    if (!this.playing) {
      return;
    }
    const input = this.actions.move.value;
    const mag = Math.min(1, Math.hypot(input.x, input.y));
    if (this.actions.fire.pressed) {
      this.fire();
    }
    if (mag > 0.05) {
      this.facing = Math.atan2(input.y, input.x);
      this.ship.setRotation(headingToRotation(this.facing));
      this.velocity.x += Math.cos(this.facing) * mag * 420 * delta;
      this.velocity.y += Math.sin(this.facing) * mag * 420 * delta;
    }
    this.thrust += ((mag > 0.05 ? mag : 0) - this.thrust) * Math.min(1, delta * 10);
    if (this.engine) {
      this.engine.volume = this.thrust * 0.22;
      this.engineFilter.frequency = 300 + this.thrust * 900;
    }
    this.ship.move(this.velocity.x * delta, this.velocity.y * delta);
    const damping = Math.pow(0.985, delta * 60);
    this.velocity.x *= damping;
    this.velocity.y *= damping;
    this.wrap(this.ship.position, width, height, 32);
    this.stars.forEach((layer, index) => layer.setPosition(-this.velocity.x * (index + 1) * 0.015, -this.velocity.y * (index + 1) * 0.015));
    for (const asteroid of this.asteroids) {
      asteroid.x += asteroid.vx * delta;
      asteroid.y += asteroid.vy * delta;
      asteroid.angle += asteroid.spin * delta;
      this.wrap(asteroid, width, height, asteroid.radius + 8);
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
      bullet.life -= delta;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > width + 20 || bullet.y < -20 || bullet.y > height + 20) {
        this.bullets.splice(i, 1);
        continue;
      }
      for (let a = 0; a < this.asteroids.length; a++) {
        const asteroid = this.asteroids[a];
        if (Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y) < asteroid.radius) {
          this.impact(asteroid.x, asteroid.y);
          this.asteroids[a] = this.spawnAsteroid(width, height);
          this.bullets.splice(i, 1);
          break;
        }
      }
    }
  }
  wrap(point, width, height, margin) {
    if (point.x < -margin) {
      point.x = width + margin;
    } else if (point.x > width + margin) {
      point.x = -margin;
    }
    if (point.y < -margin) {
      point.y = height + margin;
    } else if (point.y > height + margin) {
      point.y = -margin;
    }
  }
  draw(context) {
    const fx = this.fx.clear();
    fx.lineWidth = 2;
    fx.lineColor = new Color(150, 160, 180);
    fx.fillColor = new Color(70, 74, 88);
    for (const asteroid of this.asteroids) {
      const points = [];
      asteroid.shape.forEach((factor, index) => {
        const angle = asteroid.angle + (index / asteroid.shape.length) * Math.PI * 2;
        points.push(asteroid.x + Math.cos(angle) * asteroid.radius * factor, asteroid.y + Math.sin(angle) * asteroid.radius * factor);
      });
      fx.drawPolygon(points);
    }
    fx.lineWidth = 0;
    this.flame.clear();
    if (this.thrust > 0.05) {
      const length = 14 + this.thrust * 26;
      this.flame.fillColor = new Color(255, 150, 60, 0.85);
      this.flame.drawPolygon([-7, 22, 0, 22 + length, 7, 22]);
      this.flame.fillColor = new Color(255, 240, 200);
      this.flame.drawCircle(0, 24, 4);
    }
    for (const bullet of this.bullets) {
      fx.fillColor = new Color(120, 230, 255, 0.35);
      fx.drawCircle(bullet.x, bullet.y, 7);
      fx.fillColor = new Color(220, 250, 255);
      fx.drawCircle(bullet.x, bullet.y, 3);
    }
    for (const layer of this.stars) {
      context.render(layer);
    }
    context.render(this.fx);
    context.render(this.particles);
    context.render(this.ship);
  }
  destroy() {
    this.app.audio.onUnlock.remove(this.startEngine);
    this.engine?.stop();
    this.engineBus.removeEffect(this.engineFilter);
    this.engineFilter.destroy();
    this.app.audio.unregisterBus(this.engineBus);
    this.pad?.stopVibration();
    this.hud?.dispose();
    for (const layer of this.stars) {
      layer.destroy();
    }
    this.fx?.destroy();
    this.ship?.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { GamepadSpaceshipScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(6, 8, 16),
  extensions: [particlesExtension],
});
await startExample(app, () => app.start(GamepadSpaceshipScene));
