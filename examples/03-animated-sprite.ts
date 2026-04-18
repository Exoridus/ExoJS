import { AnimatedSprite, Spritesheet, Texture, type SceneRenderRuntime, Scene } from 'exojs';

class AnimatedScene extends Scene {
    private readonly hero: AnimatedSprite;

    public constructor(texture: Texture) {
        super();

        const sheet = new Spritesheet(texture, {
            frames: {
                walk_0: { frame: { x: 0, y: 0, w: 32, h: 32 } },
                walk_1: { frame: { x: 32, y: 0, w: 32, h: 32 } },
                walk_2: { frame: { x: 64, y: 0, w: 32, h: 32 } },
            },
            animations: {
                walk: ['walk_0', 'walk_1', 'walk_2'],
            },
        });

        this.hero = AnimatedSprite.fromSpritesheet(sheet);
        this.hero.play('walk', { loop: true });
        this.hero.setPosition(200, 120);

        this.hero.onComplete.add((clip) => {
            console.log(`clip complete: ${clip}`);
        });

        this.addChild(this.hero);
    }

    public override update(delta: import('exojs').Time): void {
        this.hero.update(delta);
    }

    public override draw(runtime: SceneRenderRuntime): void {
        this.root.render(runtime);
    }
}

export { AnimatedScene };
