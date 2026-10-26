import {
  Color,
  createFilterShader,
  Ease,
  Graphics,
  type RenderingContext,
  SceneTransition,
  type SceneTransitionEnvironment,
  type SceneTransitionFrame,
  type SceneTransitionRequirements,
  type SceneTransitionSession,
  type Seconds,
  ShaderFilter,
  Sprite,
  UniformType,
} from '@codexo/exojs';

export const galleryDissolveShader = createFilterShader({
  glsl: {
    fragment: `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform float uOrientation;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 uv = vec2(vUv.x, 0.5 + (vUv.y - 0.5) * uOrientation);
  vec2 cell = floor(uv * vec2(64.0, 40.0));
  float noise = fract(52.9829189 * fract(dot(cell, vec2(0.06711056, 0.00583715))));
  float coverage = 1.0 - smoothstep(noise - 0.04, noise + 0.04, uniforms.uProgress * 1.08 - 0.04);
  fragColor = texture(uTexture, vUv) * coverage;
}`,
  },
  wgsl: `
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(0) @binding(3) var<uniform> uOrientation: f32;
@fragment fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = vec2<f32>(vUv.x, 0.5 + (vUv.y - 0.5) * uOrientation);
  let cell = floor(uv * vec2<f32>(64.0, 40.0));
  let noise = fract(52.9829189 * fract(dot(cell, vec2<f32>(0.06711056, 0.00583715))));
  let coverage = 1.0 - smoothstep(noise - 0.04, noise + 0.04, uniforms.uProgress * 1.08 - 0.04);
  return textureSample(uTexture, uSampler, vUv) * coverage;
}`,
  uniforms: { uProgress: UniformType.Float },
});

type GalleryEffect = 'iris' | 'dissolve' | 'snapshot';

class GalleryTransitionSession implements SceneTransitionSession {
  public readonly placement = 'screen';
  private elapsed = 0;
  private readonly sprite = new Sprite(null);
  private readonly circle: Graphics | null;
  private readonly filter: ShaderFilter<typeof galleryDissolveShader.uniforms> | null;

  public constructor(
    private readonly effect: GalleryEffect,
    private readonly environment: SceneTransitionEnvironment,
  ) {
    this.circle = effect === 'iris' ? new Graphics() : null;
    this.filter = effect === 'dissolve' ? ShaderFilter.from(galleryDissolveShader) : null;

    if (this.circle) {
      this.circle.fillColor = Color.white;
      // Tessellation depends on the source radius, so a unit circle would show polygon edges when enlarged.
      this.circle.drawCircle(0, 0, 128);
      this.sprite.mask = this.circle;
    }

    if (this.filter) {
      this.sprite.filters = [this.filter];
    }

    environment.commit();
  }

  public get done(): boolean {
    return this.environment.committed && this.elapsed >= 0.9;
  }

  public update(delta: Seconds): void {
    if (this.environment.committed) {
      this.elapsed = Math.min(0.9, this.elapsed + Math.max(0, delta));
    }
  }

  public render(context: RenderingContext, frame: SceneTransitionFrame): void {
    if (!frame.committed || frame.outgoing === null) {
      return;
    }

    const bounds = context.screenView.getBounds();
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const progress = this.elapsed / 0.9;
    const eased = Ease.cubicOut(progress);

    // The director owns this texture; only the sprite belongs to the session.
    this.sprite.texture = frame.outgoing;
    this.sprite.setPosition(bounds.left, bounds.top);
    this.sprite.width = width;
    this.sprite.height = height;

    if (this.circle) {
      this.circle.setPosition(bounds.left + width / 2, bounds.top + height / 2);
      this.circle.setScale((Math.hypot(width, height) * 1.01 * (1 - eased)) / 256);
    }

    if (this.filter) {
      this.filter.uniforms.uProgress.set(progress);
    }

    if (this.effect === 'snapshot') {
      this.sprite.setAnchor(0.5).setPosition(bounds.left + width / 2, bounds.top + height / 2);
      this.sprite.width = width * (1 + eased * 0.28);
      this.sprite.height = height * (1 + eased * 0.28);
      this.sprite.rotation = eased * 4;
      this.sprite.tint.a = 1 - eased;
    }

    context.render(this.sprite, { view: context.screenView });
  }

  public destroy(): void {
    this.sprite.destroy();
    this.circle?.destroy();
  }
}

export class GallerySceneTransition extends SceneTransition {
  public constructor(private readonly effect: GalleryEffect) {
    super();
  }

  public override getRequirements(): SceneTransitionRequirements {
    return { outgoingFrame: 'snapshot', currentFrame: 'direct' };
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    return new GalleryTransitionSession(this.effect, environment);
  }
}
