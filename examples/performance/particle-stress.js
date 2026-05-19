import {
    AlphaFadeOverLifetime,
    Application,
    ApplyForce,
    Color,
    Constant,
    Curve,
    ParticleSystem,
    Range,
    RateSpawn,
    ScaleOverLifetime,
    Scene,
    Texture,
    UpdateModule,
    VectorRange,
} from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: new Color(0.02 * 255, 0.02 * 255, 0.045 * 255, 1),
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

class TintCycle extends UpdateModule {
    constructor(palette) {
        super();
        this._palette = palette;
        this._next = 0;
    }
    apply(system) {
        const { color, liveCount, elapsed } = system;
        for (let i = 0; i < liveCount; i++) {
            if (elapsed[i] === 0) {
                color[i] = this._palette[this._next++ % this._palette.length].toRgba();
            }
        }
    }
}

app.start(
    new (class extends Scene {
        init() {
            const { width, height } = this.app.canvas;

            this._sharedTexture = createParticleTexture();
            this._particleSystems = [];

            this._particleSystems.push(
                this._buildSystem({
                    x: width * 0.24,
                    y: height * 0.78,
                    rate: 240,
                    force: { x: 10, y: 120 },
                    scaleStart: 0.94,
                    palette: [Color.orange, Color.tomato, Color.gold, Color.mistyRose],
                    positionRangeX: 28,
                    positionRangeY: 12,
                    velocityRangeX: 90,
                    velocityMinY: -330,
                    velocityMaxY: -170,
                    scaleMin: 0.42,
                    rotationMax: 260,
                    lifetimeMin: 0.95,
                    lifetimeMax: 1.6,
                })
            );

            this._particleSystems.push(
                this._buildSystem({
                    x: width * 0.5,
                    y: height * 0.82,
                    rate: 320,
                    force: { x: 0, y: 150 },
                    scaleStart: 0.88,
                    palette: [Color.skyBlue, Color.deepSkyBlue, Color.mediumTurquoise, Color.white],
                    positionRangeX: 38,
                    positionRangeY: 16,
                    velocityRangeX: 130,
                    velocityMinY: -305,
                    velocityMaxY: -155,
                    scaleMin: 0.36,
                    rotationMax: 320,
                    lifetimeMin: 0.8,
                    lifetimeMax: 1.45,
                })
            );

            this._particleSystems.push(
                this._buildSystem({
                    x: width * 0.76,
                    y: height * 0.76,
                    rate: 240,
                    force: { x: -12, y: 118 },
                    scaleStart: 0.92,
                    palette: [Color.violet, Color.hotPink, Color.deepPink, Color.plum],
                    positionRangeX: 26,
                    positionRangeY: 10,
                    velocityRangeX: 95,
                    velocityMinY: -320,
                    velocityMaxY: -165,
                    scaleMin: 0.4,
                    rotationMax: 280,
                    lifetimeMin: 0.9,
                    lifetimeMax: 1.55,
                })
            );
        }
        _buildSystem(config) {
            const system = new ParticleSystem(this._sharedTexture, { capacity: 4096 });

            system.setPosition(config.x, config.y);

            system.addSpawnModule(
                new RateSpawn({
                    rate: new Constant(config.rate),
                    lifetime: new Range(config.lifetimeMin, config.lifetimeMax),
                    position: new VectorRange(-config.positionRangeX, config.positionRangeX, -config.positionRangeY, config.positionRangeY),
                    velocity: new VectorRange(-config.velocityRangeX, config.velocityRangeX, config.velocityMinY, config.velocityMaxY),
                    scale: new VectorRange(config.scaleMin, config.scaleStart, config.scaleMin, config.scaleStart),
                    rotationSpeed: new Range(-config.rotationMax, config.rotationMax),
                })
            );
            system.addUpdateModule(new ApplyForce(config.force.x, config.force.y));
            system.addUpdateModule(
                new ScaleOverLifetime(
                    new Curve([
                        { t: 0, v: config.scaleStart },
                        { t: 1, v: 0.05 },
                    ])
                )
            );
            system.addUpdateModule(new TintCycle(config.palette));
            system.addUpdateModule(
                new AlphaFadeOverLifetime(
                    new Curve([
                        { t: 0, v: 1 },
                        { t: 1, v: 0 },
                    ])
                )
            );

            return { instance: system, baseX: config.x, baseY: config.y };
        }
        update(delta) {
            const time = this.app.activeTime.seconds;

            for (let i = 0; i < this._particleSystems.length; i++) {
                const entry = this._particleSystems[i];
                const wave = time + i * 1.2;

                entry.instance.setPosition(entry.baseX + Math.sin(wave * 1.4) * 18, entry.baseY + Math.cos(wave * 1.7) * 10);
                entry.instance.rotation = Math.sin(wave * 0.9) * 5;
                entry.instance.update(delta);
            }
        }
        draw(backend) {
            backend.clear();

            for (const entry of this._particleSystems) {
                entry.instance.render(backend);
            }
        }
        unload() {
            this._destroySystems();
        }
        destroy() {
            this._destroySystems();
        }
        _destroySystems() {
            if (this._particleSystems) {
                for (const entry of this._particleSystems) entry.instance?.destroy();

                this._particleSystems = null;
            }
            this._sharedTexture = null;
        }
    })()
).catch(error => {
    app.canvas.remove();
    app.destroy();

    throw error;
});

function createParticleTexture() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = 56;
    canvas.height = 56;

    if (!context) {
        throw new Error('Could not create a 2D canvas context for the particle stress texture.');
    }

    const gradient = context.createRadialGradient(28, 28, 2, 28, 28, 28);

    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.98)');
    gradient.addColorStop(0.46, 'rgba(255, 255, 255, 0.72)');
    gradient.addColorStop(0.78, 'rgba(255, 255, 255, 0.16)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    return new Texture(canvas);
}
