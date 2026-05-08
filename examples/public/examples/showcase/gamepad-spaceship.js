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
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { ship: 'image/bunny.png', particle: 'image/particle.png' });
        }
        init(loader) {
            this._ship = new Sprite(loader.get(Texture, 'ship')).setAnchor(0.5).setScale(1.2).setPosition(400, 300);
            this._velocity = new Vector(0, 0);
            this._thrust = new Vector(0, 0);
            this._engine = new OscillatorSound({ type: 'sawtooth', frequency: 90, volume: 0 }).play();

            this._rate = new Constant(0);
            this._particles = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 8000 });
            this._particles.addSpawnModule(
                new RateSpawn({
                    rate: this._rate,
                    lifetime: new Constant(0.6),
                    position: new Constant(new Vector(0, 0)),
                    velocity: new Constant(new Vector(0, 0)),
                    scale: new Constant(new Vector(0.16, 0.16)),
                })
            );
            this._particles.addUpdateModule(new AlphaFadeOverLifetime());

            const pad = this.app.input.getGamepad(0);
            pad.onActive(GamepadAxis.LeftStickX, v => {
                this._thrust.x = v;
            });
            pad.onStop(GamepadAxis.LeftStickX, () => {
                this._thrust.x = 0;
            });
            pad.onActive(GamepadAxis.LeftStickY, v => {
                this._thrust.y = v;
            });
            pad.onStop(GamepadAxis.LeftStickY, () => {
                this._thrust.y = 0;
            });
        }
        update(delta) {
            const mag = Math.min(1, Math.hypot(this._thrust.x, this._thrust.y));
            if (mag > 0.05) {
                const angle = Math.atan2(this._thrust.y, this._thrust.x);
                this._ship.setRotation((angle * 180) / Math.PI + 90);
                this._velocity.x += Math.cos(angle) * mag * 420 * delta.seconds;
                this._velocity.y += Math.sin(angle) * mag * 420 * delta.seconds;
                this._rate.value = 900 * mag;
                this._engine.volume = 0.08 + mag * 0.32;
                this._particles.setPosition(this._ship.position.x - Math.cos(angle) * 28, this._ship.position.y - Math.sin(angle) * 28);
            } else {
                this._rate.value = 0;
                this._engine.volume = 0;
            }
            this._ship.move(this._velocity.x * delta.seconds, this._velocity.y * delta.seconds);
            this._velocity.x *= 0.985;
            this._velocity.y *= 0.985;
            this._particles.update(delta);
        }
        draw(backend) {
            backend.clear();
            this._particles.render(backend);
            this._ship.render(backend);
        }
    })()
);
