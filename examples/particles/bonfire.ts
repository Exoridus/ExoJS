import { textures } from '@assets';
import {
    Application,
    BlendModes,
    Color,
    Scene,
    Texture,
} from '@codexo/exojs';
import {
    ColorGradient,
    ColorOverLifetime,
    ConeDirection,
    Constant,
    particlesExtension,
    ParticleSystem,
    Range,
    RateSpawn,
    VectorRange,
} from '@codexo/exojs-particles';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    extensions: [particlesExtension],
});

document.body.append(app.canvas);

class BonfireScene extends Scene {
    private fireSystem!: ParticleSystem;
    private smokeSystem!: ParticleSystem;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { flame: textures.particleFlame, smoke: textures.particleSmoke });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.fireSystem = new ParticleSystem(loader.get(Texture, 'flame'));
        this.fireSystem.setPosition(width * 0.5, height * 0.75);
        this.fireSystem.setBlendMode(BlendModes.Additive);

        this.fireSystem.addSpawnModule(
            new RateSpawn({
                rate: new Constant(50),
                lifetime: new Range(5, 10),
                position: new VectorRange(-50, 50, -10, 10),
                velocity: new ConeDirection(-Math.PI / 2, Math.PI / 36, 60, 80),
            }),
        );

        this.fireSystem.addUpdateModule(
            new ColorOverLifetime(
                new ColorGradient([
                    { t: 0, color: new Color(194, 64, 30, 1) },
                    { t: 1, color: new Color(0, 0, 0, 0) },
                ]),
            ),
        );

        this.smokeSystem = new ParticleSystem(loader.get(Texture, 'smoke'));
        this.smokeSystem.setPosition(width * 0.5, height * 0.75 - 40);
        this.smokeSystem.setBlendMode(BlendModes.Normal);

        this.smokeSystem.addSpawnModule(
            new RateSpawn({
                rate: new Constant(8),
                lifetime: new Range(8, 14),
                position: new VectorRange(-30, 30, -5, 5),
                velocity: new ConeDirection(-Math.PI / 2, Math.PI / 12, 20, 35),
            }),
        );

        this.smokeSystem.addUpdateModule(
            new ColorOverLifetime(
                new ColorGradient([
                    { t: 0, color: new Color(120, 100, 80, 0.4) },
                    { t: 1, color: new Color(60, 55, 50, 0) },
                ]),
            ),
        );
    }

    override update(delta): void {
        this.fireSystem.update(delta);
        this.smokeSystem.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.smokeSystem);
        context.render(this.fireSystem);
    }
}

app.start(new BonfireScene());
