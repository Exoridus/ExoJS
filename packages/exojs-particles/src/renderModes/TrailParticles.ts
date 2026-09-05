import type { Material } from '@codexo/exojs';
import { ShaderSource } from '@codexo/exojs';

import type { ParticleBatch } from '#ParticleStorage';
import type { ParticleSystem } from '#ParticleSystem';

import { ParticleBufferLayout } from './ParticleBufferLayout';
import { ParticleMaterial } from './ParticleMaterial';
import { ParticleRenderMode } from './ParticleRenderMode';
import fragmentSource from './shaders/trail.frag';
import vertexSource from './shaders/trail.vert';
import trailParticleWgslModule from './shaders/trail-particles.wgsl';

const vertexStrideBytes = 20;
const wordsPerVertex = vertexStrideBytes / Float32Array.BYTES_PER_ELEMENT;
const defaultWidth = 1;
const defaultPoints = 8;
const defaultInterval = 1 / 30;
const defaultFade = 0;

/** Construction options for {@link TrailParticles}. */
export interface TrailParticlesOptions {
  /**
   * Width of the trail in system-local units, before per-particle scaling.
   * The half-width actually emitted is `width * scaleX[i] / 2`.
   *
   * @default 1
   */
  readonly width?: number;

  /**
   * Recorded positions kept behind each particle, rounded down to a whole
   * number and at least one. Together with {@link interval} this fixes how far
   * back a trail reaches: `points * interval` seconds of travel.
   *
   * Costs `capacity * points * 2` floats of history for the system this mode
   * is attached to.
   *
   * @default 8
   */
  readonly points?: number;

  /**
   * Seconds between two recorded positions, measured on each particle's own
   * age so the trail spans the same amount of travel at any frame rate.
   *
   * A floor rather than a guarantee: a frame longer than the interval records
   * one position, not several, because the positions in between were never
   * simulated.
   *
   * @default 1 / 30
   */
  readonly interval?: number;

  /**
   * Alpha multiplier at the oldest end of a trail, interpolated from `1` at
   * the particle itself. A trail carries one particle's tint from end to end,
   * so this is what separates head from tail; `1` draws it as a solid band.
   *
   * @default 0
   */
  readonly fade?: number;
}

/**
 * WGSL counterpart of `shaders/trail.vert` + `shaders/trail.frag`. Vertex and
 * fragment entry points share one source per WGSL convention, and the
 * per-vertex attributes bind by `@location`, matching the declaration order and
 * byte offsets of {@link TrailParticles.dataLayout}.
 *
 * The uniform struct is the one the WebGPU particle renderer writes for every
 * mode, so `localBounds` and `uvBounds` are declared but unused here: the
 * trails carry their own final positions and UVs, and only the projection, the
 * system transform and the premultiply flag are read.
 */
export const trailParticleWgsl: string = trailParticleWgslModule;

/**
 * A motion trail behind every particle: each one drags a strip through the
 * positions it recently occupied, and all of them are drawn in a single
 * non-instanced draw.
 *
 * Where `RibbonParticles` connects the particles of one system into one band,
 * this connects each particle to its own past - the shape a swarm of sparks,
 * tracer rounds or comet debris wants, where every element needs its own
 * streak.
 *
 * Layout of the per-vertex buffer {@link build} fills (20 bytes, 3 attributes):
 *
 * ```
 *   a_position   f32x2  (offset  0,  8 bytes)  strip vertex (system-local)
 *   a_texcoord   f32x2  (offset  8,  8 bytes)  u along the trail, v across it
 *   a_color      u8x4   (offset 16,  4 bytes)  RGBA tint, alpha faded by age
 * ```
 *
 * **History is recorded on the particle's own clock.** A position is appended
 * to a particle's ring buffer once its age has advanced by
 * {@link TrailParticlesOptions.interval}, so a trail covers the same span of
 * travel whatever the frame rate; the live position is always drawn as the
 * head, which keeps the strip attached to the particle between two samples.
 *
 * **One instance per system.** The history is per-particle state carried
 * across frames and addressed by simulation slot, so two systems sharing one
 * instance would overwrite each other's trails.
 *
 * **The strips are built on the CPU**, so this mode is not GPU-eligible and a
 * system using it stays on the CPU simulation path (observable through
 * `ParticleSystem.gpuMode`). That is also what lets the history survive a
 * death: CPU-mode slots are dense and compaction copies survivors forward
 * stably, which is what {@link build} re-aligns the history rows against. It
 * identifies a particle by its age and its lifetime, so an update module that
 * rewrites a live particle's lifetime restarts that particle's trail.
 *
 * @example
 * const sparks = new ParticleSystem(sparkTexture, {
 *     capacity: 256,
 *     render: new TrailParticles({ width: 3, points: 12 }),
 * });
 */
