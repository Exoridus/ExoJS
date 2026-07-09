import { Application, Color, Scene, Sprite, Spritesheet, type SpritesheetData, Vector } from '@codexo/exojs';
import { BoxShape, type PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';
import { mountControls } from '@examples/runtime';

// The minimal physics binding: `world.attach(node, { ... })` builds a body +
// collider and binds it to the node in one call. After every `world.step(...)`
// the body's position and rotation are written onto the bound sprite, so the
// sprite simply "follows the body". A static floor stops the falling actor.

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(18, 22, 33),
});

class SpriteFollowsBodyScene extends Scene {
    private world!: PhysicsWorld;
    private actor!: Sprite;
    private actorBody!: PhysicsBody;
    private floor!: Sprite;
    private floorY = 0;
    private settled = 0;
    private hud!: ReturnType<typeof mountControls>;

    override async load(loader): Promise<void> {
        await loader.load(assets.demo.spritesheets.platformerCharacters.image);
        await loader.load(assets.demo.textures.pixelWhite);
        await loader.load(assets.demo.spritesheets.platformerCharacters.data);
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        // Gravity in px/s², +Y down — matches the engine's screen space.
        this.world = new PhysicsWorld({ gravity: { x: 0, y: 1400 } });

        const characters = new Spritesheet(
            loader.get(assets.demo.spritesheets.platformerCharacters.image),
            loader.get(assets.demo.spritesheets.platformerCharacters.data).value as SpritesheetData,
        );

        this.floorY = height - 80;

        // ── Static floor ──────────────────────────────────────────────────
        // A wide static body. `world.attach` binds it to the floor sprite, so
        // the sprite is positioned from the body (no manual placement needed).
        const floorWidth = width - 120;
        const floorHeight = 48;

        this.floor = new Sprite(loader.get(assets.demo.textures.pixelWhite)).setAnchor(0.5);
        this.floor.width = floorWidth;
        this.floor.height = floorHeight;
        this.floor.tint = new Color(70, 92, 120);

        this.world.attach(this.floor, {
            type: 'static',
            position: { x: width / 2, y: this.floorY },
            shape: new BoxShape(floorWidth, floorHeight),
        });

        // ── Dynamic actor ─────────────────────────────────────────────────
        // A dynamic body dropped from above. Its collider is a box sized to the
        // character art; `world.attach` binds the sprite, so it falls, lands and
        // tracks the body (position + rotation) every step.
        this.actor = characters.getFrameSprite('character_beige_front').setAnchor(0.5).setScale(1.1);
        this.actorBody = this.world.attach(this.actor, {
            type: 'dynamic',
            position: { x: width / 2, y: 140 },
            shape: new BoxShape(70, 90),
            friction: 0.4,
            restitution: 0.15,
        });

        // A small sideways nudge so the landing is visibly dynamic.
        this.actorBody.applyImpulse(900, 0);

        this.hud = mountControls({
            title: 'Sprite Follows Body',
            controls: [{ keys: 'Auto', action: 'actor falls and lands on the floor' }],
            status: 'Dropping…',
            hint: 'world.attach(sprite, { … }) creates a body + collider and binds it; world.step writes the body transform onto the sprite each frame.',
        });
    }

    override update(delta): void {
        // Advance the simulation; bound sprites are synced inside step().
        this.world.step(delta.seconds);

        const { width, height } = this.app.canvas;
        const body = this.actorBody;
        const restingSpeed = Math.hypot(body.linearVelocityX, body.linearVelocityY);

        if (body.y > this.floorY - 60 && restingSpeed < 6) {
            this.settled += delta.seconds;
        } else {
            this.settled = 0;
        }

        this.hud.setStatus(this.settled > 0 ? `Resting on the floor (${restingSpeed.toFixed(0)} px/s)` : `Falling… y=${body.y.toFixed(0)} px`);

        // Loop: after a short rest (or if it tumbles off-screen) drop it again.
        if (this.settled > 1.2 || body.y > height + 200 || Math.abs(body.x - width / 2) > width) {
            this.settled = 0;
            body.setTransform(new Vector(width / 2, 140), (Math.random() - 0.5) * 0.6);
            body.linearVelocityX = 0;
            body.linearVelocityY = 0;
            body.angularVelocity = 0;
            body.applyImpulse((Math.random() - 0.5) * 1800, 0);
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.floor);
        context.render(this.actor);
    }
}

app.start(new SpriteFollowsBodyScene());
