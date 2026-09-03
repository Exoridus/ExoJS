/// <reference types="@webgpu/types" />

import type { Seconds } from '@codexo/exojs';
import { Rectangle } from '@codexo/exojs';
import { Drawable } from '@codexo/exojs';
import { logger } from '@codexo/exojs';
import { Spritesheet } from '@codexo/exojs';
import { Texture } from '@codexo/exojs';
import type { RenderPlanBuilder } from '@codexo/exojs/renderer-sdk';
import type { RenderBackend } from '@codexo/exojs/renderer-sdk';

import { ParticleGpuState } from '#gpu/ParticleGpuState';
import type { DeathModule } from '#modules/DeathModule';
import type { SpawnModule } from '#modules/SpawnModule';
import type { UpdateModule } from '#modules/UpdateModule';
import type { ParticleBatch, ParticleDeathContext, ParticleEmitter, ParticleWriter } from '#ParticleStorage';
import { ParticleSlotWriter, ParticleStorage } from '#ParticleStorage';
import type { ParticleRenderMode } from '#renderModes/ParticleRenderMode';
import { QuadParticles } from '#renderModes/QuadParticles';

const defaultCapacity = 4096;

/**
 * Lazily-initialised 1×1 opaque-white texture used as the default sprite
 * when a {@link ParticleSystem} is constructed without one. Particles
 * render as solid color quads (the per-particle `color` channel times
 * white-with-alpha-1). Shared across systems to avoid wasted texture
 * allocations.
 */
let defaultWhiteTexture: Texture | null = null;
const getDefaultWhiteTexture = (): Texture => {
  if (defaultWhiteTexture === null) {
    const canvas = document.createElement('canvas');

    canvas.width = 1;
    canvas.height = 1;

    const ctx = canvas.getContext('2d');

    if (ctx !== null) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
    }

    defaultWhiteTexture = new Texture(canvas);
  }

  return defaultWhiteTexture;
};

/**
 * The process-wide default render mode, created on first use.
 *
 * Every system constructed without `ParticleSystemOptions.render` draws with
 * this one instance. The backends key their GPU resources on the mode's
 * material, so sharing it means N systems cost one compiled program / pipeline
 * set, one vertex array object and one vertex buffer between them - what a
 * single system costs.
 *
 * Sharing the mode also shares its scratch buffer, which is safe because that
 * buffer is only live between a `build()` and the upload that immediately
 * follows it: the WebGL2 renderer flushes the pending system at the top of
 * every `render()` before building the next one, and the WebGPU renderer
 * copies the built bytes out through `queue.writeBuffer` before it moves on to
 * the next drawcall. That is exactly how the renderers behaved when each of
 * them owned one shared pack buffer for all systems.
 *
 * Never destroyed. It outlives every individual system (see
 * {@link ParticleSystem.destroy}), so a scene that destroys one system leaves
 * the others drawing and a system constructed afterwards reuses the already
 * compiled program instead of paying for a fresh one. The GPU resources behind
 * it are released by the backend when the renderer disconnects.
 */
let defaultRenderMode: ParticleRenderMode | null = null;
const getDefaultRenderMode = (): ParticleRenderMode => {
  defaultRenderMode ??= new QuadParticles();

  return defaultRenderMode;
};

/**
 * Options for {@link ParticleSystem}'s constructor - orthogonal config
 * that's independent of the texture source. Texture / frames / spritesheet
 * live in positional arguments to enforce mutual exclusivity at the type
 * level (you can't pass both a texture and a spritesheet by accident).
 */
export interface ParticleSystemOptions {
  /** Maximum particle count. Fixed at construction. Default 4096. */
  capacity?: number;
  /**
   * Direct GPU device. Lets advanced consumers wire a `GPUDevice` owned
   * outside an `Application` (or a mock device in tests). When omitted,
   * the backend reference is captured automatically on the first
   * {@link ParticleSystem.render} call - `WebGpuBackend` ⇒ GPU mode,
   * anything else (incl. WebGL2) ⇒ CPU mode.
   */
  device?: GPUDevice;
  /**
   * How this system's particles become vertices. Fixed at construction. A mode
   * with `gpuEligible === false` forces the system onto the CPU path -
   * silently, exactly like an update module without a `wgsl()` implementation,
   * and observable through {@link ParticleSystem.gpuMode}.
   *
   * **Ownership.** A mode passed here belongs to the system: the system
   * destroys it in {@link ParticleSystem.destroy}, which destroys the mode's
   * material and geometry and releases the GPU resources cached against them.
   * Pass one mode instance per system. Handing the same instance to two
   * systems is not supported - destroying either one pulls the material out
   * from under the other, which then silently rebuilds a fresh material and
   * pays for a fresh shader compile mid-life. Two systems that should share
   * one program simply omit this option; the default mode is shared for
   * exactly that reason and is not owned by any system.
   *
   * @default a process-wide shared {@link QuadParticles}
   */
  readonly render?: ParticleRenderMode;
}

