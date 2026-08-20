import type { Material } from '@codexo/exojs';
import { ShaderSource } from '@codexo/exojs';

import type { ParticleBatch } from '#ParticleStorage';
import type { ParticleSystem } from '#ParticleSystem';

import fragmentSource from './glsl/ribbon.frag';
import vertexSource from './glsl/ribbon.vert';
import { ParticleBufferLayout } from './ParticleBufferLayout';
import { ParticleMaterial } from './ParticleMaterial';
import { ParticleRenderMode } from './ParticleRenderMode';
import ribbonParticleWgslModule from './wgsl/ribbon-particles.wgsl';

const vertexStrideBytes = 20;
const wordsPerVertex = vertexStrideBytes / Float32Array.BYTES_PER_ELEMENT;
const defaultWidth = 1;

/** Construction options for {@link RibbonParticles}. */
export interface RibbonParticlesOptions {
  /**
   * Width of the strip in system-local units, before per-particle scaling.
   * The half-width actually emitted is `width * scaleX[i] / 2`.
   *
   * @default 1
   */
  readonly width?: number;
}

/**
 * WGSL counterpart of `glsl/ribbon.vert` + `glsl/ribbon.frag`. Vertex and
 * fragment entry points share one source per WGSL convention, and the
 * per-vertex attributes bind by `@location`, matching the declaration order and
 * byte offsets of {@link RibbonParticles.dataLayout}.
 *
 * The uniform struct is the one the WebGPU particle renderer writes for every
 * mode, so `localBounds` and `uvBounds` are declared but unused here: the strip
 * carries its own final positions and UVs, and only the projection, the system
 * transform and the premultiply flag are read.
 */
export const ribbonParticleWgsl: string = ribbonParticleWgslModule;

/**
 * A connected triangle strip through the system's particles: one ribbon per
 * system, drawn as a single non-instanced draw.
 *
 * Every particle contributes two vertices, offset either side of the path
 * running through its neighbours, so the whole live range becomes one continuous
 * band — the shape a sword arc, a projectile streak or a smoke plume wants,
 * where a quad-per-particle would show as a dotted line.
 *
 * Layout of the per-vertex buffer {@link build} fills (20 bytes, 3 attributes):
 *
 * ```
 *   a_position   f32x2  (offset  0,  8 bytes)  strip vertex (system-local)
 *   a_texcoord   f32x2  (offset  8,  8 bytes)  u along the strip, v across it
 *   a_color      u8x4   (offset 16,  4 bytes)  RGBA tint, normalised
 * ```
 *
 * **No ribbon-specific styling parameters.** Half-width comes from the
 * particle's `scaleX` and the tint from its `color`, so the existing update
 * modules already produce the expected look: `ScaleOverLifetime` tapers the
 * tail, `ColorOverLifetime` gradients along the streak, and
 * `AlphaFadeOverLifetime` fades it out. {@link RibbonParticlesOptions.width}
 * only sets the base the scale multiplies.
 *
 * **The strip is built on the CPU**, so this mode is not GPU-eligible and a
 * system using it stays on the CPU simulation path (observable through
 * `ParticleSystem.gpuMode`). That is what guarantees the builder reads valid
 * positions in emission order: CPU-mode slots are dense and compaction copies
 * survivors forward stably, which is exactly the ordering a connected strip
 * needs.
 *
 * @example
 * const trail = new ParticleSystem(sparkTexture, {
 *     capacity: 64,
 *     render: new RibbonParticles({ width: 12 }),
 * });
 *
 * trail.addUpdateModule(new ScaleOverLifetime(1, 0)); // tapers to a point
 */
export class RibbonParticles extends ParticleRenderMode {
  public readonly instanced = false;

  /**
   * Floats spanned by one vertex. Exposed so callers reading {@link data} can
   * step through it without hard-coding the stride.
   */
  public readonly floatsPerVertex = wordsPerVertex;

  /**
   * A strip has no fixed vertex count — the draw covers whatever {@link build}
   * emitted this frame. Non-indexed by construction: the strip's own vertex
   * order is its topology, and an index list would pin the draw to a fixed
   * index count.
   */
  public readonly dataLayout = new ParticleBufferLayout({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    stride: vertexStrideBytes,
    topology: 'triangle-strip',
    usage: 'stream',
  });

  private readonly _width: number;

