import {
  type Application,
  BlendModes,
  CallbackRenderPass,
  Color,
  Geometry,
  INSTANCE_TRANSFORM_GLSL,
  INSTANCE_TRANSFORM_WGSL,
  Matrix,
  MeshMaterial,
  type PassContext,
  RenderBatch,
  RenderTexture,
  Shader,
  Texture,
} from '@codexo/exojs';

import type { LightingDebugView, LightingQuality } from '../Lighting';
import type { Light } from '../lights/Light';
import { PointLight } from '../lights/PointLight';
import { SpotLight } from '../lights/SpotLight';
import type { LightingBackend } from './LightingBackend';
import lightCompositeFragment from './shaders/light-composite.frag';
import lightCompositeVertex from './shaders/light-composite.vert';
import lightCompositeWgsl from './shaders/light-composite.wgsl';
import lightQuadFragment from './shaders/light-quad.frag';
import lightQuadVertex from './shaders/light-quad.vert';
import lightQuadWgsl from './shaders/light-quad.wgsl';

/** Cone cosine that no direction can fail, which is how a point light says "no cone". */
const noCone = -1;

const scratchPosition = { x: 0, y: 0 };
const scratchDirection = { x: 0, y: 0 };
const scratchInstance = { a_light: [noCone, noCone, 1] };

/** Unit quad in `-1..1`, which is the light's own space: distance from its centre in radii. */
const unitQuad = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    stride: 8,
    vertexData: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });

/** Screen quad carrying its own texture coordinates, for the composite. */
const screenQuad = (): Geometry =>
  new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
    ],
    stride: 16,
    vertexData: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });

/** Construction options for {@link LightmapBackend}. */
export interface LightmapBackendOptions {
  /** The application whose frame is lit. The backend installs its composite in `app.framePasses`. */
  readonly app: Application;
  /**
   * Texels per logical unit of the light target. Light is low-frequency, so
   * half resolution is hard to tell apart and costs a quarter of the fill.
   */
  readonly resolution: number;
}

/**
 * Accumulates every light into a target of its own, then multiplies the drawn
 * frame by it.
 *
 * The trade against the forward renderer is the one that matters for a lit
 * scene: light no longer costs a loop iteration per fragment per light, so
 * there is no light cap, and the accumulated field is a texture that a shadow
 * pass can write into. What it gives up is normal mapping - the light target
 * has no surface normals to shade against, because the frame it multiplies is
 * already flat.
 *
 * One instanced draw covers every visible light: the instance transform carries
 * position and radius, the tint carries colour, and a three-float instance
 * attribute carries the cone and the intensity. The quad is the light's
 * bounding square, so a light costs the fill of its own radius rather than of
 * the screen.
 * @internal
 */
export class LightmapBackend implements LightingBackend {
  public readonly quality: LightingQuality = 'lightmap';

  private readonly _app: Application;
  private readonly _resolution: number;
  private readonly _lightGeometry: Geometry = unitQuad();
  private readonly _compositeGeometry: Geometry = screenQuad();
  private readonly _lightMaterial: MeshMaterial;
  private readonly _compositeMaterial: MeshMaterial;
  private readonly _batch: RenderBatch;
  private readonly _compositeBatch: RenderBatch;
  private readonly _lightPass: CallbackRenderPass;
  private readonly _compositePass: CallbackRenderPass;
  private readonly _transform = new Matrix();
  private readonly _tint = Color.white.clone();
  private _target: RenderTexture;
  private _ambient: Color = Color.black.clone();
  private _activeCount = 0;
  private _debug: LightingDebugView = null;

  public constructor(options: LightmapBackendOptions) {
    this._app = options.app;
    this._resolution = options.resolution;
    this._target = new RenderTexture(1, 1);

    this._lightMaterial = new MeshMaterial({
      shader: new Shader({
        glsl: { vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}\n${lightQuadVertex}`, fragment: lightQuadFragment },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}\n${lightQuadWgsl}`,
      }),
      blendMode: BlendModes.Additive,
    });

    this._compositeMaterial = new MeshMaterial({
      shader: new Shader({
        glsl: { vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}\n${lightCompositeVertex}`, fragment: lightCompositeFragment },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}\n${lightCompositeWgsl}`,
      }),
      textures: { u_frame: this._app.frameTexture, u_light: this._target },
      blendMode: BlendModes.Normal,
    });

    this._batch = new RenderBatch(this._lightGeometry, this._lightMaterial, {
      instanceAttributes: [{ name: 'a_light', format: 'float32x3' }],
    });
    this._compositeBatch = new RenderBatch(this._compositeGeometry, this._compositeMaterial);

    // Two stock passes rather than one of our own: the light field is a draw
    // into a target the engine redirects for us, and the composite is a draw
    // into whatever the frame slot has active.
    this._lightPass = new CallbackRenderPass(pass => this._drawLights(pass), { target: this._target, label: 'lighting:accumulate' });
    this._compositePass = new CallbackRenderPass(pass => pass.drawBatch(this._compositeBatch), { label: 'lighting:composite' });

    this._resize();
    this._app.framePasses.addPass(this._lightPass).addPass(this._compositePass);
    this._app.onResize.add(this._onResize);
  }