/**
 * The central coordinator of the particle pipeline. `ParticleSystem` is a
 * {@link Drawable} that owns:
 *
 * - **Particle storage** - one channel per attribute (position, velocity,
 *   scale, rotation, color, timing, ...), sized to a fixed capacity at
 *   construction. Modules and render modes address it by name through a
 *   {@link ParticleBatch}; user code brings particles into existence with
 *   {@link emit}.
 * - **Spawn modules** - fill freshly emitted particles.
 * - **Update modules** - mutate the live range each frame (forces, color
 *   blends, scale curves, drag, ...). Built-in modules ship both CPU and
 *   WGSL implementations; custom modules can opt into GPU acceleration by
 *   implementing `wgsl()`.
 * - **Death modules** - fire once per dying particle, before its slot is
 *   recycled (sub-emitters, event hooks).
 *
 * **Auto-routing CPU vs GPU:** at first {@link update}, the system checks:
 * if a `WebGpuBackend` was supplied AND every registered update module has
 * `wgsl()` AND the render mode is GPU-eligible, the GPU path engages - a
 * composite compute pipeline runs
 * integration plus all module bodies in one dispatch and writes directly
 * into the renderer's instance buffer (no CPU readback). Otherwise the CPU
 * path runs the existing per-module `apply()` loops.
 *
 * **Per-frame order in {@link update} (CPU mode):**
 * 1. Run every spawn module.
 * 2. Integrate position from velocity, rotation from rotationSpeed, advance `elapsed`.
 * 3. Run every update module on the live range.
 * 4. Compact: scan `[0, liveCount)` forward, fire death modules on expired
 *    slots, copy survivors down. `liveCount` shrinks to the survivor count.
 *
 * **Per-frame order in {@link update} (GPU mode):**
 * 1. Run every spawn module (CPU writes initial values into the spawn slot).
 * 2. Detect expiries on CPU (via `elapsed >= lifetime`); fire death modules;
 *    set `lifetime[slot] = -1` sentinel + clear `alive[slot]` so the GPU
 *    shader skips them. **No compaction** - slots are recycled on next spawn.
 * 3. Dispatch the composite compute pipeline. Integration + update modules
 *    + pack-instances run in one pass; the instance buffer is written
 *    directly. CPU SoA stays as-is for spawn writes.
 *
 * **Coordinate space:** particle positions are LOCAL to the system. The
 * system's `getGlobalTransform()` is applied on top during rendering - both
 * the WebGL2 and WebGPU shaders multiply `projection * translation * rotated`.
 * Setting world-space positions on individual particles double-translates.
 * Position the system itself via `system.setPosition(...)` and emit relative
 * to `(0, 0)`.
 *
 * **View culling:** a system is created with `cullable = false`. Its local
 * bounds cover one texture frame at the local origin, because the particles
 * themselves are simulated on the GPU in half the configurations and no
 * emitted extent is tracked in either - so culling against those bounds would
 * remove the entire cloud as soon as the emitter's own origin left the view.
 * For a system whose reach is known, set the node's `cullArea` to a rectangle
 * in local space covering where its particles travel and set `cullable = true`
 * again; the viewport check then uses that rectangle instead of the bounds.
 * `getBounds()` still reports the one-frame box, not an extent of the live
 * particles.
 *
 * **Pixel snapping:** {@link Drawable.pixelSnapMode} is intentionally ignored
 * for particle systems. Particle instances bake their own per-particle
 * transforms in the emitter/compute path rather than reading the shared
 * pixel-snap transform row, so a snap mode set on the system has no effect on
 * rendered output - snapping thousands of independently-moving sub-pixel
 * particles to the device grid is neither meaningful nor desirable.
 *
 * @example
 * // Backend-agnostic - runs CPU on WebGL2, GPU on WebGPU automatically.
 * const system = new ParticleSystem(loader.get('spark.png'), {
 *     capacity: 8192,
 * });
 *
 * system.addSpawnModule(new RateSpawn({ rate: new Constant(60), ... }));
 * system.addUpdateModule(new ApplyForce(0, 980));     // gravity, GPU-eligible
 * system.addUpdateModule(new ColorOverLifetime(fireGradient));
 * scene.addChild(system);
 */
export class ParticleSystem extends Drawable implements ParticleEmitter {
  /** Maximum particle count this system will store. Fixed at construction. */
  public readonly capacity: number;

