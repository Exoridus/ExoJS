import { Application, Color, Container, Rectangle, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    init() {
        const { width, height } = this.app.canvas;
        const atlasTexture = createAtlasTexture();

        this._spriteLayer = new Container();
        this._spriteLayer.setPosition(width / 2, height / 2);

        this._fullAtlasSprite = new Sprite(atlasTexture);
        this._fullAtlasSprite.setAnchor(0.5);
        this._fullAtlasSprite.setPosition(-190, -30);
        this._fullAtlasSprite.setScale(1.35);

        this._croppedOrbitSprite = new Sprite(atlasTexture);
        this._croppedOrbitSprite.setTextureFrame(new Rectangle(0, 0, 64, 64));
        this._croppedOrbitSprite.setAnchor(0.5);
        this._croppedOrbitSprite.setPosition(0, 0);
        this._croppedOrbitSprite.setScale(2.1);

        this._croppedBobbingSprite = new Sprite(atlasTexture);
        this._croppedBobbingSprite.setTextureFrame(new Rectangle(64, 0, 64, 64));
        this._croppedBobbingSprite.setAnchor(0.5);
        this._croppedBobbingSprite.setPosition(182, 12);
        this._croppedBobbingSprite.setScale(1.8);

        this._spriteLayer.addChild(
            this._fullAtlasSprite,
            this._croppedOrbitSprite,
            this._croppedBobbingSprite
        );
    }
    update(delta) {
        const time = this.app.activeTime.seconds;

        this._spriteLayer.rotate(delta.seconds * 6);
        this._fullAtlasSprite.rotate(delta.seconds * 18);
        this._croppedOrbitSprite.setPosition(
            Math.cos(time * 1.6) * 70,
            Math.sin(time * 1.6) * 42
        );
        this._croppedOrbitSprite.rotate(delta.seconds * 80);
        this._croppedBobbingSprite.y = 12 + Math.sin(time * 2.2) * 24;
        this._croppedBobbingSprite.rotate(delta.seconds * -42);
    }
    draw(backend) {
        backend.clear();
        this._spriteLayer.render(backend);

    }
    unload() {
        this._spriteLayer?.destroy();
        this._spriteLayer = null;
        this._fullAtlasSprite = null;
        this._croppedOrbitSprite = null;
        this._croppedBobbingSprite = null;
    }
    destroy() {
        this._spriteLayer?.destroy();
        this._spriteLayer = null;
        this._fullAtlasSprite = null;
        this._croppedOrbitSprite = null;
        this._croppedBobbingSprite = null;
    }
}).catch((error) => {
    app.canvas.remove();
    app.destroy();

    throw error;
});

function createAtlasTexture() {
    const atlasCanvas = document.createElement('canvas');
    const context = atlasCanvas.getContext('2d');

    atlasCanvas.width = 128;
    atlasCanvas.height = 64;

    if (!context) {
        throw new Error('Could not create a 2D canvas context for the sprite atlas.');
    }

    context.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);

    context.fillStyle = '#13203a';
    context.fillRect(0, 0, 128, 64);

    context.fillStyle = '#e85d44';
    context.fillRect(4, 4, 56, 56);
    context.fillStyle = '#ffd166';
    context.beginPath();
    context.arc(32, 32, 16, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#1b9aaa';
    context.fillRect(68, 4, 56, 56);
    context.fillStyle = '#f4f1de';
    context.beginPath();
    context.moveTo(96, 10);
    context.lineTo(116, 32);
    context.lineTo(96, 54);
    context.lineTo(76, 32);
    context.closePath();
    context.fill();

    return new Texture(atlasCanvas);
}
