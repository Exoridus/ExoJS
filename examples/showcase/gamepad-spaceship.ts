import { textures } from '@assets';
import {
    AlphaFadeOverLifetime,
    Application,
    Color,
    Constant,
    GamepadAxis,
    OscillatorSound,
    ParticleSystem,
    RateSpawn,
    Scene,
    Sprite,
    Texture,
    Vector,
} from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

class GamepadSpaceshipScene extends Scene {
    private ship!: Sprite;
    private velocity!: Vector;
    private thrust!: Vector;
    private engine!: OscillatorSound;
    private rate!: any;
    private particles!: ParticleSystem;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { ship: textures.shipA, particle: textures.particleSpark });
    }

    override init(loader): void {
        this.ship = new Sprite(loader.get(Texture, 'ship')).setAnchor(0.5).setScale(0.5).setPosition(400, 300);
        this.velocity = new Vector(0, 0);
        this.thrust = new Vector(0, 0);
        this.engine = new OscillatorSound({ type: 'sawtooth', frequency: 90, volume: 0 }).play();

        this.rate = new Constant(0) as any;
        this.particles = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 8000 });
        this.particles.addSpawnModule(
            new RateSpawn({
                rate: this.rate,
                lifetime: new Constant(0.6),
                position: new Constant(new Vector(0, 0)),
                velocity: new Constant(new Vector(0, 0)),
                scale: new Constant(new Vector(0.16, 0.16)),
            }),
        );
        this.particles.addUpdateModule(new AlphaFadeOverLifetime());

        const pad = this.app.input.getGamepad(0);
        pad.onActive(GamepadAxis.LeftStickX, (v: number) => { this.thrust.x = v; });
        pad.onStop(GamepadAxis.LeftStickX, () => { this.thrust.x = 0; });
        pad.onActive(GamepadAxis.LeftStickY, (v: number) => { this.thrust.y = v; });
        pad.onStop(GamepadAxis.LeftStickY, () => { this.thrust.y = 0; });
    }

    override update(delta): void {
        const mag = Math.min(1, Math.hypot(this.thrust.x, this.thrust.y));
        if (mag > 0.05) {
            const angle = Math.atan2(this.thrust.y, this.thrust.x);
            this.ship.setRotation((angle * 180) / Math.PI + 90);
            this.velocity.x += Math.cos(angle) * mag * 420 * delta.seconds;
            this.velocity.y += Math.sin(angle) * mag * 420 * delta.seconds;
            this.rate.value = 900 * mag;
            this.engine.volume = 0.08 + mag * 0.32;
            this.particles.setPosition(this.ship.position.x - Math.cos(angle) * 28, this.ship.position.y - Math.sin(angle) * 28);
        } else {
            this.rate.value = 0;
            this.engine.volume = 0;
        }
        this.ship.move(this.velocity.x * delta.seconds, this.velocity.y * delta.seconds);
        this.velocity.x *= 0.985;
        this.velocity.y *= 0.985;
        this.particles.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.particles);
        context.render(this.ship);
    }
}

app.start(new GamepadSpaceshipScene());