export class TrailParticles extends ParticleRenderMode {
  public readonly instanced = false;

  /**
   * Floats spanned by one vertex. Exposed so callers reading {@link data} can
   * step through it without hard-coding the stride.
   */
  public readonly floatsPerVertex = wordsPerVertex;

  /**
   * The draw covers whatever {@link build} emitted this frame. Non-indexed by
   * construction: the strip's own vertex order is its topology, and an index
   * list would pin the draw to a fixed index count.
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
  private readonly _points: number;
  private readonly _interval: number;
  private readonly _fade: number;

  private readonly _pathX: Float32Array;
  private readonly _pathY: Float32Array;
  private readonly _pathDistance: Float32Array;

  private _material: ParticleMaterial | null = null;
  private _float32 = new Float32Array(this.data);
  private _uint32 = new Uint32Array(this.data);

  private _historyCapacity = 0;
  private _ring = new Float32Array(0);
  private _ringHead = new Int32Array(0);
  private _ringCount = new Int32Array(0);
  private _lastSample = new Float32Array(0);
  private _lastElapsed = new Float32Array(0);
  private _lastLifetime = new Float32Array(0);
  private _rows = 0;

  public constructor(options: TrailParticlesOptions = {}) {
    super();

    this._width = options.width ?? defaultWidth;
    this._points = Math.max(1, Math.floor(options.points ?? defaultPoints));
    this._interval = options.interval ?? defaultInterval;
    this._fade = options.fade ?? defaultFade;

    this._pathX = new Float32Array(this._points + 1);
    this._pathY = new Float32Array(this._points + 1);
    this._pathDistance = new Float32Array(this._points + 1);
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
        wgsl: trailParticleWgsl,
      }),
    });

    return this._material;
  }

  public build(_system: ParticleSystem, particles: ParticleBatch): void {
    const limit = particles.count;

    if (limit === 0) {
      this._rows = 0;
      this._setCount(0);

      return;
    }

    this._growHistory(particles.capacity);
    this._record(particles, limit);

    // Worst case: every particle contributes its full ring plus the live head,
    // and every strip after the first is opened by two degenerate vertices.
    this._ensureCapacity(limit * (2 * (this._points + 1) + 2) * vertexStrideBytes);
    this._setCount(this._expand(particles, limit));
  }

  public override destroy(): void {
    this._material?.destroy();
    this._material = null;
  }

  protected override _onBufferGrown(data: ArrayBuffer): void {
    this._float32 = new Float32Array(data);
    this._uint32 = new Uint32Array(data);
  }

  private _growHistory(capacity: number): void {
    if (this._historyCapacity >= capacity) {
      return;
    }

    this._historyCapacity = capacity;
    this._ring = new Float32Array(capacity * this._points * 2);
    this._ringHead = new Int32Array(capacity);
    this._ringCount = new Int32Array(capacity);
    this._lastSample = new Float32Array(capacity);
    this._lastElapsed = new Float32Array(capacity);
    this._lastLifetime = new Float32Array(capacity);
    this._rows = 0;
  }

  /**
   * Re-align the history rows carried from the last frame with this frame's
   * slots, then append a sample to each.
   */
  private _record(particles: ParticleBatch, limit: number): void {
    const { x: posX, y: posY } = particles.position;
    const { elapsed, lifetime } = particles.timing;
    const lastElapsed = this._lastElapsed;
    const lastLifetime = this._lastLifetime;
    const rows = this._rows;

    let source = 0;

    for (let i = 0; i < limit; i++) {
      const age = elapsed[i]!;
      const life = lifetime[i]!;

      // Compaction copies survivors forward without reordering them, so the
      // rows of the last frame line up with this frame's slots once the rows
      // whose particle died are skipped. A row belongs to slot `i` when it
      // agrees on the lifetime - fixed at spawn - and its age is behind the
      // slot's. A row whose particle expired cannot satisfy both: expiry means
      // its age had already reached that same lifetime, which no live slot's
      // age has.
      while (source < rows && (lastLifetime[source] !== life || lastElapsed[source]! >= age)) {
        source++;
      }

      if (source < rows) {
        this._moveRow(source, i);
        this._sample(i, posX[i]!, posY[i]!, age);
        source++;
      } else {
        this._restartRow(i, posX[i]!, posY[i]!, age);
      }

      lastElapsed[i] = age;
      lastLifetime[i] = life;
    }

    this._rows = limit;
  }

