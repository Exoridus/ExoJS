// Auto-generated from custom-fragment-shader.ts - edit the .ts source, not this file.
import { Application, Color, createFilterShader, FixedResolutionCanvasSizing, Scene, ShaderFilter, Sprite, UniformType } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
const UV_GRID = assets.technical.filtering.uvGrid256;
// Neither source declares the user uniforms: the schema below generates the
// GLSL block and the WGSL struct from one layout, and both bodies read them
// through the same `uniforms` instance. `uPointer` is top-down across the
// filtered sprite; `uOrientation` maps it into `vUv`, whose v axis runs the
// other way on WebGL2.
const glsl = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
uniform float uOrientation;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 pointer = vec2(uniforms.uPointer.x, 0.5 + (uniforms.uPointer.y - 0.5) * uOrientation);
  vec2 delta = vUv - pointer;
  float distanceToPointer = length(delta);
  float ripple = sin(distanceToPointer * 22.0 - uniforms.uTime * 5.0);
  float falloff = exp(-distanceToPointer * 5.0);
  vec2 uv = vUv + normalize(delta + vec2(0.001)) * ripple * falloff * 0.045;
  fragColor = texture(uTexture, uv);
}`;
const wgsl = `
@group(0) @binding(1) var uTexture:texture_2d<f32>;
@group(0) @binding(2) var uSampler:sampler;
@group(0) @binding(3) var<uniform> uOrientation: f32;
@fragment fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let pointer = vec2<f32>(uniforms.uPointer.x, 0.5 + (uniforms.uPointer.y - 0.5) * uOrientation);
    let delta = vUv - pointer;
    let distanceToPointer = length(delta);
    let ripple = sin(distanceToPointer * 22.0 - uniforms.uTime * 5.0);
    let falloff = exp(-distanceToPointer * 5.0);
    let uv = vUv + normalize(delta + vec2<f32>(0.001)) * ripple * falloff * 0.045;
    return textureSample(uTexture, uSampler, uv);
}`;
const warpShader = createFilterShader({ glsl: { fragment: glsl }, wgsl, uniforms: { uTime: UniformType.Float, uPointer: UniformType.Vec2 } });
class CustomFragmentShaderScene extends Scene {
  time = 0;
  filter;
  sprite;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.filter = ShaderFilter.from(warpShader);
    this.sprite = new Sprite(this.loader.get(UV_GRID))
      .setAnchor(0.5)
      .setScale(4)
      .setPosition(width / 2, height / 2);
    this.sprite.filters = [this.filter];
    this.hud = mountControls({
      title: 'Write a Fragment Filter',
      controls: [{ keys: 'Move pointer', action: 'place the ripple on the UV grid' }],
      status: 'A moving ripple distorts the UV grid around the pointer.',
      hint: 'The typed uniform schema generates matching GLSL and WGSL blocks for time and pointer position.',
    });
    this.filter.uniforms.uPointer.set(0.5, 0.5);
    app.input.onPointerMove.add(this.onMove);
  }
  // The filter's input spans the sprite's world bounds, not the canvas, so
  // the pointer is mapped through the view into that rectangle.
  onMove = pointer => {
    const world = this.app.rendering.view.screenToWorld(pointer.x, pointer.y);
    const bounds = this.sprite.getBounds();
    this.filter.uniforms.uPointer.set((world.x - bounds.x) / bounds.width, (world.y - bounds.y) / bounds.height);
  };
  update(delta) {
    this.time += delta;
    this.filter.uniforms.uTime.set(this.time);
  }
  draw(context) {
    context.render(this.sprite);
  }
  destroy() {
    this.app.input.onPointerMove.remove(this.onMove);
    this.hud?.dispose();
    this.sprite?.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { CustomFragmentShaderScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});
await app.start(CustomFragmentShaderScene);
