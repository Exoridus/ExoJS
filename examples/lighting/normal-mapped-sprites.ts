import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  ScaleModes,
  Scene,
  type Seconds,
  ShaderSource,
  Sprite,
  SpriteMaterial,
  Texture,
} from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

// Forward normal mapping on plain sprites: a custom SpriteMaterial samples a
// tangent-space normal map next to the base texture and shades each fragment
// against a handful of point lights passed in as uniforms. Everything stays in
// one batch: the lights live in the material, not in extra draw calls.

const LIGHT_COUNT = 4;
const LIGHT_HEIGHT = 80;
const TILE_SIZE = 96;

// Draw into a canvas and wrap it as a texture. Both textures below are
// generated so the example carries no asset files.
const canvasTexture = (size: number, paint: (context: CanvasRenderingContext2D) => void): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2D canvas context unavailable.');
  paint(context);
  return new Texture(canvas, { scaleMode: ScaleModes.Linear, generateMipMap: false });
};

// Base colour: a matte disc with a checker so rotation and flips read clearly.
const albedoTexture = canvasTexture(TILE_SIZE, context => {
  const half = TILE_SIZE / 2;
  context.fillStyle = '#c8c0b0';
  context.beginPath();
  context.arc(half, half, half - 2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#8a8070';
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if ((x + y) % 2 === 0) continue;
      context.save();
      context.beginPath();
      context.arc(half, half, half - 2, 0, Math.PI * 2);
      context.clip();
      context.fillRect(x * (TILE_SIZE / 4), y * (TILE_SIZE / 4), TILE_SIZE / 4, TILE_SIZE / 4);
      context.restore();
    }
  }
});

// Normal map: hemisphere normals encoded as rgb = n * 0.5 + 0.5. +y points
// down the texture (towards larger v), matching the sprite's local y axis.
const normalTexture = canvasTexture(TILE_SIZE, context => {
  const image = context.createImageData(TILE_SIZE, TILE_SIZE);
  const half = TILE_SIZE / 2;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const dx = (x + 0.5 - half) / (half - 2);
      const dy = (y + 0.5 - half) / (half - 2);
      const inside = dx * dx + dy * dy;
      const nz = inside < 1 ? Math.sqrt(1 - inside) : 1;
      const nx = inside < 1 ? dx : 0;
      const ny = inside < 1 ? dy : 0;
      const offset = (y * TILE_SIZE + x) * 4;
      image.data[offset] = (nx * 0.5 + 0.5) * 255;
      image.data[offset + 1] = (ny * 0.5 + 0.5) * 255;
      image.data[offset + 2] = (nz * 0.5 + 0.5) * 255;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
});

// The engine owns the vertex stage of a sprite material; the GLSL vertex source
// is required by ShaderSource but never compiled for sprites.
const vertexGlsl = `#version 300 es
void main() { gl_Position = vec4(0.0); }`;

const lightUniformsGlsl = Array.from({ length: LIGHT_COUNT }, (_, index) => `uniform vec4 u_light${index};\nuniform vec4 u_lightColor${index};`).join('\n');
const lightSumGlsl = Array.from({ length: LIGHT_COUNT }, (_, index) => `lit += shade(u_light${index}, u_lightColor${index}, normal);`).join('\n  ');

const fragmentGlsl = `#version 300 es
precision mediump float;
in vec2 v_texcoord;
in vec4 v_color;
in vec2 v_worldPosition;
flat in vec4 v_basis;
uniform sampler2D u_normalMap;
uniform vec4 u_ambient;
${lightUniformsGlsl}
out vec4 fragColor;

vec3 shade(vec4 light, vec4 color, vec3 normal) {
  vec2 toLight = light.xy - v_worldPosition;
  float falloff = clamp(1.0 - length(toLight) / light.z, 0.0, 1.0);
  vec3 direction = normalize(vec3(toLight, ${LIGHT_HEIGHT.toFixed(1)}));
  return color.rgb * (max(dot(normal, direction), 0.0) * falloff * falloff * light.w);
}

void main() {
  vec4 base = sampleBase(v_textureSlot, v_texcoord);
  vec3 n = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
  // Rotate the tangent-space normal by the sprite's local-to-world basis so a
  // spinning or flipped sprite keeps its bumps facing the right way.
  vec2 axisX = normalize(vec2(v_basis.x, v_basis.z));
  vec2 axisY = normalize(vec2(v_basis.y, v_basis.w));
  vec3 normal = normalize(vec3(axisX * n.x + axisY * n.y, n.z));
  vec3 lit = u_ambient.rgb;
  ${lightSumGlsl}
  fragColor = vec4(base.rgb * lit, base.a) * v_color;
}`;

const lightFieldsWgsl = Array.from({ length: LIGHT_COUNT }, (_, index) => `light${index}: vec4<f32>, lightColor${index}: vec4<f32>,`).join('\n  ');
const lightSumWgsl = Array.from(
  { length: LIGHT_COUNT },
  (_, index) => `lit += shade(u_user.light${index}, u_user.lightColor${index}, normal, input.worldPosition);`,
).join('\n  ');