  /**
   * The simulation's channel storage. Handed to update modules and render modes
   * as a {@link ParticleBatch}; never exposed as a property of the system,
   * because outside those two callbacks its integrated values are not
   * backend-true.
   * @internal
   */
  public readonly _storage: ParticleStorage;

  private _writer: ParticleSlotWriter;

  private readonly _spawnModules: SpawnModule[] = [];
  private readonly _updateModules: UpdateModule[] = [];
  private readonly _deathModules: DeathModule[] = [];

  private _backend: RenderBackend | null = null;
  private readonly _device: GPUDevice | null = null;
  private _gpuState: ParticleGpuState | null = null;
  private _gpuMode = false;
  private _compiled = false;
  private _spawnHint = 0; // round-robin pointer for first-dead lookup in GPU mode
  /**
   * In GPU mode, slots whose CPU SoA values need re-uploading to the GPU
   * (newly spawned, or just-expired with lifetime sentinel). Cleared
   * after each compute dispatch. CPU never overwrites integrated GPU
   * state - only dirty slots flow CPU → GPU.
   */
  private readonly _gpuDirtySlots = new Set<number>();
  /**
   * Spawn lifetimes, in death order per slot, of the particles that expired
   * since the last batch the device staged for readback. The device's own
   * record cannot carry them: by the time the shader sees the particle, the CPU
   * has already overwritten its lifetime with the expiry sentinel. A slot can
   * appear more than once when it is recycled and dies again before the batch
   * is staged, so the lifetimes queue up per slot.
   */
  private _pendingDeathLifetimes = new Map<number, number[]>();

  /** Total entries across `_pendingDeathLifetimes`, which is what the dispatch reports. */
  private _pendingDeathCount = 0;

  /** Whether this system has already reported that its death backlog overflowed. */
  private _deathOverflowReported = false;
  /**
   * Slots handed out by `spawn()` while a recording window is open, or `null`
   * when nothing is recording. Lets callers identify freshly spawned particles
   * without diffing `liveCount`, which cannot see a recycled GPU slot.
   */
  private _spawnRecord: number[] | null = null;

  private readonly _renderMode: ParticleRenderMode;
  /** Whether {@link destroy} may destroy {@link _renderMode} - false for the shared default. */
  private readonly _ownsRenderMode: boolean;

  private _texture: Texture;
  private readonly _frames: Rectangle[] = [];
  private readonly _textureFrame: Rectangle = new Rectangle();
  private readonly _vertices: Float32Array = new Float32Array(4);
  private readonly _texCoords: Uint32Array = new Uint32Array(4);
  private _updateTexCoords = true;
  private _updateVertices = true;

  /** No texture - particles render as solid-color quads on a 1×1 white default. */
  public constructor(options?: ParticleSystemOptions);
  /** Single texture, no atlas - every particle uses the full texture as one frame. */
  public constructor(texture: Texture, options?: ParticleSystemOptions);
  /** Multi-frame atlas - each particle's `textureIndex` selects a frame. */
  public constructor(texture: Texture, frames: readonly Rectangle[], options?: ParticleSystemOptions);
  /** Spritesheet shorthand - texture + frames pulled from the sheet. */
  public constructor(spritesheet: Spritesheet, options?: ParticleSystemOptions);
  public constructor(
    sourceOrOptions?: Texture | Spritesheet | ParticleSystemOptions,
    framesOrOptions?: readonly Rectangle[] | ParticleSystemOptions,
    finalOptions?: ParticleSystemOptions,
  ) {
    super();

    // Disambiguate the four valid call shapes via instanceof checks.
    // The TS overloads above already prevent illegal combinations like
    // `(texture, sheet)` or `(sheet, frames)` at compile time; this
    // narrowing only sorts out the legal ones.
    let texture: Texture | null = null;
    let frames: readonly Rectangle[] | null = null;
    let options: ParticleSystemOptions;

    if (sourceOrOptions instanceof Texture) {
      texture = sourceOrOptions;

      if (Array.isArray(framesOrOptions)) {
        frames = framesOrOptions;
        options = finalOptions ?? {};
      } else {
        options = (framesOrOptions as ParticleSystemOptions | undefined) ?? {};
      }
    } else if (sourceOrOptions instanceof Spritesheet) {
      texture = sourceOrOptions.texture;
      frames = [...sourceOrOptions.frames.values()];
      options = (framesOrOptions as ParticleSystemOptions | undefined) ?? {};
    } else {
      options = sourceOrOptions ?? {};
    }

    const capacity = options.capacity ?? defaultCapacity;

    if (capacity <= 0 || !Number.isInteger(capacity)) {
      throw new Error(`ParticleSystem capacity must be a positive integer (got ${capacity}).`);
    }

    this.capacity = capacity;
    this._storage = new ParticleStorage(capacity);
    this._writer = new ParticleSlotWriter(this._storage);

    this._device = options.device ?? null;
    // A mode the caller supplied is this system's to destroy; the default is
    // shared with every other system that did not supply one, so it is not.
    this._ownsRenderMode = options.render !== undefined;
    this._renderMode = options.render ?? getDefaultRenderMode();
    this._texture = texture ?? getDefaultWhiteTexture();

    if (frames !== null) {
      for (const frame of frames) {
        this._frames.push(frame.clone());
      }
    }

    // Particles live in the system's local space and travel arbitrarily far
    // from its origin, but the node's own bounds only ever describe one
    // texture frame there - so the viewport check would drop the whole cloud
    // the moment the emitter's origin scrolled off screen. See the class docs
    // for `cullArea`, which is how a system opts back in.
    this.cullable = false;

    this.resetTextureFrame();
    this._healTextureFrameOnLoad(this._texture);
  }