  private _moveRow(from: number, to: number): void {
    if (from === to) {
      return;
    }

    const span = this._points * 2;

    // Compaction only ever moves a survivor towards zero, so the destination
    // row is always below the source and the overlapping copy is safe.
    this._ring.copyWithin(to * span, from * span, from * span + span);
    this._ringHead[to] = this._ringHead[from]!;
    this._ringCount[to] = this._ringCount[from]!;
    this._lastSample[to] = this._lastSample[from]!;
  }

  private _restartRow(row: number, x: number, y: number, age: number): void {
    this._ringHead[row] = 0;
    this._ringCount[row] = 0;
    this._lastSample[row] = age;
    this._push(row, x, y);
  }

  private _sample(row: number, x: number, y: number, age: number): void {
    const interval = this._interval;
    const last = this._lastSample[row]!;
    const steps = Math.floor((age - last) / interval);

    if (steps <= 0) {
      return;
    }

    // Only one position is known for the whole frame, so a frame spanning
    // several intervals still records one. The clock catches up to the sampling
    // grid rather than to the frame, so the spacing survives the long frame.
    this._lastSample[row] = last + steps * interval;
    this._push(row, x, y);
  }

  private _push(row: number, x: number, y: number): void {
    const points = this._points;
    const head = this._ringHead[row]!;
    const count = this._ringCount[row]!;
    const offset = (row * points + head) * 2;

    this._ring[offset] = x;
    this._ring[offset + 1] = y;
    this._ringHead[row] = head + 1 === points ? 0 : head + 1;

    if (count < points) {
      this._ringCount[row] = count + 1;
    }
  }

  /** Expand every particle's recorded path into one triangle strip. */
  private _expand(particles: ParticleBatch, limit: number): number {
    const { x: posX, y: posY } = particles.position;
    const { x: scaleX } = particles.scale;
    const { color } = particles;
    const points = this._points;
    const ring = this._ring;
    const pathX = this._pathX;
    const pathY = this._pathY;
    const pathDistance = this._pathDistance;

    let vertexCount = 0;

    for (let i = 0; i < limit; i++) {
      // Newest first: the live position, then the ring walked backwards from
      // the most recent sample. The live head keeps the strip attached to the
      // particle between two samples.
      pathX[0] = posX[i]!;
      pathY[0] = posY[i]!;
      pathDistance[0] = 0;

      const head = this._ringHead[i]!;
      const recorded = this._ringCount[i]!;

      let length = 1;
      let travelled = 0;

      for (let k = 0; k < recorded; k++) {
        const offset = (i * points + ((head - 1 - k + points) % points)) * 2;
        const x = ring[offset]!;
        const y = ring[offset + 1]!;
        const segment = Math.sqrt((x - pathX[length - 1]!) ** 2 + (y - pathY[length - 1]!) ** 2);

        // On the frame a position is recorded it is the live one, and a
        // particle that stood still records the same spot repeatedly; either
        // way the duplicate would only contribute a zero-length segment.
        if (segment === 0) {
          continue;
        }

        travelled += segment;
        pathX[length] = x;
        pathY[length] = y;
        pathDistance[length] = travelled;
        length++;
      }

      // A strip needs a segment, and a segment needs two positions that are
      // not the same point.
      if (travelled === 0) {
        continue;
      }

      // Two degenerate vertices open a new strip inside the single draw without
      // joining it to the previous particle's. Both strips span an even number
      // of vertices, so the winding survives the restart. They are written
      // afterwards, once the vertices they duplicate exist.
      const stripStart = vertexCount === 0 ? 0 : vertexCount + 2;
      const written = this._expandPath(length, travelled, (this._width * scaleX[i]!) / 2, color[i]!, stripStart);

      if (written === 0) {
        continue;
      }

      if (stripStart !== vertexCount) {
        this._copyVertex(vertexCount - 1, vertexCount);
        this._copyVertex(stripStart, vertexCount + 1);
      }

      vertexCount = stripStart + written;
    }

    return vertexCount;
  }

