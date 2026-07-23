import { Application, Color, type RenderingContext, Scene } from '@codexo/exojs';
import {
    ApplyForce,
    ColorGradient,
    ColorOverLifetime,
    ConeDirection,
    Constant,
    Curve,
    particlesExtension,
    ParticleSystem,
    Range,
    RateSpawn,
    ScaleOverLifetime,
} from '@codexo/exojs-particles';
import { mountControls } from '@examples/runtime';



class EmitterBasicsScene extends Scene {
    private system!: ParticleSystem;
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.system = new ParticleSystem(this.loader.get(assets.demo.textures.particleLight), { capacity: 4000 });
        this.systems.add(this.system);
        this.system.setPosition(width / 2, height - 80);

        // Rate, lifetime, and a cone-shaped velocity spread: a fountain that
        // shoots upward (-π/2) with a ±36° spread and 70–180 px/s speed.
        this.system.addSpawnModule(
            new RateSpawn({
                rate: new Constant(180),
                lifetime: new Range(0.6, 1.4),
                velocity: new ConeDirection(-Math.PI / 2, Math.PI / 5, 70, 180),
            }),
        );

        // Gravity pulls the fountain back down.
        this.system.addUpdateModule(new ApplyForce(0, 240));

        // Start/end size: each particle grows in fast, then shrinks to nothing
        // as it ages. ScaleOverLifetime sets the absolute scale every frame from
        // a curve sampled at elapsed / lifetime.
        this.system.addUpdateModule(
            new ScaleOverLifetime(
                new Curve([
                    { t: 0, v: 0.15 },
                    { t: 0.2, v: 0.55 },
                    { t: 1, v: 0 },
                ]),
            ),
        );

        // Colour gradient over lifetime: white-hot core → orange → deep red, then
        // fading to transparent so particles dissolve at the end of their life.
        this.system.addUpdateModule(
            new ColorOverLifetime(
                new ColorGradient([
                    { t: 0, color: new Color(255, 244, 200, 1) },
                    { t: 0.35, color: new Color(255, 168, 64, 1) },
                    { t: 0.75, color: new Color(220, 60, 40, 0.8) },
                    { t: 1, color: new Color(120, 20, 20, 0) },
                ]),
            ),
        );

        this.hud = mountControls({
            title: 'Emitter Basics',
            controls: [{ keys: 'Auto', action: 'continuous fountain emission' }],
            status: 'Rate 180/s · lifetime 0.6–1.4s · gravity',
            hint: 'RateSpawn drives emission; ScaleOverLifetime sizes and ColorOverLifetime tints each particle as it ages.',
        });
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.system);
    }
}

const app = new Application({
    scenes: { EmitterBasicsScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    extensions: [particlesExtension],
});

app.start(EmitterBasicsScene);