  /**
   * The render mode this system's particles are drawn with. Fixed at
   * construction via `ParticleSystemOptions.render`; the backend renderers
   * read it every draw to learn the vertex layout, shader and draw model.
   *
   * Without that option this is the shared default mode - the same instance
   * every other defaulted system draws with, so do not destroy it or mutate
   * its material.
   */
  public get renderMode(): ParticleRenderMode {
    return this._renderMode;
  }

  public get texture(): Texture {
    return this._texture;
  }

  public set texture(texture: Texture) {
    this.setTexture(texture);
  }

  public get textureFrame(): Rectangle {
    return this._textureFrame;
  }

  public set textureFrame(frame: Rectangle) {
    this.setTextureFrame(frame);
  }

  /**
   * Atlas frames declared on this system, or empty when the texture is
   * used as a single frame. Each particle's {@link textureIndex} selects
   * an entry from this list; anything out of range shows frame 0.
   */
  public get frames(): readonly Rectangle[] {
    return this._frames;
  }

  /** `true` when the system declares more than one atlas frame. */
  public get hasAtlas(): boolean {
    return this._frames.length > 1;
  }

  public get vertices(): Float32Array {
    if (this._updateVertices) {
      const { x, y, width, height } = this._textureFrame;
      const offsetX = width / 2;
      const offsetY = height / 2;

      this._vertices[0] = x - offsetX;
      this._vertices[1] = y - offsetY;
      this._vertices[2] = width - offsetX;
      this._vertices[3] = height - offsetY;

      this._updateVertices = false;
    }

    return this._vertices;
  }

  public get texCoords(): Uint32Array {
    if (this._updateTexCoords) {
      const { width, height } = this._texture;
      const { left, top, right, bottom } = this._textureFrame;
      const minX = ((left / width) * 65535) & 65535;
      const minY = (((top / height) * 65535) & 65535) << 16;
      const maxX = ((right / width) * 65535) & 65535;
      const maxY = (((bottom / height) * 65535) & 65535) << 16;

      if (this._texture.flipY) {
        this._texCoords[0] = maxY | minX;
        this._texCoords[1] = maxY | maxX;
        this._texCoords[2] = minY | maxX;
        this._texCoords[3] = minY | minX;
      } else {
        this._texCoords[0] = minY | minX;
        this._texCoords[1] = minY | maxX;
        this._texCoords[2] = maxY | maxX;
        this._texCoords[3] = maxY | minX;
      }

      this._updateTexCoords = false;
    }

    return this._texCoords;
  }

  /** `true` when the system is running on the GPU compute pipeline. */
  public get gpuMode(): boolean {
    return this._gpuMode;
  }

  /** GPU-side state, or `null` in CPU mode. */
  public get gpuState(): ParticleGpuState | null {
    return this._gpuState;
  }

  /**
   * Upper bound of the slot range that can hold live particles.
   *
   * Exact on the CPU path: after each `update()` slots `[0, liveCount)` are all
   * alive. On the GPU path it is a high-water mark whose range can contain dead
   * holes that future emissions fill; {@link aliveCount} counts the live ones.
   */
  public get liveCount(): number {
    return this._storage.count;
  }

  /** Actual count of live particles. May be below {@link liveCount} on the GPU path. */
  public get aliveCount(): number {
    const { alive, count } = this._storage;
    let live = 0;

    for (let i = 0; i < count; i++) {
      if (alive[i] === 1) live++;
    }

    return live;
  }

  public get spawnModules(): readonly SpawnModule[] {
    return this._spawnModules;
  }

  public get updateModules(): readonly UpdateModule[] {
    return this._updateModules;
  }