  /**
   * Write one particle's path as a pair of vertices per position, starting at
   * `start`, and report how many vertices that produced.
   */
  private _expandPath(length: number, travelled: number, halfWidth: number, packed: number, start: number): number {
    const pathX = this._pathX;
    const pathY = this._pathY;
    const pathDistance = this._pathDistance;
    const fade = this._fade;
    const alpha = packed >>> 24;
    const rgb = packed & 0x00ffffff;
    const f32 = this._float32;
    const u32 = this._uint32;

    let vertexCount = 0;
    let previousDirectionX = 0;
    let previousDirectionY = 0;
    let hasPreviousDirection = false;

    for (let k = 0; k < length; k++) {
      // Central difference through the neighbouring positions, clamped to a
      // one-sided difference at the two ends of the trail.
      const before = k === 0 ? 0 : k - 1;
      const after = k === length - 1 ? k : k + 1;

      let directionX = pathX[after]! - pathX[before]!;
      let directionY = pathY[after]! - pathY[before]!;

      const distance = Math.sqrt(directionX ** 2 + directionY ** 2);

      if (distance > 0) {
        directionX /= distance;
        directionY /= distance;
        previousDirectionX = directionX;
        previousDirectionY = directionY;
        hasPreviousDirection = true;
      } else if (hasPreviousDirection) {
        // A particle that stood still leaves coincident samples with no
        // direction to expand around; carrying the last one keeps the strip
        // continuous instead of collapsing it.
        directionX = previousDirectionX;
        directionY = previousDirectionY;
      } else {
        // Head of the trail with nothing to inherit - this position cannot be
        // placed, so it contributes no pair.
        continue;
      }

      // The direction rotated 90 degrees, scaled to the half-width in one step.
      const offsetX = -directionY * halfWidth;
      const offsetY = directionX * halfWidth;
      const u = pathDistance[k]! / travelled;
      const tint = (rgb | (Math.round(alpha * (fade + (1 - fade) * (1 - u))) << 24)) >>> 0;

      let offset = (start + vertexCount) * wordsPerVertex;

      f32[offset + 0] = pathX[k]! - offsetX;
      f32[offset + 1] = pathY[k]! - offsetY;
      f32[offset + 2] = u;
      f32[offset + 3] = 0;
      u32[offset + 4] = tint;

      offset += wordsPerVertex;

      f32[offset + 0] = pathX[k]! + offsetX;
      f32[offset + 1] = pathY[k]! + offsetY;
      f32[offset + 2] = u;
      f32[offset + 3] = 1;
      u32[offset + 4] = tint;

      vertexCount += 2;
    }

    return vertexCount;
  }

  private _copyVertex(from: number, to: number): void {
    const source = from * wordsPerVertex;

    this._uint32.copyWithin(to * wordsPerVertex, source, source + wordsPerVertex);
  }
}
