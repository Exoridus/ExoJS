import { Application, BlurFilter, Color, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, type Seconds, ShaderFilter } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

// Threshold pass: render solid cyan where the (blurred) red field is dense
// enough, with a smooth edge. The blur in front of this builds the scalar field
// from the hard circles, so neighbouring blobs merge where their fields sum.
const glsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float field = texture(uTexture, vUv).r;
  float shape = smoothstep(0.28, 0.5, field);
  fragColor = vec4(vec3(0.2, 0.9, 1.0) * shape, shape);
}`;
const wgsl = `@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@fragment fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let field = textureSample(uTexture, uSampler, vUv).r;
  let shape = smoothstep(0.28, 0.5, field);
  return vec4<f32>(vec3<f32>(0.2, 0.9, 1.0) * shape, shape);
}`;

class MetaballsScene extends Scene {
  private balls!: Graphics;
  private points!: { a: number; r: number }[];
  private blur!: BlurFilter;
  private threshold!: ShaderFilter;
  private handle!: Graphics;
  private dragPoint = { x: 0, y: 0 };
  private dragging = false;
  private hud!: ReturnType<typeof mountControls>;
  private readonly onPointerDown = (_pointer: unknown, x: number, y: number): void => {
    this.dragging = Math.hypot(x - this.dragPoint.x, y - this.dragPoint.y) < 58;
  };
  private readonly onPointerMove = (_pointer: unknown, x: number, y: number): void => {
    if (this.dragging) this.dragPoint = { x, y };
  };
  private readonly onPointerEnd = (): void => {
    this.dragging = false;
  };

  override init(): void {
    this.dragPoint = { x: this.app.width / 2 - 110, y: this.app.height / 2 };
    this.balls = new Graphics();
    this.handle = new Graphics();
    this.points = Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2, r: 120 + (i % 3) * 56 }));

    this.blur = new BlurFilter({ strength: 6 });
    this.threshold = new ShaderFilter({ glsl: { fragment: glsl }, wgsl });

    this.setOrder('field');

    this.hud = mountControls({
      title: 'Metaballs and Filter Order',
      controls: [{ keys: 'Drag ring', action: 'move a blob into the others' }],
      status: 'Blur → Threshold: merged shapes',
      hint: 'Blur then threshold merges nearby circles. Reverse the filters or bypass them to compare the result.',
    });
    const panel = mountControlPanel({ title: 'Filter order' });
    panel.addCycle({
      label: 'Passes',
      options: ['Blur → Threshold', 'Threshold → Blur', 'No filters'],
      index: 0,
      onChange: index => this.setOrder((['field', 'soft', 'raw'] as const)[index]),
    });
    panel.addSlider({
      label: 'Blur strength',
      min: 1,
      max: 12,
      step: 0.25,
      value: 6,
      onChange: value => {
        this.blur.strength = value;
      },
    });
    this.app.input.onPointerDown.add(this.onPointerDown);
    this.app.input.onPointerMove.add(this.onPointerMove);
    this.app.input.onPointerUp.add(this.onPointerEnd);
    this.app.input.onPointerCancel.add(this.onPointerEnd);
  }

  private setOrder(order: 'field' | 'soft' | 'raw'): void {
    this.balls.filters = order === 'field' ? [this.blur, this.threshold] : order === 'soft' ? [this.threshold, this.blur] : [];
    this.hud?.setStatus(
      order === 'field' ? 'Blur → Threshold: merged shapes' : order === 'soft' ? 'Threshold → Blur: soft circles' : 'No filters: source circles',
    );
  }

  override update(delta: Seconds): void {
    const app = this.app;
    const { width, height } = app;

    for (const point of this.points) {
      point.a += delta * (0.4 + point.r / 600);
    }

    this.balls.clear();
    this.balls.fillColor = Color.white;

    // Spread the orbit wider than tall so the field fills the 16:9 frame.
    for (const point of this.points) {
      this.balls.drawCircle(width / 2 + Math.cos(point.a) * point.r * 1.6, height / 2 + Math.sin(point.a * 1.4) * point.r * 0.8, 44);
    }
    this.balls.drawCircle(this.dragPoint.x, this.dragPoint.y, 44);

    this.handle.clear();
    this.handle.lineColor = new Color(255, 230, 115);
    this.handle.lineWidth = 3;
    this.handle.drawCircle(this.dragPoint.x, this.dragPoint.y, 51);
  }

  override draw(context: RenderingContext): void {
    context.render(this.balls);
    context.render(this.handle);
  }

  override destroy(): void {
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.app.input.onPointerUp.remove(this.onPointerEnd);
    this.app.input.onPointerCancel.remove(this.onPointerEnd);
    this.hud.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { MetaballsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

await app.start(MetaballsScene);
