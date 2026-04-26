import { Application, Color, Container, Rectangle, Scene, Sprite, Texture } from 'exojs';

const GRID_COLUMNS = 32;
const GRID_ROWS = 18;
const SPRITE_COUNT = GRID_COLUMNS * GRID_ROWS;
const TEXTURE_COUNT = 4;

const app = new Application({
    width: 800,
    height: 600,
    clearColor: new Color(0.018, 0.02, 0.04, 1),
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(Scene.create({

    init() {
        const { width, height } = this.app.canvas;

        this._sprites = [];
        this._spriteLayer = new Container();
        this._spriteLayer.setPosition(width / 2, height / 2);
        this._textureInfos = createTextureInfos();

        let index = 0;

        for (let row = 0; row < GRID_ROWS; row++) {
            for (let column = 0; column < GRID_COLUMNS; column++) {
                const textureInfo = this._textureInfos[index % this._textureInfos.length];
                const sprite = new Sprite(textureInfo.texture);
                const frame = textureInfo.frames[(row + column + index) % textureInfo.frames.length];
                const offsetX = (column - ((GRID_COLUMNS - 1) / 2)) * 24;
                const offsetY = (row - ((GRID_ROWS - 1) / 2)) * 25;
                const phase = index * 0.11;
                const baseScale = 0.56 + ((index % 4) * 0.09);
                const tint = textureInfo.palette[index % textureInfo.palette.length];

                sprite.setTextureFrame(frame);
                sprite.setAnchor(0.5);
                sprite.setPosition(offsetX, offsetY);
                sprite.setScale(baseScale);
                sprite.setTint(tint);

                this._sprites.push({
                    sprite,
                    offsetX,
                    offsetY,
                    phase,
                    baseScale,
                    driftX: 8 + ((index % 6) * 2),
                    driftY: 5 + ((index % 5) * 2),
                    rotationSpeed: ((index % 2 === 0) ? 1 : -1) * (18 + ((index % 7) * 6)),
                });

                this._spriteLayer.addChild(sprite);
                index++;
            }
        }
    },

    update(delta) {
        const time = this.app.activeTime.seconds;

        this._spriteLayer.rotation = Math.sin(time * 0.45) * 5;

        for (const entry of this._sprites) {
            const localPhase = time + entry.phase;
            const scale = entry.baseScale + (Math.sin(localPhase * 1.9) * 0.09);

            entry.sprite.x = entry.offsetX + Math.sin(localPhase * 1.35) * entry.driftX;
            entry.sprite.y = entry.offsetY + Math.cos(localPhase * 1.55) * entry.driftY;
            entry.sprite.rotation += delta.seconds * entry.rotationSpeed;
            entry.sprite.setScale(scale);
        }
    },

    draw(renderManager) {
        renderManager.clear();
        this._spriteLayer.render(renderManager);

    },

    unload() {
        this._spriteLayer?.destroy();
        this._spriteLayer = null;
        this._sprites = null;
        this._textureInfos = null;
    },

    destroy() {
        this._spriteLayer?.destroy();
        this._spriteLayer = null;
        this._sprites = null;
        this._textureInfos = null;
    },
})).catch((error) => {
    app.canvas.remove();
    app.destroy();

    throw error;
});

function createTextureInfos() {
    return [
        createTextureInfo('#10213a', '#ffd166', '#fff3c4', 'circle', [
            Color.white,
            Color.gold,
            Color.khaki,
            Color.orange,
        ]),
        createTextureInfo('#1f1632', '#ff6b9a', '#ffd3ea', 'diamond', [
            Color.white,
            Color.hotPink,
            Color.violet,
            Color.plum,
        ]),
        createTextureInfo('#0d2b26', '#4ade80', '#d9ffe9', 'star', [
            Color.white,
            Color.mediumSpringGreen,
            Color.limeGreen,
            Color.aquamarine,
        ]),
        createTextureInfo('#112744', '#7dd3fc', '#e7f9ff', 'triangle', [
            Color.white,
            Color.skyBlue,
            Color.deepSkyBlue,
            Color.cornflowerBlue,
        ]),
    ];
}

function createTextureInfo(background, accent, detail, shape, palette) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = 128;
    canvas.height = 64;

    if (!context) {
        throw new Error('Could not create a 2D canvas context for the multi-texture sprite atlas.');
    }

    drawAtlasCell(context, 0, background, accent, detail, shape, false);
    drawAtlasCell(context, 64, background, accent, detail, shape, true);

    return {
        texture: new Texture(canvas),
        frames: [
            new Rectangle(0, 0, 64, 64),
            new Rectangle(64, 0, 64, 64),
        ],
        palette,
    };
}

function drawAtlasCell(context, x, background, accent, detail, shape, mirrored) {
    context.fillStyle = background;
    context.fillRect(x, 0, 64, 64);

    context.fillStyle = 'rgba(255, 255, 255, 0.07)';
    context.fillRect(x + 4, 4, 56, 56);

    context.fillStyle = accent;
    context.beginPath();

    if (shape === 'circle') {
        context.arc(x + 32, 32, mirrored ? 14 : 18, 0, Math.PI * 2);
    } else if (shape === 'diamond') {
        context.moveTo(x + 32, mirrored ? 12 : 8);
        context.lineTo(x + 52, 32);
        context.lineTo(x + 32, mirrored ? 52 : 56);
        context.lineTo(x + 12, 32);
        context.closePath();
    } else if (shape === 'star') {
        const outerRadius = mirrored ? 16 : 20;
        const innerRadius = mirrored ? 7 : 9;

        for (let i = 0; i < 5; i++) {
            const outerAngle = (-Math.PI / 2) + (i * Math.PI * 2 / 5);
            const innerAngle = outerAngle + (Math.PI / 5);
            const outerX = x + 32 + Math.cos(outerAngle) * outerRadius;
            const outerY = 32 + Math.sin(outerAngle) * outerRadius;
            const innerX = x + 32 + Math.cos(innerAngle) * innerRadius;
            const innerY = 32 + Math.sin(innerAngle) * innerRadius;

            if (i === 0) {
                context.moveTo(outerX, outerY);
            } else {
                context.lineTo(outerX, outerY);
            }

            context.lineTo(innerX, innerY);
        }

        context.closePath();
    } else {
        context.moveTo(x + 32, mirrored ? 14 : 8);
        context.lineTo(x + 54, mirrored ? 50 : 54);
        context.lineTo(x + 10, mirrored ? 50 : 54);
        context.closePath();
    }

    context.fill();

    context.fillStyle = detail;
    context.beginPath();
    context.arc(x + (mirrored ? 24 : 40), mirrored ? 24 : 42, mirrored ? 6 : 8, 0, Math.PI * 2);
    context.fill();
}
