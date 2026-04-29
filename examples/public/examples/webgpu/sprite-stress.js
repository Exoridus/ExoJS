import { Application, Color, Container, Rectangle, Scene, Sprite, Texture } from '@codexo/exojs';

const GRID_COLUMNS = 34;
const GRID_ROWS = 20;
const SPRITE_COUNT = GRID_COLUMNS * GRID_ROWS;

const app = new Application({
    width: 800,
    height: 600,
    clearColor: new Color(0.02, 0.03, 0.06, 1),
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    init() {
        const { width, height } = this.app.canvas;
        const atlasTexture = createAtlasTexture();

        this._sprites = [];
        this._spriteLayer = new Container();
        this._spriteLayer.setPosition(width / 2, height / 2);

        const frameChoices = [
            new Rectangle(0, 0, 64, 64),
            new Rectangle(64, 0, 64, 64),
            new Rectangle(0, 64, 64, 64),
            new Rectangle(64, 64, 64, 64),
        ];
        const tintPalette = [
            Color.white,
            Color.skyBlue,
            Color.gold,
            Color.hotPink,
            Color.mediumSpringGreen,
            Color.orange,
        ];

        let index = 0;

        for (let row = 0; row < GRID_ROWS; row++) {
            for (let column = 0; column < GRID_COLUMNS; column++) {
                const sprite = new Sprite(atlasTexture);
                const frameIndex = index % frameChoices.length;
                const offsetX = (column - ((GRID_COLUMNS - 1) / 2)) * 22;
                const offsetY = (row - ((GRID_ROWS - 1) / 2)) * 22;
                const phase = ((row * GRID_COLUMNS) + column) * 0.13;
                const baseScale = 0.58 + ((index % 5) * 0.08);

                sprite.setTextureFrame(frameChoices[frameIndex]);
                sprite.setAnchor(0.5);
                sprite.setPosition(offsetX, offsetY);
                sprite.setScale(baseScale);
                sprite.setTint(tintPalette[index % tintPalette.length]);

                this._sprites.push({
                    sprite,
                    offsetX,
                    offsetY,
                    phase,
                    baseScale,
                    driftX: 6 + ((index % 7) * 2),
                    driftY: 4 + ((index % 5) * 2),
                    rotationSpeed: ((index % 2 === 0) ? 1 : -1) * (14 + (index % 6) * 7),
                });

                this._spriteLayer.addChild(sprite);
                index++;
            }
        }
    }
    update(delta) {
        const time = this.app.activeTime.seconds;

        this._spriteLayer.rotate(delta.seconds * 2.5);

        for (const entry of this._sprites) {
            const localPhase = time + entry.phase;
            const scale = entry.baseScale + Math.sin(localPhase * 1.8) * 0.08;

            entry.sprite.x = entry.offsetX + Math.sin(localPhase * 1.4) * entry.driftX;
            entry.sprite.y = entry.offsetY + Math.cos(localPhase * 1.7) * entry.driftY;
            entry.sprite.rotation += delta.seconds * entry.rotationSpeed;
            entry.sprite.setScale(scale);
        }
    }
    draw(backend) {
        backend.clear();
        this._spriteLayer.render(backend);

    }
    unload() {
        this._spriteLayer?.destroy();
        this._spriteLayer = null;
        this._sprites = null;
    }
    destroy() {
        this._spriteLayer?.destroy();
        this._spriteLayer = null;
        this._sprites = null;
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
    atlasCanvas.height = 128;

    if (!context) {
        throw new Error('Could not create a 2D canvas context for the stress atlas.');
    }

    context.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);

    drawAtlasCell(context, 0, 0, '#0f172a', '#ffd166', 'circle');
    drawAtlasCell(context, 64, 0, '#10243d', '#ff6b6b', 'diamond');
    drawAtlasCell(context, 0, 64, '#112b21', '#4ade80', 'star');
    drawAtlasCell(context, 64, 64, '#23163c', '#7dd3fc', 'triangle');

    return new Texture(atlasCanvas);
}

function drawAtlasCell(context, x, y, background, accent, shape) {
    context.fillStyle = background;
    context.fillRect(x, y, 64, 64);

    context.fillStyle = 'rgba(255, 255, 255, 0.08)';
    context.fillRect(x + 4, y + 4, 56, 56);

    context.fillStyle = accent;
    context.beginPath();

    if (shape === 'circle') {
        context.arc(x + 32, y + 32, 18, 0, Math.PI * 2);
    } else if (shape === 'diamond') {
        context.moveTo(x + 32, y + 10);
        context.lineTo(x + 52, y + 32);
        context.lineTo(x + 32, y + 54);
        context.lineTo(x + 12, y + 32);
        context.closePath();
    } else if (shape === 'star') {
        for (let i = 0; i < 5; i++) {
            const outerAngle = (-Math.PI / 2) + (i * Math.PI * 2 / 5);
            const innerAngle = outerAngle + (Math.PI / 5);
            const outerX = x + 32 + Math.cos(outerAngle) * 20;
            const outerY = y + 32 + Math.sin(outerAngle) * 20;
            const innerX = x + 32 + Math.cos(innerAngle) * 9;
            const innerY = y + 32 + Math.sin(innerAngle) * 9;

            if (i === 0) {
                context.moveTo(outerX, outerY);
            } else {
                context.lineTo(outerX, outerY);
            }

            context.lineTo(innerX, innerY);
        }
        context.closePath();
    } else {
        context.moveTo(x + 32, y + 9);
        context.lineTo(x + 54, y + 52);
        context.lineTo(x + 10, y + 52);
        context.closePath();
    }

    context.fill();
}