  public get deathModules(): readonly DeathModule[] {
    return this._deathModules;
  }

  public setTexture(texture: Texture): this {
    if (this._texture !== texture) {
      this._texture = texture;
      this.resetTextureFrame();
      this._healTextureFrameOnLoad(texture);
    }

    return this;
  }

  /**
   * A deferred texture handle is 0x0 until its payload arrives, so the frame
   * reset that precedes this call sized every particle quad to nothing. Pick up
   * the real dimensions once the load resolves, unless the texture was swapped
   * or a frame was chosen deliberately in the meantime - an empty frame is the
   * only state this may overwrite.
   */
  private _healTextureFrameOnLoad(texture: Texture): void {
    if (texture.ready) {
      return;
    }

    void this._resetTextureFrameOnLoad(texture);
  }

  private async _resetTextureFrameOnLoad(texture: Texture): Promise<void> {
    try {
      await texture.loaded;
    } catch {
      return; // a failed load shows the missing-texture placeholder; nothing to heal
    }

    if (this._texture !== texture || this.destroyed) {
      return;
    }

    if (this._textureFrame.width === 0 && this._textureFrame.height === 0) {
      this.resetTextureFrame();
    }

    // Atlas UVs are divided by the texture size and uploaded to the device once,
    // when the GPU state is built. A system that reached the GPU path while the
    // texture was still 0x0 therefore holds non-finite coordinates that no
    // frame-level invalidation reaches.
    if (this._gpuState !== null && this._frames.length > 0) {
      this._gpuState.refreshFrames(this._frames, texture);
    }
  }

  public setTextureFrame(frame: Rectangle): this {
    this._textureFrame.copy(frame);
    this._updateTexCoords = true;
    this._updateVertices = true;

    this._setLocalBounds(0, 0, frame.width, frame.height);

    return this;
  }

  public resetTextureFrame(): this {
    return this.setTextureFrame(Rectangle.temp.set(0, 0, this._texture.width, this._texture.height));
  }

  public addSpawnModule(mod: SpawnModule): this {
    this._spawnModules.push(mod);

    return this;
  }

  /**
   * Registers an update module. Modules run in registration order, each seeing
   * what the previous ones did.
   *
   * Modules may be added and removed at any time, including mid-flight: the
   * next update rebuilds whatever the change invalidated. On the GPU path that
   * is the compute program alone - live particles keep the state the device has
   * been integrating. Adding a module without a `wgsl()` implementation to a
   * running GPU system is the one change that cannot preserve them: the
   * simulation moves to the CPU, which has no copy of the integrated state, so
   * the system clears its live particles rather than continuing from stale
   * values (see {@link clearParticles}).
   */
  public addUpdateModule(mod: UpdateModule): this {
    this._updateModules.push(mod);
    this._invalidateProgram();

    return this;
  }

  public addDeathModule(mod: DeathModule): this {
    const hadNone = this._deathModules.length === 0;

    this._deathModules.push(mod);

    // The GPU program only carries the death-reporting path when the system has
    // a death module, so gaining the first one rebuilds it.
    if (hadNone) {
      this._invalidateProgram();
    }

    return this;
  }

  public clearSpawnModules(): this {
    for (const mod of this._spawnModules) mod.destroy();

    this._spawnModules.length = 0;

    return this;
  }

  public clearUpdateModules(): this {
    for (const mod of this._updateModules) mod.destroy();

    this._updateModules.length = 0;
    this._invalidateProgram();

    return this;
  }

  public clearDeathModules(): this {
    for (const mod of this._deathModules) mod.destroy();

    this._deathModules.length = 0;
    this._invalidateProgram();

    return this;
  }

  /**
   * Brings one particle into existence and returns a writer for its initial
   * values, or `null` when the system is at {@link capacity}.
   *
   * The particle starts at the spawn defaults - origin, no velocity, unit
   * scale, no rotation, opaque white, frame 0, one second of life - so a caller
   * writes only what it varies. The returned writer is a cursor that the next
   * `emit()` rebinds, so it must not be stored.
   *
   * Emission is the only per-particle write that is true on every backend:
   * spawn values originate on the CPU and are uploaded from there, while
   * everything the simulation integrates afterwards lives wherever the
   * simulation runs.
   *
   * @example
   * ```ts
   * const particle = system.emit();
   *
   * if (particle) {
   *     particle.position.set(120, 40);
   *     particle.velocity.set(0, -80);
   *     particle.lifetime = 2;
   * }
   * ```
   */
  public emit(): ParticleWriter | null {
    const slot = this._spawnSlot();

    if (slot < 0) {
      return null;
    }

    if (__DEV__) {
      // One writer per emission in development, so a writer kept past the next
      // emit() throws on use rather than filling the wrong particle. Production
      // keeps the single cursor: the check teaches the contract, it does not
      // enforce it at runtime cost.
      this._writer.retire();
      this._writer = new ParticleSlotWriter(this._storage);
    }

    return this._writer.bind(slot);
  }

