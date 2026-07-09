// Auto-generated from fireworks.ts — edit the .ts source, not this file.
import { Application, BlendModes, Color, Random, Scene, Size, Sprite, Time, Timer, Vector, } from '@codexo/exojs';
import { AlphaFadeOverLifetime, ApplyForce, BurstSpawn, ConeDirection, Constant, Curve, particlesExtension, ParticleSystem, Range, } from '@codexo/exojs-particles';
import { mountControls } from '@examples/runtime';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    extensions: [particlesExtension],
});
const random = new Random();
const autoLaunchInterval = Time.fromSeconds(2.2);
const tailDuration = 2.5;
const particlesPerExplosion = 375;
// Upward launch speed range (px/s, negative = up). Higher = higher apex.
const launchSpeedMin = 360;
const launchSpeedMax = 460;
// Gravity applied to rockets (px/s²). Matches the burst gravity so the shower
// drifts down at the same rate the rocket decelerated rising.
const rocketGravity = 200;
const fireworkColors = [
    new Color(100, 255, 135),
    new Color(175, 255, 135),
    new Color(85, 190, 255),
    new Color(255, 145, 255),
    new Color(100, 100, 255),
    new Color(140, 250, 190),
    new Color(255, 135, 135),
    new Color(240, 255, 135),
    new Color(245, 215, 80),
];
class FireworksScene extends Scene {
    canvasSize;
    explosions;
    burstPosition;
    burst;
    autoLaunchTimer;
    rocketTexture;
    rockets = [];
    launchCount = 0;
    hud;
    async load(loader) {
        await loader.load(assets.demo.textures.particleStar);
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.canvasSize = new Size(width, height);
        this.rocketTexture = loader.get(assets.demo.textures.particleStar);
        // Single explosion system shared by every detonation. We reposition and
        // re-tint a single BurstSpawn, then reset() it to fire one burst.
        this.explosions = new ParticleSystem(this.rocketTexture, { capacity: 16384 });
        this.explosions.setBlendMode(BlendModes.Additive);
        this.burstPosition = new Vector(0, 0);
        this.burst = new BurstSpawn({
            schedule: [{ time: 0, count: particlesPerExplosion }],
            lifetime: new Range(tailDuration * 0.7, tailDuration),
            position: new Constant(this.burstPosition),
            velocity: ConeDirection.omni(20, 70),
            scale: new Constant(new Vector(0.95, 0.95)),
            tint: new Constant(fireworkColors[0]),
        });
        this.explosions.addSpawnModule(this.burst);
        this.explosions.addUpdateModule(new ApplyForce(0, 30));
        this.explosions.addUpdateModule(new AlphaFadeOverLifetime(new Curve([
            { t: 0, v: 1 },
            { t: 1, v: 0 },
        ])));
        // Click anywhere to launch a rocket from the bottom at that x.
        this.app.input.onPointerDown.add(pointer => this.launchRocket(pointer.x));
        // Ambient fallback: keep the sky alive even without clicks.
        this.autoLaunchTimer = new Timer(autoLaunchInterval, true);
        this.hud = mountControls({
            title: 'Fireworks',
            controls: [{ keys: 'Click', action: 'launch a rocket' }],
            status: 'Launched: 0 · in flight: 0',
            hint: 'Each rocket rises and bursts at its apex. Rockets also auto-launch every couple of seconds.',
        });
    }
    launchRocket(x) {
        const color = fireworkColors[(random.next(0, fireworkColors.length - 1) + 0.5) | 0];
        const sprite = new Sprite(this.rocketTexture);
        sprite.setAnchor(0.5).setBlendMode(BlendModes.Additive).setTint(color).setScale(0.7);
        const position = new Vector(x, this.canvasSize.height);
        sprite.setPosition(position.x, position.y);
        this.rockets.push({
            sprite,
            position,
            velocityY: -random.next(launchSpeedMin, launchSpeedMax),
            color,
        });
        this.launchCount++;
        this.updateStatus();
    }
    detonate(rocket) {
        this.burstPosition.set(rocket.position.x, rocket.position.y);
        this.burst.config.tint = new Constant(rocket.color);
        this.burst.reset();
    }
    updateStatus() {
        this.hud.setStatus(`Launched: ${this.launchCount} · in flight: ${this.rockets.length}`);
    }
    update(delta) {
        const dt = delta.seconds;
        if (this.autoLaunchTimer.expired) {
            this.launchRocket(random.next(80, this.canvasSize.width - 80));
            this.autoLaunchTimer.restart();
        }
        // Integrate rockets; detonate the instant a rocket's upward velocity
        // turns over (its apex), then retire it.
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const rocket = this.rockets[i];
            rocket.velocityY += rocketGravity * dt;
            rocket.position.y += rocket.velocityY * dt;
            rocket.sprite.setPosition(rocket.position.x, rocket.position.y);
            if (rocket.velocityY >= 0 || rocket.position.y <= 0) {
                this.detonate(rocket);
                rocket.sprite.destroy();
                this.rockets.splice(i, 1);
                this.updateStatus();
            }
        }
        this.explosions.update(delta);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.explosions);
        for (const rocket of this.rockets) {
            context.render(rocket.sprite);
        }
    }
}
app.start(new FireworksScene());
