import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, ShaderFilter, Sprite } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

// A regular pixel grid makes the scanline darkening and barrel warp obvious.
const PIXEL_GRID = assets.technical.filtering.pixelGrid128;

const glsl = `#version 300 es
precision mediump float; uniform sampler2D uTexture; in vec2 vUv; out vec4 fragColor;
void main(){ vec2 uv=vUv*2.0-1.0; uv*=1.0+dot(uv,uv)*0.07; uv=uv*0.5+0.5; vec4 c=texture(uTexture,uv); float scan=0.88+0.12*sin(vUv.y*900.0); float vig=1.0-smoothstep(0.45,0.95,length(vUv-0.5)); fragColor=vec4(c.rgb*scan*vig,c.a);} `;
const wgsl = `@group(0) @binding(1) var uTexture:texture_2d<f32>; @group(0) @binding(2) var uSampler:sampler;
@fragment fn fragmentMain(@location(0) vUv:vec2<f32>)->@location(0) vec4<f32>{ var uv=vUv*2.0-vec2<f32>(1.0); uv=uv*(1.0+dot(uv,uv)*0.07); uv=uv*0.5+vec2<f32>(0.5); let c=textureSample(uTexture,uSampler,uv); let scan=0.88+0.12*sin(vUv.y*900.0); let vig=1.0-smoothstep(0.45,0.95,length(vUv-vec2<f32>(0.5))); return vec4<f32>(c.rgb*scan*vig,c.a);} `;

class CrtScanlinesScene extends Scene {
  private sprite!: Sprite;
  private filter!: ShaderFilter;
  private enabled = true;
  private hud!: ReturnType<typeof mountControls>;
  private panel!: ReturnType<typeof mountControlPanel>;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.filter = new ShaderFilter({ glsl: { fragment: glsl }, wgsl });
    this.sprite = new Sprite(this.loader.get(PIXEL_GRID))
      .setAnchor(0.5)
      .setScale(5)
      .setPosition(width / 2, height / 2);
    this.sprite.filters = [this.filter];

    this.hud = mountControls({
      title: 'CRT Scanlines',
      controls: [{ keys: 'CRT', action: 'toggle the scanline / barrel filter' }],
      status: this.statusText(),
      hint: 'Toggle the filter off to compare against the raw sprite.',
    });

    this.panel = mountControlPanel({ title: 'Display' });
    this.panel.addToggle({
      label: 'CRT',
      value: true,
      onChange: on => {
        this.enabled = on;
        this.sprite.filters = on ? [this.filter] : [];
        this.hud.setStatus(this.statusText());
      },
    });
  }

  private statusText(): string {
    return this.enabled ? 'CRT: ON (scanlines + barrel + vignette)' : 'CRT: OFF (original sprite)';
  }

  override draw(context: RenderingContext): void {
    context.render(this.sprite);
  }
}

const app = new Application({
  scenes: { CrtScanlinesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

await app.start(CrtScanlinesScene);
