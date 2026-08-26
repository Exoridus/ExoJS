import { Scene, type Seconds, ShaderFilter, Sprite, Texture } from '@codexo/exojs';

class WaveFilterScene extends Scene {
  private time = 0;
  private sprite = new Sprite(Texture.empty);

  // #region guide:wave-filter
  private waveFilter = new ShaderFilter({
    glsl: {
      fragment: `
        #version 300 es
        precision mediump float;
        uniform sampler2D uTexture;
        uniform float uTime;
        in vec2 vUv;
        out vec4 fragColor;

        void main() {
            vec2 uv = vUv;
            uv.y += sin(uv.x * 12.0 + uTime * 3.0) * 0.03;
            fragColor = texture(uTexture, uv);
        }
      `,
    },
    wgsl: `
      struct Uniforms { uTime: f32 };

      @group(0) @binding(1) var uTexture: texture_2d<f32>;
      @group(0) @binding(2) var uSampler: sampler;
      @group(1) @binding(0) var<uniform> uniforms: Uniforms;

      @fragment
      fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
          var uv = vUv;
          uv.y += sin(uv.x * 12.0 + uniforms.uTime * 3.0) * 0.03;
          return textureSample(uTexture, uSampler, uv);
      }
    `,
    uniforms: { uTime: 0 },
  });

  override init(): void {
    this.sprite.filters = [this.waveFilter];
  }

  override update(delta: Seconds): void {
    this.time += delta;
    this.waveFilter.setUniform('uTime', this.time);
  }
  // #endregion guide:wave-filter
}

export { WaveFilterScene };