  public get activeLightCount(): number {
    return this._activeCount;
  }

  /**
   * Showing the light field alone is multiplying a white frame by it, so the
   * debug view swaps the composite's frame texture rather than carrying a
   * second shader that would have to be kept in step with the first.
   */
  public get debug(): LightingDebugView {
    return this._debug;
  }

  public set debug(view: LightingDebugView) {
    if (this._debug === view) {
      return;
    }

    this._debug = view;
    this._compositeMaterial.setTexture('u_frame', view === 'light' ? whiteTexture() : this._app.frameTexture);
  }

  /** The accumulated light, for a debug view that wants to show it. @internal */
  public get lightTexture(): RenderTexture {
    return this._target;
  }

  public publish(lights: readonly Light[], ambient: Color): void {
    this._ambient.copy(ambient);
    this._batch.clear();

    let written = 0;

    for (const light of lights) {
      if (!light.enabled || light.intensity <= 0) {
        continue;
      }

      const radius = radiusOf(light);

      if (radius <= 0) {
        continue;
      }

      light.getWorldPosition(scratchPosition);
      writeCone(scratchInstance.a_light, light);
      scratchInstance.a_light[2] = light.intensity;

      // Position and radius travel as the instance transform: a unit quad scaled
      // by the radius IS the light's bounding square, and the fragment stage
      // then measures distance in radii without knowing where it is in the world.
      this._transform.set(radius, 0, scratchPosition.x, 0, radius, scratchPosition.y);
      this._tint.set(light.color.r, light.color.g, light.color.b, 255);
      this._batch.add(this._transform, this._tint, scratchInstance);
      written++;
    }

    this._activeCount = written;
  }

  /**
   * Clear to ambient and lay every light on top of it. The clear runs here
   * rather than as the pass's own because the ambient term is live: a scene
   * that fades from day to night moves it every frame.
   */
  private _drawLights(pass: PassContext): void {
    this._resize();
    pass.clear(this._ambient);
    pass.drawBatch(this._batch);
  }

  public destroy(): void {
    this._app.onResize.remove(this._onResize);
    this._app.framePasses.removePass(this._lightPass);
    this._app.framePasses.removePass(this._compositePass);
    this._lightPass.destroy();
    this._compositePass.destroy();
    this._batch.destroy();
    this._compositeBatch.destroy();
    this._lightMaterial.destroy();
    this._compositeMaterial.destroy();
    this._lightGeometry.destroy();
    this._compositeGeometry.destroy();
    this._target.destroy();
    this._activeCount = 0;
  }

  private readonly _onResize = (): void => {
    this._resize();
  };

  /**
   * Keep the light target on the frame's size at this backend's own resolution,
   * and the composite quad on the frame's size in logical units.
   *
   * The composite is one instance that never changes between resizes, so it is
   * written here rather than per frame: `add` copies into the instance buffer,
   * and re-copying an unchanged quad every frame is work the pass does not owe.
   */
  private _resize(): void {
    const logicalWidth = Math.max(1, this._app.width);
    const logicalHeight = Math.max(1, this._app.height);
    const width = Math.max(1, Math.round(logicalWidth * this._resolution));
    const height = Math.max(1, Math.round(logicalHeight * this._resolution));

    if (this._target.width === width && this._target.height === height && this._compositeBatch.count > 0) {
      return;
    }

    this._target.setSize(width, height);
    this._compositeBatch.clear();
    this._compositeBatch.add(this._transform.set(logicalWidth, 0, 0, 0, logicalHeight, 0), Color.white);
  }
}

const radiusOf = (light: Light): number => {
  if (light instanceof PointLight || light instanceof SpotLight) {
    return light.radius;
  }

  return 0;
};

const writeCone = (target: number[], light: Light): void => {
  if (!(light instanceof SpotLight)) {
    target[0] = noCone;
    target[1] = noCone;

    return;
  }

  light.getWorldDirection(scratchDirection);

  const outer = Math.cos((Math.max(0, Math.min(90, light.angle)) * Math.PI) / 180);
  const inner = Math.cos((Math.max(0, Math.min(90, light.angle * (1 - clamp01(light.softness)))) * Math.PI) / 180);

  target[0] = outer;
  target[1] = inner;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The shared opaque white the debug view multiplies instead of the frame. One
 * texel, created on first use and never destroyed: it outlives any one system
 * and costs four bytes.
 */
let white: Texture | null = null;

const whiteTexture = (): Texture => (white ??= Texture.fromColor(Color.white, 1));