  /**
   * Allocates one slot at the spawn defaults and returns its index, or `-1` at
   * capacity. Backs {@link emit}; the simulation's own machinery addresses
   * particles by slot, the public surface does not.
   * @internal
   */
  public _spawnSlot(): number {
    const slot = this._gpuMode ? this._spawnGpu() : this._spawnCpu();

    if (slot >= 0) {
      this._storage.reset(slot);
    }

    return slot;
  }

  /**
   * Begin recording the slots handed out by {@link spawn}.
   *
   * Callers that post-process freshly spawned particles cannot infer which
   * slots those are from {@link liveCount}: in GPU mode a spawn may recycle a
   * dead slot below the high-water mark, leaving the count unchanged, and the
   * reused slots are scattered rather than contiguous. Pass the returned token
   * back to {@link _endSpawnRecording}.
   *
   * @internal
   */
  public _beginSpawnRecording(): number[] | null {
    const previous = this._spawnRecord;

    this._spawnRecord = [];

    return previous;
  }

  /**
   * End the recording started by {@link _beginSpawnRecording} and return the
   * slots allocated during it. Slots are also handed to an enclosing recording
   * so a nested spawn stays visible to the outer window.
   *
   * @internal
   */
  public _endSpawnRecording(previous: number[] | null): readonly number[] {
    const recorded = this._spawnRecord ?? [];

    this._spawnRecord = previous;

    if (previous !== null) {
      for (const slot of recorded) {
        previous.push(slot);
      }
    }

    return recorded;
  }

  /**
   * Shifts the particles a sub-emitter just produced by `(x, y)`, so a child
   * spawner's distributions read as offsets from the death position.
   * @internal
   */
  public _offsetSpawned(slots: readonly number[], x: number, y: number): void {
    const { posX, posY } = this._storage;

    for (const slot of slots) {
      posX[slot] = posX[slot]! + x;
      posY[slot] = posY[slot]! + y;
    }
  }

  /** Resets the system to zero live particles without destroying it. */
  public clearParticles(): this {
    const storage = this._storage;

    storage.count = 0;
    this._spawnHint = 0;
    storage.alive.fill(0);
    storage.lifetime.fill(0);
    storage.elapsed.fill(0);

    return this;
  }

  /**
   * @internal
   *
   * Collect-hook: captures the active backend before this node is emitted so
   * the next `update()` can compile a GPU pipeline if the backend turned out
   * to be `WebGpuBackend`. Re-captures and rebuilds when the backend
   * reference changes (e.g. after device-loss recovery).
   */
  /** @internal */
  public override _collect(builder: RenderPlanBuilder, seq?: number): void {
    const backend = builder.backend;

    if (this._backend !== backend) {
      this._backend = backend;

      if (this._gpuState !== null) {
        this._gpuState.destroy();
        this._gpuState = null;
        this._resetPendingDeaths();
      }

      this._gpuMode = false;
      this._compiled = false;
    }

    super._collect(builder, seq);
  }

  /** Per-frame entry point. Routes to CPU or GPU pipeline based on auto-detection at first call. */
  public update(delta: Seconds): this {
    if (!this._compiled) {
      this._compile();
    }

    const dt = delta;

    // 1. Emit (CPU writes storage in both modes).
    for (let i = 0; i < this._spawnModules.length; i++) {
      this._spawnModules[i]!.apply(this, dt);
    }

    if (this._gpuMode) {
      this._updateGpu(dt);
    } else {
      this._updateCpu(dt);
    }

    return this;
  }

  public override destroy(): void {
    super.destroy();

    this.clearSpawnModules();
    this.clearUpdateModules();
    this.clearDeathModules();

    // Only a mode this system exclusively owns goes down with it. The shared
    // default is process-wide: destroying it here would tear the material,
    // geometry and compiled program out from under every other system still
    // drawing with it.
    if (this._ownsRenderMode) {
      this._renderMode.destroy();
    }

    if (this._gpuState !== null) {
      this._gpuState.destroy();
      this._gpuState = null;
      this._resetPendingDeaths();
    }

    for (const frame of this._frames) {
      frame.destroy();
    }
    this._frames.length = 0;

    this._gpuMode = false;
    this._compiled = false;
    this._storage.count = 0;
    this._storage.alive.fill(0);
    this._textureFrame.destroy();
  }

