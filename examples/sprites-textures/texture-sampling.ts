import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  PixelSnapMode,
  ScaleModes,
  Scene,
  type Seconds,
  Sprite,
  Text,
  Texture,
} from '@codexo/exojs';
import { demoPanel, slider, toggle } from '@examples/runtime';

// Colour textures are stored as sRGB and filtered in linear light, so the mips
// of a checker average to the correct mid-grey rather than a darkened one.
// Data textures (`colorSpace: 'none'`) filter their raw numeric values instead.
const MODES = [
  { label: 'Nearest', scaleMode: ScaleModes.Nearest, mipmaps: false },
  { label: 'Linear', scaleMode: ScaleModes.Linear, mipmaps: false },
  { label: 'Linear + mipmaps', scaleMode: ScaleModes.LinearMipmapLinear, mipmaps: true },
] as const;
const COLUMN_X = [250, 520, 790];
const MAGNIFIED_Y = 230;
const MINIFIED_Y = 490;

// Small pixel-art tile: magnifying it shows how each mode fills in between texels.
const makePixelArt = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f9d66e' : '#284b7a';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  ctx.fillStyle = '#ff627d';
  ctx.fillRect(9, 9, 14, 14);

  return canvas;
};

// Zone plate: rings whose spacing shrinks towards the edge until it is finer
// than a pixel. Drawn smaller than its size, everything past that point
// aliases into false patterns unless mipmaps pre-average it.
const makeZonePlate = (): HTMLCanvasElement => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      // Ring frequency grows with the radius but stays below the texture's own
      // Nyquist limit, so the source itself is alias-free.
      const v = 0.5 + 0.5 * Math.cos((Math.PI * (dx * dx + dy * dy)) / (2 * size));
      const i = (y * size + x) * 4;
      image.data[i] = 40 + v * 215;
      image.data[i + 1] = 60 + v * 190;
      image.data[i + 2] = 90 + v * 150;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  return canvas;
};

const samplingControls = {
  magnify: slider('Magnify', { min: 1, max: 8, value: 6, step: 0.1, format: value => `${value.toFixed(1)}x` }),
  minify: slider('Minify', { min: 0.15, max: 0.7, value: 0.35, step: 0.01, format: value => `${value.toFixed(2)}x` }),
  snap: toggle('Pixel snap', false),
  motion: toggle('Motion', true),
};

type SamplingControls = typeof samplingControls;

class TextureSamplingScene extends Scene {
  private textures: Texture[] = [];
  private magnified: Sprite[] = [];
  private minified: Sprite[] = [];
  private panel!: ReturnType<typeof demoPanel<SamplingControls>>;
  private elapsed = 0;
  private readonly onWheel = (_deltaX: number, deltaY: number): void => {
    this.panel.set('magnify', Math.max(1, Math.min(8, this.panel.values.magnify * Math.exp(-deltaY * 0.002))));
  };

  override init(): void {
    const pixelArt = makePixelArt();
    const zonePlate = makeZonePlate();

    // One texture per mode and pattern: every column draws the same source
    // with the same transform, so the sampler is the only difference.
    for (const [column, mode] of MODES.entries()) {
      const magnifiedTexture = new Texture(pixelArt, { scaleMode: mode.scaleMode, generateMipMap: mode.mipmaps });
      const minifiedTexture = new Texture(zonePlate, { scaleMode: mode.scaleMode, generateMipMap: mode.mipmaps });

      this.textures.push(magnifiedTexture, minifiedTexture);
      this.magnified.push(new Sprite(magnifiedTexture).setAnchor(0.5));
      this.minified.push(new Sprite(minifiedTexture).setAnchor(0.5));
      this.root.addChild(
        this.magnified[column],
        this.minified[column],
        new Text(mode.label, { fillColor: Color.white, fontSize: 22, align: 'center' })
          .setAnchor(0.5, 0.5)
          .setPosition(COLUMN_X[column], 46),
      );
    }

    this.panel = demoPanel({
      title: 'Sampling lab',
      corner: 'bottom-right',
      controls: samplingControls,
      onChange: (key, value) => {
        if (key === 'snap') {
          for (const sprite of this.magnified) {
            sprite.pixelSnapMode = value ? PixelSnapMode.Geometry : PixelSnapMode.None;
          }
        }
      },
    });

    this.inputs.onTrigger(Keyboard.P, () => this.panel.step('snap'));
    this.inputs.onTrigger(Keyboard.Space, () => this.panel.step('motion'));
    this.app.input.onMouseWheel.add(this.onWheel);
  }

  override update(delta: Seconds): void {
    const { magnify, minify, motion } = this.panel.values;

    if (motion) {
      this.elapsed += delta;
    }

    // A slow sub-pixel drift shows snapping in the top row; a gentle scale
    // pulse makes aliasing crawl in the bottom row.
    const drift = Math.sin(this.elapsed * 1.8) * 0.45;
    const pulse = 1 + Math.sin(this.elapsed * 0.7) * 0.12;

    for (let column = 0; column < MODES.length; column++) {
      this.magnified[column].setPosition(COLUMN_X[column] + drift, MAGNIFIED_Y + drift).setScale(magnify);
      this.minified[column].setPosition(COLUMN_X[column], MINIFIED_Y).setScale(minify * pulse);
    }
  }

  override destroy(): void {
    this.app.input.onMouseWheel.remove(this.onWheel);
    this.panel.dispose();
    super.destroy();

    for (const texture of this.textures) {
      texture.destroy();
    }
  }
}

const app = new Application({
  scenes: { TextureSamplingScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(14, 18, 27),
});

await app.start(TextureSamplingScene);
