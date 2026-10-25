import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  Scene,
  type Seconds,
  ShaderFilter,
  Sprite,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { type DemoPanel, demoPanel, slider, type SliderSpec, startExample, toggle, type ToggleSpec } from '@examples/runtime';

const glsl = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uAmount;
uniform float uSplit;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 centered = vUv * 2.0 - 1.0;
  vec2 uv = centered * (1.0 + dot(centered, centered) * 0.07 * uAmount) * 0.5 + 0.5;
  vec4 base = texture(uTexture, uv);
  float red = texture(uTexture, uv + vec2(uSplit, 0.0)).r;
  float blue = texture(uTexture, uv - vec2(uSplit, 0.0)).b;
  float scan = 1.0 - 0.14 * uAmount * (0.5 + 0.5 * sin(vUv.y * 900.0));
  float grain = (hash(vUv * vec2(1280.0, 720.0) + uTime * 45.0) - 0.5) * 0.12 * uAmount;
  float vignette = 1.0 - smoothstep(0.42, 0.8, length(vUv - 0.5)) * 0.65 * uAmount;
  fragColor = vec4(max(vec3(0.0), (vec3(red, base.g, blue) * scan + grain) * vignette), base.a);
}`;

const wgsl = `@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
struct Uniforms { @align(16) uTime: f32, @align(16) uAmount: f32, @align(16) uSplit: f32 };
@group(1) @binding(0) var<uniform> uniforms: Uniforms;

fn hash(point: vec2<f32>) -> f32 {
  return fract(sin(dot(point, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

@fragment fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let centered = vUv * 2.0 - vec2<f32>(1.0);
  let uv = centered * (1.0 + dot(centered, centered) * 0.07 * uniforms.uAmount) * 0.5 + vec2<f32>(0.5);
  let base = textureSample(uTexture, uSampler, uv);
  let red = textureSample(uTexture, uSampler, uv + vec2<f32>(uniforms.uSplit, 0.0)).r;
  let blue = textureSample(uTexture, uSampler, uv - vec2<f32>(uniforms.uSplit, 0.0)).b;
  let scan = 1.0 - 0.14 * uniforms.uAmount * (0.5 + 0.5 * sin(vUv.y * 900.0));
  let grain = (hash(vUv * vec2<f32>(1280.0, 720.0) + uniforms.uTime * 45.0) - 0.5) * 0.12 * uniforms.uAmount;
  let vignette = 1.0 - smoothstep(0.42, 0.8, length(vUv - vec2<f32>(0.5))) * 0.65 * uniforms.uAmount;
  return vec4<f32>(max(vec3<f32>(0.0), (vec3<f32>(red, base.g, blue) * scan + grain) * vignette), base.a);
}`;

class RetroDisplayScene extends Scene {
  private stage!: Container;
  private background!: Sprite;
  private title!: Text;
  private filter!: ShaderFilter;
  private panel!: DemoPanel<{ crt: ToggleSpec; strength: SliderSpec; split: SliderSpec }>;
  private time = 0;

  override async load(): Promise<void> {
    await this.loader.load(assets.uvGrid256);
  }

  override init(): void {
    const { width, height } = this.app;
    this.background = new Sprite(this.loader.get(assets.uvGrid256)).setAnchor(0.5).setPosition(width / 2, height / 2);
    this.background.width = width;
    this.background.height = height;
    this.title = new Text('SIGNAL LOST', { fillColor: Color.white, fontSize: 96, outlineColor: Color.black, outlineWidth: 4 });
    this.title.setAnchor(0.5).setPosition(width / 2, height / 2);

    this.stage = new Container();
    this.stage.addChild(this.background, this.title);
    // #region guide:retro-filter
    this.filter = new ShaderFilter({ glsl: { fragment: glsl }, wgsl, uniforms: { uTime: 0, uAmount: 0.8, uSplit: 0.006 } });
    this.stage.filters = [this.filter];
    // #endregion guide:retro-filter

    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      title: 'Controls',
      hint: 'Turn CRT off to compare the original signal.',
      controls: {
        crt: toggle('CRT', true),
        strength: slider('Effect strength', { min: 0, max: 1, value: 0.8, step: 0.05, format: value => `${Math.round(value * 100)}%` }),
        split: slider('RGB separation', { min: 0, max: 0.02, value: 0.006, step: 0.001, format: value => value.toFixed(3) }),
      },
      onChange: (key, _value, values) => {
        if (key === 'crt') {
          this.stage.filters = values.crt ? [this.filter] : [];
        } else if (key === 'strength') {
          this.filter.setUniform('uAmount', values.strength);
        } else if (key === 'split') {
          this.filter.setUniform('uSplit', values.split);
        }
      },
    });
  }

  override update(delta: Seconds): void {
    const pageWidth = window.frameElement?.ownerDocument.documentElement.clientWidth ?? window.innerWidth;
    const height = pageWidth < 600 ? Math.max(1200, Math.ceil((360 * 1280) / pageWidth)) : 720;

    if (this.app.height !== height) {
      this.app.resize(1280, height);
    }

    const { width, contentHeight, scale } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.stage.setScale(scale);
    this.background.setPosition(width / 2, contentHeight / 2);
    this.background.width = width;
    this.background.height = contentHeight;
    this.title.setPosition(width / 2, contentHeight / 2);
    this.title.style.fontSize = Math.min(72, Math.max(18, contentHeight * 0.2));
    this.time += delta;
    this.filter.setUniform('uTime', this.time);
  }

  override draw(context: RenderingContext): void {
    context.render(this.stage, { view: context.screenView });
  }

  override destroy(): void {
    this.panel.dispose();
    this.filter.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { RetroDisplayScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});

await startExample(app, () => app.start(RetroDisplayScene));