  private _material: ParticleMaterial | null = null;
  private _float32 = new Float32Array(this.data);
  private _uint32 = new Uint32Array(this.data);

  public constructor(options: RibbonParticlesOptions = {}) {
    super();

    this._width = options.width ?? defaultWidth;
  }

  /**
   * Built on first read rather than in the constructor: a system may be
   * simulated without ever being drawn, and the shader pair is only needed
   * once a backend actually compiles it.
   */
  public get material(): Material {
    this._material ??= new ParticleMaterial({
      shader: new ShaderSource({
        glsl: { vertex: vertexSource, fragment: fragmentSource },
        wgsl: ribbonParticleWgsl,
      }),
    });

    return this._material;
  }

  public build(_system: ParticleSystem, particles: ParticleBatch): void {
    const limit = particles.count;

    // A strip needs a segment, and a segment needs two particles.
    if (limit < 2) {
      this._setCount(0);

      return;
    }

    const { x: posX, y: posY } = particles.position;
    const { x: scaleX } = particles.scale;
    const { color } = particles;

    // UVs run along the strip by arc length rather than by particle index, so
    // unevenly spaced particles do not stretch the texture unevenly. That needs
    // the total up front, hence the separate pass.
    let totalLength = 0;

    for (let i = 1; i < limit; i++) {
      totalLength += Math.sqrt((posX[i]! - posX[i - 1]!) ** 2 + (posY[i]! - posY[i - 1]!) ** 2);
    }

    // Every particle sits on the same spot: no path, no direction, nothing to
    // expand a strip around.
    if (totalLength === 0) {
      this._setCount(0);

      return;
    }

    // Must precede the view reads below: growing swaps in fresh typed-array
    // views over a new backing buffer.
    this._ensureCapacity(limit * 2 * vertexStrideBytes);

    const f32 = this._float32;
    const u32 = this._uint32;
    const width = this._width;

    let vertexCount = 0;
    let travelled = 0;
    let previousDirectionX = 0;
    let previousDirectionY = 0;
    let hasPreviousDirection = false;

    for (let i = 0; i < limit; i++) {
      if (i > 0) {
        travelled += Math.sqrt((posX[i]! - posX[i - 1]!) ** 2 + (posY[i]! - posY[i - 1]!) ** 2);
      }

      // Central difference through the neighbours, clamped to a one-sided
      // difference at the two ends of the strip.
      const before = i === 0 ? 0 : i - 1;
      const after = i === limit - 1 ? i : i + 1;

      let directionX = posX[after]! - posX[before]!;
      let directionY = posY[after]! - posY[before]!;

      const length = Math.sqrt(directionX ** 2 + directionY ** 2);

      if (length > 0) {
        directionX /= length;
        directionY /= length;
        previousDirectionX = directionX;
        previousDirectionY = directionY;
        hasPreviousDirection = true;
      } else if (hasPreviousDirection) {
        // Coincident neighbours leave no direction to expand around; carrying
        // the last one keeps the strip continuous instead of collapsing it.
        directionX = previousDirectionX;
        directionY = previousDirectionY;
      } else {
        // Head of the strip with nothing to inherit — this particle cannot be
        // placed, so it contributes no pair.
        continue;
      }

      const halfWidth = (width * scaleX[i]!) / 2;
      // The direction rotated 90°, scaled to the half-width in one step.
      const offsetX = -directionY * halfWidth;
      const offsetY = directionX * halfWidth;
      const u = travelled / totalLength;
      const packedColor = color[i]!;

      let offset = vertexCount * wordsPerVertex;

      f32[offset + 0] = posX[i]! - offsetX;
      f32[offset + 1] = posY[i]! - offsetY;
      f32[offset + 2] = u;
      f32[offset + 3] = 0;
      u32[offset + 4] = packedColor;

      offset += wordsPerVertex;

      f32[offset + 0] = posX[i]! + offsetX;
      f32[offset + 1] = posY[i]! + offsetY;
      f32[offset + 2] = u;
      f32[offset + 3] = 1;
      u32[offset + 4] = packedColor;

      vertexCount += 2;
    }

    this._setCount(vertexCount);
  }

  public override destroy(): void {
    this._material?.destroy();
    this._material = null;
  }

  protected override _onBufferGrown(data: ArrayBuffer): void {
    this._float32 = new Float32Array(data);
    this._uint32 = new Uint32Array(data);
  }
}
