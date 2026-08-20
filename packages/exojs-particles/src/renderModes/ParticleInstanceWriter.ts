import type { GeometryAttribute } from '@codexo/exojs';

import type { ParticleBatch } from '#ParticleStorage';
import type { ParticleSystem } from '#ParticleSystem';

/** Bytes one particle occupies in the interleaved per-instance buffer. */
export const instanceStrideBytes = 40;

/** 32-bit words one particle occupies in that buffer. */
export const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;

/**
 * The per-instance attribute layout every instanced render mode declares, and
 * the layout the GPU compute pipeline emits into its instance buffer:
 *
 * ```
 *   a_position   f32x2  (offset  0,  8 bytes)  particle position (system-local)
 *   a_scale      f32x2  (offset  8,  8 bytes)
 *   a_rotation   f32    (offset 16,  4 bytes)  degrees
 *   a_color      u8x4   (offset 20,  4 bytes)  RGBA tint, normalised
 *   a_uvMin      f32x2  (offset 24,  8 bytes)  pre-resolved frame uvMin
 *   a_uvMax      f32x2  (offset 32,  8 bytes)  pre-resolved frame uvMax
 * ```
 *
 * Shared rather than copied per mode so a mode using it cannot drift out of
 * step with the compute shader and quietly lose its GPU eligibility. `Geometry`
 * copies the attribute objects it is handed, so one frozen list serves every
 * mode.
 */
export const instanceAttributes: readonly GeometryAttribute[] = [
  { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
  { name: 'a_scale', size: 2, type: 'f32', normalized: false, offset: 8 },
  { name: 'a_rotation', size: 1, type: 'f32', normalized: false, offset: 16 },
  { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 20 },
  { name: 'a_uvMin', size: 2, type: 'f32', normalized: false, offset: 24 },
  { name: 'a_uvMax', size: 2, type: 'f32', normalized: false, offset: 32 },
];

/**
 * Fills the interleaved per-instance buffer shared by the instanced render
 * modes - one 40-byte record per live particle, in {@link instanceAttributes}
 * order.
 *
 * A class rather than a free function because the frame-UV table it resolves
 * per frame is scratch state that must survive between calls: the arithmetic
 * runs once per declared frame, not once per particle.
 *
 * This is the CPU counterpart of the compute pipeline's pack-instances step;
 * the two must agree byte for byte, since a GPU-eligible mode's system swaps
 * between them silently depending on the backend.
 */
export class ParticleInstanceWriter {
  private _uvMinsScratch = new Float32Array(2);
  private _uvMaxsScratch = new Float32Array(2);

  /**
   * Pack the live particles into the two views over one buffer, which must
   * already hold `particles.count * instanceStrideBytes` bytes. Returns the
   * number of instances written - dead slots in a GPU-mode system's live range
   * are skipped, so that can be below the count.
   */
  public write(system: ParticleSystem, particles: ParticleBatch, f32: Float32Array, u32: Uint32Array): number {
    const limit = particles.count;
    const { x: posX, y: posY } = particles.position;
    const { x: scaleX, y: scaleY } = particles.scale;
    const { angle: rotations } = particles.rotation;
    const { color, frame: textureIndex } = particles;

    // Pre-compute frame UVs from system.frames + texture; falls back
    // to the system.textureFrame when no atlas is declared.
    const { uvMins, uvMaxs } = this._computeFrameUvs(system);
    const frameCount = uvMins.length / 2;
    // Anything that is not a valid explicit index shows frame 0, matching both
    // the zero-initialised default and the compute pipeline. See
    // `ParticleSystem.textureIndex`.
    const fallbackFrame = 0;

    let writeIndex = 0;

    for (let i = 0; i < limit; i++) {
      // Skip dead slots in GPU-mode systems where the live range can
      // contain holes.
      if (!particles.isAlive(i)) {
        continue;
      }

      const offset = writeIndex * wordsPerInstance;
      const frame = textureIndex[i]! < frameCount ? textureIndex[i]! : fallbackFrame;
      const uvBase = frame * 2;

      f32[offset + 0] = posX[i]!;
      f32[offset + 1] = posY[i]!;
      f32[offset + 2] = scaleX[i]!;
      f32[offset + 3] = scaleY[i]!;
      f32[offset + 4] = rotations[i]!;
      u32[offset + 5] = color[i]!;
      f32[offset + 6] = uvMins[uvBase + 0]!;
      f32[offset + 7] = uvMins[uvBase + 1]!;
      f32[offset + 8] = uvMaxs[uvBase + 0]!;
      f32[offset + 9] = uvMaxs[uvBase + 1]!;

      writeIndex++;
    }

    return writeIndex;
  }

  /**
   * Compute (uvMin, uvMax) pairs for every declared frame on the system.
   * Pulled out of the hot pack loop so the arithmetic runs once per frame
   * rather than once per particle. Falls back to a single entry from
   * `system.textureFrame` when no atlas is declared.
   */
  private _computeFrameUvs(system: ParticleSystem): { uvMins: Float32Array; uvMaxs: Float32Array } {
    const frames = system.frames;
    const tex = system.texture;
    const texW = tex.width;
    const texH = tex.height;
    const flipY = tex.flipY;

    const count = frames.length === 0 ? 1 : frames.length;

    // Re-allocate scratch when capacity grows.
    if (this._uvMinsScratch.length < count * 2) {
      this._uvMinsScratch = new Float32Array(count * 2);
      this._uvMaxsScratch = new Float32Array(count * 2);
    }

    const mins = this._uvMinsScratch;
    const maxs = this._uvMaxsScratch;

    if (frames.length === 0) {
      const f = system.textureFrame;
      const minU = f.left / texW;
      const maxU = f.right / texW;
      const topV = f.top / texH;
      const bottomV = f.bottom / texH;

      mins[0] = minU;
      mins[1] = flipY ? bottomV : topV;
      maxs[0] = maxU;
      maxs[1] = flipY ? topV : bottomV;

      return { uvMins: mins, uvMaxs: maxs };
    }

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      const o = i * 2;
      const minU = f.left / texW;
      const maxU = f.right / texW;
      const topV = f.top / texH;
      const bottomV = f.bottom / texH;

      mins[o + 0] = minU;
      mins[o + 1] = flipY ? bottomV : topV;
      maxs[o + 0] = maxU;
      maxs[o + 1] = flipY ? topV : bottomV;
    }

    return { uvMins: mins, uvMaxs: maxs };
  }
}