  /**
   * Marks the compiled program stale. The next update decides what that costs:
   * a GPU system that stays GPU-eligible rebuilds only its program, everything
   * else follows the transition rules in {@link _compile}.
   */
  private _invalidateProgram(): void {
    this._compiled = false;
  }

  private _compile(): void {
    this._compiled = true;

    const eligible = this._updateModules.every(m => typeof m.wgsl === 'function') && this._renderMode.gpuEligible;

    // Already running on the GPU: keep the buffers the device has been
    // integrating and swap the program, or - when the change made the system
    // CPU-only - drop the state and the particles with it, because the CPU
    // holds no copy of what the device computed.
    if (this._gpuState !== null) {
      if (eligible) {
        this._gpuState.setProgram(this._updateModules, this._deathModules.length > 0);

        return;
      }

      this._gpuState.destroy();
      this._gpuState = null;
      this._resetPendingDeaths();
      this._gpuMode = false;
      this._gpuDirtySlots.clear();
      this.clearParticles();

      return;
    }

    // Duck-typed `instanceof WebGpuBackend` - avoids importing the
    // backend class (which registers a renderer for ParticleSystem
    // and would create a circular dependency). WebGl2Backend has no
    // `device` field, so this naturally falls back to CPU mode.
    const backendDevice = (this._backend as { device?: GPUDevice } | null)?.device ?? null;
    const device = this._device ?? backendDevice;

    if (device === null) {
      return;
    }

    if (!eligible) {
      return;
    }

    this._gpuState = new ParticleGpuState(device, this.capacity, this._updateModules, this._frames, this._texture, this._deathModules.length > 0);
    this._gpuMode = true;

    // Mark every currently-alive slot dirty so the initial upload
    // matches CPU state; subsequent frames only push deltas.
    const { alive, count } = this._storage;

    for (let i = 0; i < count; i++) {
      if (alive[i] === 1) this._gpuDirtySlots.add(i);
    }
  }

  private _spawnCpu(): number {
    const storage = this._storage;

    if (storage.count >= this.capacity) {
      return -1;
    }

    const slot = storage.count++;

    storage.alive[slot] = 1;
    this._spawnRecord?.push(slot);

    return slot;
  }

  private _spawnGpu(): number {
    const capacity = this.capacity;
    const storage = this._storage;
    const alive = storage.alive;
    const start = this._spawnHint;

    // Search forward from hint, then wrap.
    for (let i = start; i < capacity; i++) {
      if (alive[i] === 0) {
        return this._claimGpuSlot(i, i + 1 === capacity ? 0 : i + 1);
      }
    }

    for (let i = 0; i < start; i++) {
      if (alive[i] === 0) {
        return this._claimGpuSlot(i, i + 1);
      }
    }

    return -1;
  }

  private _claimGpuSlot(slot: number, nextHint: number): number {
    const storage = this._storage;

    storage.alive[slot] = 1;
    this._spawnHint = nextHint;

    if (slot >= storage.count) {
      storage.count = slot + 1;
    }

    this._gpuDirtySlots.add(slot);
    this._spawnRecord?.push(slot);

    return slot;
  }

  private _updateCpu(dt: number): void {
    const storage = this._storage;
    const { posX, posY, velX, velY, rotations, rotationSpeeds, elapsed, lifetime, alive } = storage;
    const liveCount = storage.count;

    for (let i = 0; i < liveCount; i++) {
      posX[i] = posX[i]! + velX[i]! * dt;
      posY[i] = posY[i]! + velY[i]! * dt;
      rotations[i] = rotations[i]! + rotationSpeeds[i]! * dt;
      elapsed[i] = elapsed[i]! + dt;
    }

    for (let i = 0; i < this._updateModules.length; i++) {
      this._updateModules[i]!.apply(storage, dt);
    }

    // Compact: forward pass, report deaths on expired, copy survivors down.
    const deathModules = this._deathModules;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < storage.count; readIndex++) {
      if (elapsed[readIndex]! >= lifetime[readIndex]!) {
        if (deathModules.length > 0) {
          this._reportDeath(storage.snapshot(readIndex));
        }

        alive[readIndex] = 0;
        continue;
      }

      if (writeIndex !== readIndex) {
        storage.copySlot(readIndex, writeIndex);
        alive[writeIndex] = 1;
      }

      writeIndex++;
    }

    for (let i = writeIndex; i < storage.count; i++) {
      alive[i] = 0;
    }

