import {
  Application,
  BlurFilter,
  Color,
  ColorMatrixFilter,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  Scene,
  ShaderFilter,
  Sprite,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, mountControls, toggle } from '@examples/runtime';

const PRIMARY_RAMP = assets.primaryRamp;

const glsl = `#version 300 es
precision mediump float; uniform sampler2D uTexture; in vec2 vUv; out vec4 fragColor;
void main(){ vec4 c=texture(uTexture,vUv); fragColor=vec4(c.rgb*vec3(1.0,0.9,1.2),c.a);} `;
const wgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler; @fragment fn fragmentMain(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ let c=textureSample(uTexture,uSampler,vUv); return vec4<f32>(c.rgb*vec3<f32>(1.0,0.9,1.2),c.a);} `;

class FilterStackScene extends Scene {
  private sprite!: Sprite;
  private blur!: BlurFilter;
  private tint!: ColorMatrixFilter;
  private custom!: ShaderFilter;
  // The filter chain is applied in this fixed order; each entry can be toggled.
  private active = { blur: true, tint: true, custom: true };
  private hud!: ReturnType<typeof mountControls>;
  private panel!: ReturnType<typeof demoPanel>;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.sprite = new Sprite(this.loader.get(PRIMARY_RAMP))
      .setAnchor(0.5)
      .setScale(4)
      .setPosition(width / 2, height / 2);
    this.blur = new BlurFilter({ strength: 2 });
    this.tint = new ColorMatrixFilter().tint(new Color(140, 210, 255));
    this.custom = new ShaderFilter({ glsl: { fragment: glsl }, wgsl });
    this.rebuild();

    this.hud = mountControls({
      title: 'Filter Stack',
      controls: [{ keys: 'Blur / Tint / Custom', action: 'toggle each layer independently' }],
      status: this.statusText(),
      hint: 'Filters compose in order: Blur → Tint → Custom. Toggle any subset.',
    });

    this.panel = demoPanel({
      scene: this,
      title: 'Layers',
      controls: {
        blur: toggle('Blur', this.active.blur),
        tint: toggle('Tint', this.active.tint),
        custom: toggle('Custom', this.active.custom),
      },
      onChange: (_key, _value, values) => {
        this.active = { ...values };
        this.rebuild();
      },
    });
  }

  private rebuild(): void {
    const filters = [];

    if (this.active.blur) {
      filters.push(this.blur);
    }

    if (this.active.tint) {
      filters.push(this.tint);
    }

    if (this.active.custom) {
      filters.push(this.custom);
    }

    this.sprite.filters = filters;
    this.hud?.setStatus(this.statusText());
  }

  private statusText(): string {
    const labels = [this.active.blur && 'Blur', this.active.tint && 'Tint', this.active.custom && 'Custom'].filter(Boolean);

    return labels.length > 0 ? `Active: ${labels.join(' → ')}` : 'Active: none (original sprite)';
  }

  override draw(context: RenderingContext): void {
    context.render(this.sprite);
  }
}

const app = new Application({
  scenes: { FilterStackScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

await app.start(FilterStackScene);
