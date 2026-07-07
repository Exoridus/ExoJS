import { Application, Color, Scene, Texture, Vector } from '@codexo/exojs';
import {
    AlphaFadeOverLifetime,
    AttractToPoint,
    ConeDirection,
    Constant,
    particlesExtension,
    ParticleSystem,
    RateSpawn,
    RepelFromPoint,
} from '@codexo/exojs-particles';
import { mountControlPanel, mountControls } from '@examples/runtime';

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

// Acceleration magnitude shared by both force modules (units / s²). Only the
// active mode's module carries this strength; the inactive one is held at 0.
const forceStrength = 700;

class CursorAttractorParticlesScene extends Scene {
    private system!: ParticleSystem;
    private attractor!: AttractToPoint;
    private repeller!: RepelFromPoint;
    private mode: 'attract' | 'repel' = 'attract';
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const { width, height } = this.app.canvas;

        this.system = new ParticleSystem(this.loader.get(Texture, assets.demo.textures.particleLight), { capacity: 32000 });
        this.system.setPosition(width / 2, height / 2);

        this.system.addSpawnModule(
            new RateSpawn({
                rate: new Constant(2200),
                lifetime: new Constant(2.6),
                position: new Constant(new Vector(0, 0)),
                velocity: new ConeDirection(0, Math.PI, 10, 100),
                scale: new Constant(new Vector(0.18, 0.18)),
            }),
        );

        // Both force fields target the same cursor point. We swap behaviour by
        // moving the strength between them — the inactive module stays at 0 so
        // it contributes no acceleration. `falloff`/`radius` of 260 softens the
        // pull/push near the centre instead of slingshotting particles.
        this.attractor = new AttractToPoint(0, 0, forceStrength, 260);
        this.repeller = new RepelFromPoint(0, 0, 0, 260);

        this.system.addUpdateModule(this.attractor);
        this.system.addUpdateModule(this.repeller);
        this.system.addUpdateModule(new AlphaFadeOverLifetime());

        this.app.input.onPointerMove.add(pointer => {
            const localX = pointer.x - this.system.position.x;
            const localY = pointer.y - this.system.position.y;

            this.attractor.x = localX;
            this.attractor.y = localY;
            this.repeller.x = localX;
            this.repeller.y = localY;
        });

        this.hud = mountControls({
            title: 'Cursor Attractor Particles',
            controls: [
                { keys: 'Move', action: 'steer the force field' },
                { keys: 'Toggle', action: 'switch attract / repel' },
            ],
            status: 'Mode: Attract',
            hint: 'Move the cursor over the canvas to drag the particle field around.',
        });

        const toggle = mountControlPanel({ title: 'Force Field' }).addToggle({
            label: 'Repel (off = attract)',
            value: false,
            onChange: repel => this.setMode(repel ? 'repel' : 'attract'),
        });

        // A pointer button also flips the mode, so the demo is usable without
        // the slider panel; keep the toggle UI in sync when that happens.
        this.app.input.onPointerDown.add(() => {
            const next = this.mode === 'attract' ? 'repel' : 'attract';

            this.setMode(next);
            toggle.set(next === 'repel');
        });

        this.setMode('attract');
    }

    private setMode(mode: 'attract' | 'repel'): void {
        this.mode = mode;

        if (mode === 'attract') {
            this.attractor.strength = forceStrength;
            this.repeller.strength = 0;
            this.hud.setStatus('Mode: Attract');
        } else {
            this.attractor.strength = 0;
            this.repeller.strength = forceStrength;
            this.hud.setStatus('Mode: Repel');
        }
    }

    override update(delta): void {
        this.system.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.system);
    }
}

app.start(new CursorAttractorParticlesScene());