    storage.count = writeIndex;
  }

  /** Hands one death snapshot to every registered death module, in registration order. */
  private _reportDeath(death: ParticleDeathContext): void {
    const deathModules = this._deathModules;

    for (let m = 0; m < deathModules.length; m++) {
      deathModules[m]!.onDeath(this, death);
    }
  }

  private _updateGpu(dt: number): void {
    // CPU advances its own copy of `elapsed` for expire detection only.
    // GPU's `timing[idx].x` is advanced independently inside the compute
    // shader; the two are never synced after spawn. They tick at the
    // same rate (both add `dt` per frame) so they stay equivalent in
    // practice (modulo numerical drift).
    const storage = this._storage;
    const { elapsed, lifetime, alive } = storage;
    const liveCount = storage.count;
    const reportsDeaths = this._deathModules.length > 0;

    for (let i = 0; i < liveCount; i++) {
      if (alive[i] === 0) continue;

      elapsed[i] = elapsed[i]! + dt;

      if (elapsed[i]! >= lifetime[i]!) {
        // The lifetime is about to become the expiry sentinel, so keep the one
        // the particle was spawned with: it is the CPU's own value, and the
        // record the device appends carries only what the device integrated.
        if (reportsDeaths) {
          const queued = this._pendingDeathLifetimes.get(i);

          if (queued === undefined) {
            this._pendingDeathLifetimes.set(i, [lifetime[i]!]);
          } else {
            queued.push(lifetime[i]!);
          }

          this._pendingDeathCount++;
        }

        alive[i] = 0;
        lifetime[i] = -1; // sentinel - the shader captures it, then skips

        // Only the sentinel goes up. A full slot upload would overwrite the
        // position and velocity the device integrated with the CPU's spawn-time
        // copy, which is precisely the staleness the death record avoids.
        this._gpuDirtySlots.delete(i);
        this._gpuState!.uploadExpiry(i);
      }
    }

    // Push dirty slots (new spawns + just-expired) to GPU. CPU is NOT
    // the source of truth for integrated position/velocity/etc. after
    // spawn - uploading the full live range every frame would wipe
    // out GPU's integrated state.
    if (this._gpuDirtySlots.size > 0) {
      this._gpuState!.uploadDirty(this, this._gpuDirtySlots);
      this._gpuDirtySlots.clear();
    }

    if (__DEV__ && this._pendingDeathCount > storage.capacity && !this._deathOverflowReported) {
      this._deathOverflowReported = true;
      logger.warn(
        `ParticleSystem: the device held back ${this._pendingDeathCount} unreported deaths, more than the system's capacity of ${storage.capacity}. ` +
          'The excess is dropped: those particles expire without a death callback. Deaths queue on the device while readbacks are in flight, ' +
          'so this means either the death callbacks are outpacing the readback or the system recycles slots faster than it can report them.',
        { source: 'particles' },
      );
    }

    // Dispatch over the pre-trim range: a slot that expired at the tail still
    // has to be visited once, or its death record is never appended.
    const staged = this._gpuState!.dispatch(dt, liveCount, this._pendingDeathCount);

    // Trim trailing dead slots for the next frame.
    let newLiveCount = storage.count;
    while (newLiveCount > 0 && alive[newLiveCount - 1] === 0) {
      newLiveCount--;
    }
    storage.count = newLiveCount;

    // Deaths the device could not stage stay queued here: they are appended
    // behind the ones already in the death buffer and travel with the batch
    // that does get staged.
    if (staged) {
      const pending = this._pendingDeathLifetimes;

      this._pendingDeathLifetimes = new Map();
      this._pendingDeathCount = 0;

      void this._drainDeaths(pending);
    }
  }

  /**
   * Forgets deaths that were queued for a GPU state that no longer exists. The
   * records they describe lived in that state's device buffer, so a rebuilt
   * state would stage that many records out of a freshly zeroed buffer and hand
   * every death module a zero-valued context.
   */
  private _resetPendingDeaths(): void {
    this._pendingDeathLifetimes.clear();
    this._pendingDeathCount = 0;
    // Re-armed with the backlog itself: the warning reports a condition, not a
    // process-lifetime event.
    this._deathOverflowReported = false;
  }

  /**
   * Delivers a staged batch of deaths once its readback has landed. Each record
   * carries what the device integrated; the lifetime comes from the CPU, which
   * is where it was written at spawn.
   */
  private async _drainDeaths(pending: Map<number, number[]>): Promise<void> {
    await this._gpuState?.readDeaths(records => {
      for (const record of records) {
        this._reportDeath({
          x: record.x,
          y: record.y,
          velocityX: record.velocityX,
          velocityY: record.velocityY,
          rotation: record.rotation,
          scaleX: record.scaleX,
          scaleY: record.scaleY,
          color: record.color,
          elapsed: record.elapsed,
          // Records are slot-ordered and, within a slot, in the order the
          // device appended them - which is the order the lifetimes queued.
          lifetime: pending.get(record.slot)?.shift() ?? 0,
        });
      }
    });
  }
}