const fragmentWgsl = `
struct UserUniforms {
  ambient: vec4<f32>,
  ${lightFieldsWgsl}
};
@group(2) @binding(0) var<uniform> u_user: UserUniforms;
@group(2) @binding(1) var u_normalMap: texture_2d<f32>;
@group(2) @binding(2) var u_normalMapSampler: sampler;

fn shade(light: vec4<f32>, color: vec4<f32>, normal: vec3<f32>, worldPosition: vec2<f32>) -> vec3<f32> {
  let toLight = light.xy - worldPosition;
  let falloff = clamp(1.0 - length(toLight) / light.z, 0.0, 1.0);
  let direction = normalize(vec3<f32>(toLight, ${LIGHT_HEIGHT.toFixed(1)}));
  return color.rgb * (max(dot(normal, direction), 0.0) * falloff * falloff * light.w);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let base = sampleBase(input.textureSlot, input.texcoord);
  let n = textureSample(u_normalMap, u_normalMapSampler, input.texcoord).xyz * 2.0 - 1.0;
  let axisX = normalize(vec2<f32>(input.basis.x, input.basis.z));
  let axisY = normalize(vec2<f32>(input.basis.y, input.basis.w));
  let normal = normalize(vec3<f32>(axisX * n.x + axisY * n.y, n.z));
  var lit = u_user.ambient.rgb;
  ${lightSumWgsl}
  return vec4<f32>(base.rgb * lit, base.a) * input.color;
}`;

// Uniform declaration order is the WGSL struct order: ambient first, then each
// light's position/radius/intensity followed by its colour.
const lightUniforms: Record<string, readonly [number, number, number, number]> = { u_ambient: [0.12, 0.12, 0.16, 0] };
for (let index = 0; index < LIGHT_COUNT; index++) {
  lightUniforms[`u_light${index}`] = [0, 0, 1, 0];
  lightUniforms[`u_lightColor${index}`] = [1, 1, 1, 0];
}

const litMaterial = new SpriteMaterial({
  shader: new ShaderSource({ glsl: { vertex: vertexGlsl, fragment: fragmentGlsl }, wgsl: fragmentWgsl }),
  uniforms: lightUniforms,
  textures: { u_normalMap: normalTexture },
});

const lightColors = [new Color(255, 180, 120), new Color(120, 180, 255), new Color(160, 255, 160), new Color(255, 120, 200)];

class NormalMappedSpritesScene extends Scene {
  private layer!: Container;
  private tiles!: { sprite: Sprite; spin: number }[];
  private markers!: Sprite[];
  private elapsed = 0;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const { width, height } = this.app;
    this.layer = new Container();

    const columns = 8;
    const rows = 4;
    const spacing = 140;
    const originX = width / 2 - ((columns - 1) * spacing) / 2;
    const originY = height / 2 - ((rows - 1) * spacing) / 2;

    // A grid of lit tiles: every other one spins, every third one is mirrored,
    // so the basis rotation and the flip path both get exercised.
    this.tiles = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const sprite = new Sprite(albedoTexture).setAnchor(0.5);
        sprite.setPosition(originX + column * spacing, originY + row * spacing);
        sprite.setScale(index % 3 === 0 ? -1 : 1, 1);
        sprite.material = litMaterial;
        this.layer.addChild(sprite);
        this.tiles.push({ sprite, spin: index % 2 === 0 ? 0 : index % 4 === 1 ? 45 : -30 });
      }
    }

    // Unlit markers show where the lights are.
    this.markers = lightColors.map(color => {
      const marker = new Sprite(Texture.fromColor(color, 12)).setAnchor(0.5);
      this.layer.addChild(marker);
      return marker;
    });

    this.hud = mountControls({
      title: 'Normal-Mapped Sprites',
      hint: `${LIGHT_COUNT} point lights shade ${this.tiles.length} sprites through one material in a single batch.`,
      status: '',
    });
  }

  override update(delta: Seconds): void {
    const { width, height } = this.app;
    this.elapsed += delta;

    for (const tile of this.tiles) {
      if (tile.spin !== 0) tile.sprite.rotate(delta * tile.spin);
    }

    for (let index = 0; index < LIGHT_COUNT; index++) {
      const phase = this.elapsed * (0.4 + index * 0.15) + (index * Math.PI) / 2;
      const x = width / 2 + Math.cos(phase) * (width * 0.36);
      const y = height / 2 + Math.sin(phase * 1.3) * (height * 0.36);
      const color = lightColors[index]!;
      litMaterial.uniforms[`u_light${index}`] = [x, y, 320, 1.4];
      litMaterial.uniforms[`u_lightColor${index}`] = [color.r / 255, color.g / 255, color.b / 255, 0];
      this.markers[index]!.setPosition(x, y);
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.layer);
    this.hud.setStatus(`draw calls ${context.stats.drawCalls}`);
  }
}

const app = new Application({
  scenes: { NormalMappedSpritesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(14, 14, 20),
});

await app.start(NormalMappedSpritesScene);
