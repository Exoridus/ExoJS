// Auto-generated from crt-scanlines.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, Scene, ShaderFilter, Sprite, Text } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
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
struct Uniforms { uTime: f32, uAmount: f32, uSplit: f32, _pad: f32 };
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
  stage;
  filter;
  hud;
  enabled = true;
  amount = 0.8;
  split = 0.006;
  time = 0;
  init() {
    const { width, height } = this.app;
    const background = new Sprite(this.loader.get(assets.technical.filtering.uvGrid256)).setAnchor(0.5).setPosition(width / 2, height / 2);
    background.width = width;
    background.height = height;
    const title = new Text('SIGNAL LOST', { fillColor: Color.white, fontSize: 96, outlineColor: Color.black, outlineWidth: 4 });
    title.setAnchor(0.5).setPosition(width / 2, height / 2);
    this.stage = new Container();
    this.stage.addChild(background, title);
    this.filter = new ShaderFilter({ glsl: { fragment: glsl }, wgsl, uniforms: { uTime: 0, uAmount: this.amount, uSplit: this.split } });
    this.stage.filters = [this.filter];
    this.hud = mountControls({
      title: 'Retro Display',
      status: this.statusText(),
      hint: 'One display filter combines barrel distortion, scanlines, animated grain, vignette, and RGB separation. Bypass it to compare the clean scene.',
    });
    const panel = mountControlPanel({ title: 'Display' });
    panel.addToggle({
      label: 'CRT',
      value: true,
      onChange: enabled => {
        this.enabled = enabled;
        this.stage.filters = enabled ? [this.filter] : [];
        this.hud.setStatus(this.statusText());
      },
    });
    panel.addSlider({
      label: 'Effect strength',
      min: 0,
      max: 1,
      step: 0.05,
      value: this.amount,
      onChange: value => {
        this.amount = value;
        this.filter.setUniform('uAmount', value);
        this.hud.setStatus(this.statusText());
      },
    });
    panel.addSlider({
      label: 'RGB separation',
      min: 0,
      max: 0.02,
      step: 0.001,
      value: this.split,
      onChange: value => {
        this.split = value;
        this.filter.setUniform('uSplit', value);
        this.hud.setStatus(this.statusText());
      },
    });
  }
  statusText() {
    return this.enabled ? `CRT ${Math.round(this.amount * 100)}% · RGB split ${this.split.toFixed(3)}` : 'CRT off · clean scene';
  }
  update(delta) {
    this.time += delta;
    this.filter.setUniform('uTime', this.time);
  }
  draw(context) {
    context.render(this.stage);
  }
  destroy() {
    this.hud.dispose();
    this.filter.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { RetroDisplayScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await app.start(RetroDisplayScene);
