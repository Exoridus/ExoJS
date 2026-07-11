// Auto-generated from gamepad-spaceship.ts — edit the .ts source, not this file.
import { Application, AudioGenerator, Color, GamepadAxis, GamepadButton, Graphics, Scene, Sprite, Text, Vector } from '@codexo/exojs';
import { AlphaFadeOverLifetime, BurstSpawn, ConeDirection, Constant, particlesExtension, ParticleSystem, } from '@codexo/exojs-particles';
import { mountControls } from '@examples/runtime';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(8, 10, 18),
    extensions: [particlesExtension],
});
class GamepadSpaceshipScene extends Scene {
    ship;
    velocity = new Vector(0, 0);
    thrust = new Vector(0, 0);
    facing = -Math.PI / 2;
    engine;
    bullets = [];
    asteroids = [];
    fx;
    particles;
    burst;
    pad = null;
    score = 0;
    hasPad = false;
    connectPrompt;
    hud;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.ship = new Sprite(this.loader.get(assets.demo.textures.shipA)).setAnchor(0.5).setScale(0.5).setPosition(width / 2, height / 2);
        this.engine = app.audio.play(new AudioGenerator({ type: 'sawtooth', frequency: 90 }), { volume: 0 });
        this.fx = new Graphics();
        this.particles = new ParticleSystem(this.loader.get(assets.demo.textures.particleSpark), { capacity: 4000 });
        this.burst = new BurstSpawn({
            schedule: [{ time: 0, count: 60 }],
            lifetime: new Constant(0.5),
            position: new Constant(new Vector(0, 0)),
            velocity: ConeDirection.omni(120, 320),
            scale: new Constant(new Vector(0.16, 0.16)),
        });
        this.particles.addSpawnModule(this.burst);
        this.particles.addUpdateModule(new AlphaFadeOverLifetime());
        for (let i = 0; i < 4; i++) {
            this.asteroids.push(this.spawnAsteroid(width, height));
        }
        this.pad = app.input.getGamepad(0);
        this.pad.onActive(GamepadAxis.LeftStickX, (v) => (this.thrust.x = v));
        this.pad.onStop(GamepadAxis.LeftStickX, () => (this.thrust.x = 0));
        this.pad.onActive(GamepadAxis.LeftStickY, (v) => (this.thrust.y = v));
        this.pad.onStop(GamepadAxis.LeftStickY, () => (this.thrust.y = 0));
        this.pad.onStart(GamepadButton.RightTrigger, () => this.fire());
        // Track controller presence with the engine's connect/disconnect signals
        // and prompt with an on-screen Text while none is attached.
        this.hasPad = app.input.gamepads.some(pad => pad.connected);
        app.input.onGamepadConnected.add(() => (this.hasPad = true));
        app.input.onGamepadDisconnected.add(() => (this.hasPad = app.input.gamepads.some(pad => pad.connected)));
        this.connectPrompt = new Text('Connect a controller to fly', { fillColor: Color.white, fontSize: 24, align: 'center' })
            .setAnchor(0.5, 0.5)
            .setPosition(width / 2, height / 2);
        this.hud = mountControls({
            title: 'Gamepad Spaceship',
            controls: [
                { keys: 'L-Stick', action: 'steer & thrust' },
                { keys: 'R-Trigger', action: 'fire' },
            ],
            status: 'Score: 0',
        });
    }
    spawnAsteroid(width, height) {
        const fromLeft = Math.random() < 0.5;
        return {
            x: fromLeft ? -20 : width + 20,
            y: Math.random() * height,
            vx: (fromLeft ? 1 : -1) * (40 + Math.random() * 60),
            vy: (Math.random() - 0.5) * 80,
            radius: 18 + Math.random() * 16,
        };
    }
    fire() {
        this.bullets.push({
            x: this.ship.position.x + Math.cos(this.facing) * 26,
            y: this.ship.position.y + Math.sin(this.facing) * 26,
            vx: Math.cos(this.facing) * 640,
            vy: Math.sin(this.facing) * 640,
            life: 1.1,
        });
        if (this.pad?.canVibrate) {
            void this.pad.vibrate({ duration: 80, strongMagnitude: 0.15, weakMagnitude: 0.45 });
        }
    }
    impact(x, y) {
        this.particles.setPosition(x, y);
        this.burst.reset();
        this.score += 1;
        this.hud.setStatus(`Score: ${this.score}`);
        if (this.pad?.canVibrate) {
            void this.pad.vibrate({ duration: 160, strongMagnitude: 0.7, weakMagnitude: 0.4 });
        }
    }
    update(delta) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const mag = Math.min(1, Math.hypot(this.thrust.x, this.thrust.y));
        if (mag > 0.05) {
            this.facing = Math.atan2(this.thrust.y, this.thrust.x);
            this.ship.setRotation((this.facing * 180) / Math.PI + 90);
            this.velocity.x += Math.cos(this.facing) * mag * 420 * delta.seconds;
            this.velocity.y += Math.sin(this.facing) * mag * 420 * delta.seconds;
            this.engine.volume = 0.08 + mag * 0.3;
        }
        else {
            this.engine.volume = 0;
        }
        this.ship.move(this.velocity.x * delta.seconds, this.velocity.y * delta.seconds);
        this.velocity.x *= 0.985;
        this.velocity.y *= 0.985;
        this.wrap(this.ship.position, width, height);
        for (const asteroid of this.asteroids) {
            asteroid.x += asteroid.vx * delta.seconds;
            asteroid.y += asteroid.vy * delta.seconds;
            this.wrap(asteroid, width, height);
        }
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.x += bullet.vx * delta.seconds;
            bullet.y += bullet.vy * delta.seconds;
            bullet.life -= delta.seconds;
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
        this.particles.update(delta);
    }
    wrap(point, width, height) {
        if (point.x < -24)
            point.x = width + 24;
        else if (point.x > width + 24)
            point.x = -24;
        if (point.y < -24)
            point.y = height + 24;
        else if (point.y > height + 24)
            point.y = -24;
    }
    draw(context) {
        context.backend.clear();
        this.fx.clear();
        this.fx.fillColor = new Color(120, 130, 150);
        for (const asteroid of this.asteroids) {
            this.fx.drawCircle(asteroid.x, asteroid.y, asteroid.radius);
        }
        this.fx.fillColor = new Color(120, 230, 255);
        for (const bullet of this.bullets) {
            this.fx.drawCircle(bullet.x, bullet.y, 4);
        }
        context.render(this.fx);
        context.render(this.particles);
        context.render(this.ship);
        if (!this.hasPad) {
            context.render(this.connectPrompt);
        }
    }
}
app.start(new GamepadSpaceshipScene());
