/// <reference types="@webgpu/types" />

import { Rectangle } from '@/math/Rectangle';
import type { Time } from '@/core/Time';
import { Drawable } from '@/rendering/Drawable';
import type { Texture } from '@/rendering/texture/Texture';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';
import type { SpawnModule } from './modules/SpawnModule';
import type { UpdateModule } from './modules/UpdateModule';
import type { DeathModule } from './modules/DeathModule';
import { ParticleGpuState } from './gpu/ParticleGpuState';

const defaultCapacity = 4096;

/** Options for {@link ParticleSystem}'s constructor. */
export interface ParticleSystemOptions {
    /** Maximum particle count. Fixed at construction. Default 4096. */
    capacity?: number;
    /**
     * Render backend reference. When supplied AND the backend is a
     * `WebGpuBackend` AND every registered {@link UpdateModule} has a
     * `wgsl()` implementation, the system runs the simulation on the GPU
     * via a composite compute pipeline. Otherwise the system runs the
     * simulation on the CPU using each module's `apply()` method.
     *
     * Backend-binding is finalised on the **first** call to {@link update}
     * — register all spawn / update / death modules before then. Adding
     * an update module after that throws.
     */
    backend?: RenderBackend;
    /**
     * Direct GPU device, bypassing the {@link backend} duck-type check.
     * Useful for tests with mocked devices and for advanced scenarios
     * where the device is owned outside an ExoJS `Application`. Mutually
     * exclusive with {@link backend} — `device` wins if both are set.
     */
    device?: GPUDevice;
}

/**
 * The central coordinator of the particle pipeline. `ParticleSystem` is a
 * {@link Drawable} that owns:
 *
 * - **SoA particle storage** — one typed array per attribute (position,
 *   velocity, scale, rotation, color, lifetime, ...), sized to a fixed
 *   capacity at construction. User code reads/writes via
 *   `system.posX[slot]`, `system.velX[slot]`, etc.
 * - **Spawn modules** — write new particles into freshly allocated slots.
 * - **Update modules** — mutate the live range each frame (forces, color
 *   blends, scale curves, drag, ...). Built-in modules ship both CPU and
 *   WGSL implementations; custom modules can opt into GPU acceleration by
 *   implementing `wgsl()`.
 * - **Death modules** — fire once per dying particle, before its slot is
 *   recycled (sub-emitters, event hooks).
 *
 * **Auto-routing CPU vs GPU:** at first {@link update}, the system checks:
 * if a `WebGpuBackend` was supplied AND every registered update module has
 * `wgsl()`, the GPU path engages — a composite compute pipeline runs
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
 *    shader skips them. **No compaction** — slots are recycled on next spawn.
 * 3. Dispatch the composite compute pipeline. Integration + update modules
 *    + pack-instances run in one pass; the instance buffer is written
 *    directly. CPU SoA stays as-is for spawn writes.
 *
 * **Coordinate space:** particle positions are LOCAL to the system. The
 * system's `getGlobalTransform()` is applied on top during rendering — both
 * the WebGL2 and WebGPU shaders multiply `projection * translation * rotated`.
 * Setting world-space positions on individual particles double-translates.
 * Position the system itself via `system.setPosition(...)` and emit relative
 * to `(0, 0)`.
 *
 * @example
 * // Backend-agnostic — runs CPU on WebGL2, GPU on WebGPU automatically.
 * const system = new ParticleSystem(loader.get(Texture, 'spark'), {
 *     capacity: 8192,
 *     backend: app.backend,
 * });
 *
 * system.addSpawnModule(new RateSpawn({ rate: new Constant(60), ... }));
 * system.addUpdateModule(new ApplyForce(0, 980));     // gravity, GPU-eligible
 * system.addUpdateModule(new ColorOverLifetime(fireGradient));
 * scene.addChild(system);
 */
export class ParticleSystem extends Drawable {
    /** Maximum particle count this system will store. Fixed at construction. */
    public readonly capacity: number;

    public readonly posX: Float32Array;
    public readonly posY: Float32Array;
    public readonly velX: Float32Array;
    public readonly velY: Float32Array;
    public readonly scaleX: Float32Array;
    public readonly scaleY: Float32Array;
    public readonly rotations: Float32Array;
    public readonly rotationSpeeds: Float32Array;
    public readonly color: Uint32Array;        // packed 0xAABBGGRR
    public readonly elapsed: Float32Array;     // seconds since spawn
    public readonly lifetime: Float32Array;    // total seconds before expiry; -1 sentinel for dead in GPU mode
    public readonly textureIndex: Uint16Array;

    /**
     * Number of currently live particles. In CPU mode this is exact: slots
     * `[0, liveCount)` are all alive after each `update()`. In GPU mode
     * this is a high-water mark — slots `[0, liveCount)` may contain dead
     * holes (filled in by future spawns); use {@link aliveCount} for the
     * actual alive count.
     */
    public liveCount = 0;

    /**
     * Per-slot alive flag (1 = alive, 0 = dead). Maintained in both CPU
     * and GPU mode. Custom modules iterating the live range should check
     * this to skip dead slots in GPU mode.
     */
    public readonly alive: Uint8Array;

    private readonly _spawnModules: Array<SpawnModule> = [];
    private readonly _updateModules: Array<UpdateModule> = [];
    private readonly _deathModules: Array<DeathModule> = [];

    private readonly _backend: RenderBackend | null = null;
    private readonly _device: GPUDevice | null = null;
    private _gpuState: ParticleGpuState | null = null;
    private _gpuMode = false;
    private _compiled = false;
    private _spawnHint = 0;        // round-robin pointer for first-dead lookup in GPU mode

    private _texture: Texture;
    private readonly _textureFrame: Rectangle = new Rectangle();
    private readonly _vertices: Float32Array = new Float32Array(4);
    private readonly _texCoords: Uint32Array = new Uint32Array(4);
    private _updateTexCoords = true;
    private _updateVertices = true;

    public constructor(texture: Texture, options: ParticleSystemOptions | number = {}) {
        super();

        // Back-compat: a bare `number` second arg is treated as `capacity`.
        const opts: ParticleSystemOptions = typeof options === 'number' ? { capacity: options } : options;
        const capacity = opts.capacity ?? defaultCapacity;

        if (capacity <= 0 || !Number.isInteger(capacity)) {
            throw new Error(`ParticleSystem capacity must be a positive integer (got ${capacity}).`);
        }

        this.capacity = capacity;
        this.posX = new Float32Array(capacity);
        this.posY = new Float32Array(capacity);
        this.velX = new Float32Array(capacity);
        this.velY = new Float32Array(capacity);
        this.scaleX = new Float32Array(capacity);
        this.scaleY = new Float32Array(capacity);
        this.rotations = new Float32Array(capacity);
        this.rotationSpeeds = new Float32Array(capacity);
        this.color = new Uint32Array(capacity);
        this.elapsed = new Float32Array(capacity);
        this.lifetime = new Float32Array(capacity);
        this.textureIndex = new Uint16Array(capacity);
        this.alive = new Uint8Array(capacity);

        this._backend = opts.backend ?? null;
        this._device = opts.device ?? null;
        this._texture = texture;
        this.resetTextureFrame();
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

    public get vertices(): Float32Array {
        if (this._updateVertices) {
            const { x, y, width, height } = this._textureFrame;
            const offsetX = (width / 2);
            const offsetY = (height / 2);

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
            const minX = ((left / width) * 65535 & 65535);
            const minY = ((top / height) * 65535 & 65535) << 16;
            const maxX = ((right / width) * 65535 & 65535);
            const maxY = ((bottom / height) * 65535 & 65535) << 16;

            if (this._texture.flipY) {
                this._texCoords[0] = (maxY | minX);
                this._texCoords[1] = (maxY | maxX);
                this._texCoords[2] = (minY | maxX);
                this._texCoords[3] = (minY | minX);
            } else {
                this._texCoords[0] = (minY | minX);
                this._texCoords[1] = (minY | maxX);
                this._texCoords[2] = (maxY | maxX);
                this._texCoords[3] = (maxY | minX);
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

    /** Actual count of live particles (slots with `alive[i] === 1`). May differ from `liveCount` in GPU mode. */
    public get aliveCount(): number {
        let count = 0;

        for (let i = 0; i < this.liveCount; i++) {
            if (this.alive[i]) count++;
        }

        return count;
    }

    public get spawnModules(): ReadonlyArray<SpawnModule> {
        return this._spawnModules;
    }

    public get updateModules(): ReadonlyArray<UpdateModule> {
        return this._updateModules;
    }

    public get deathModules(): ReadonlyArray<DeathModule> {
        return this._deathModules;
    }

    public setTexture(texture: Texture): this {
        if (this._texture !== texture) {
            this._texture = texture;
            this.resetTextureFrame();
        }

        return this;
    }

    public setTextureFrame(frame: Rectangle): this {
        this._textureFrame.copy(frame);
        this._updateTexCoords = true;
        this._updateVertices = true;

        this.localBounds.set(0, 0, frame.width, frame.height);
        this._invalidateBoundsCascade();

        return this;
    }

    public resetTextureFrame(): this {
        return this.setTextureFrame(Rectangle.temp.set(0, 0, this._texture.width, this._texture.height));
    }

    public addSpawnModule(mod: SpawnModule): this {
        this._spawnModules.push(mod);

        return this;
    }

    public addUpdateModule(mod: UpdateModule): this {
        if (this._compiled) {
            throw new Error('Cannot add update modules after the system has been compiled (first update). Register all modules before the first update().');
        }

        this._updateModules.push(mod);

        return this;
    }

    public addDeathModule(mod: DeathModule): this {
        this._deathModules.push(mod);

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

        return this;
    }

    public clearDeathModules(): this {
        for (const mod of this._deathModules) mod.destroy();

        this._deathModules.length = 0;

        return this;
    }

    /**
     * Allocates a particle slot and returns its index. Returns `-1` when
     * the system is at {@link capacity}.
     *
     * **CPU mode:** slots are dense in `[0, liveCount)`. `spawn()` returns
     * the next sequential slot; `liveCount++`.
     *
     * **GPU mode:** slots may have dead holes. `spawn()` finds the first
     * `alive[i] === 0` slot via a round-robin hint pointer (amortised O(1),
     * worst case O(capacity) on full systems).
     */
    public spawn(): number {
        if (this._gpuMode) {
            return this._spawnGpu();
        }

        return this._spawnCpu();
    }

    /** Resets the system to zero live particles without destroying it. */
    public clearParticles(): this {
        this.liveCount = 0;
        this._spawnHint = 0;
        this.alive.fill(0);
        this.lifetime.fill(0);
        this.elapsed.fill(0);

        return this;
    }

    /** Per-frame entry point. Routes to CPU or GPU pipeline based on auto-detection at first call. */
    public update(delta: Time): this {
        if (!this._compiled) {
            this._compile();
        }

        const dt = delta.seconds;

        // 1. Spawn (CPU writes SoA in both modes).
        for (let i = 0; i < this._spawnModules.length; i++) {
            this._spawnModules[i].apply(this, dt);
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

        if (this._gpuState !== null) {
            this._gpuState.destroy();
            this._gpuState = null;
        }

        this._gpuMode = false;
        this._compiled = false;
        this.liveCount = 0;
        this.alive.fill(0);
        this._textureFrame.destroy();
    }

    private _compile(): void {
        this._compiled = true;

        const device = this._device
            ?? (this._backend instanceof WebGpuBackend ? this._backend.device : null);

        if (device === null) {
            return;
        }

        const allEligible = this._updateModules.every((m) => typeof m.wgsl === 'function');

        if (!allEligible) {
            return;
        }

        this._gpuState = new ParticleGpuState(device, this.capacity, this._updateModules);
        this._gpuMode = true;
    }

    private _spawnCpu(): number {
        if (this.liveCount >= this.capacity) {
            return -1;
        }

        const slot = this.liveCount++;

        this.alive[slot] = 1;
        this.elapsed[slot] = 0;

        return slot;
    }

    private _spawnGpu(): number {
        const capacity = this.capacity;
        const alive = this.alive;
        const start = this._spawnHint;

        // Search forward from hint, then wrap.
        for (let i = start; i < capacity; i++) {
            if (alive[i] === 0) {
                alive[i] = 1;
                this.elapsed[i] = 0;
                this._spawnHint = i + 1 === capacity ? 0 : i + 1;
                if (i >= this.liveCount) this.liveCount = i + 1;
                return i;
            }
        }

        for (let i = 0; i < start; i++) {
            if (alive[i] === 0) {
                alive[i] = 1;
                this.elapsed[i] = 0;
                this._spawnHint = i + 1;
                if (i >= this.liveCount) this.liveCount = i + 1;
                return i;
            }
        }

        return -1;
    }

    private _updateCpu(dt: number): void {
        const { posX, posY, velX, velY, rotations, rotationSpeeds, elapsed } = this;
        const liveCount = this.liveCount;

        for (let i = 0; i < liveCount; i++) {
            posX[i] += velX[i] * dt;
            posY[i] += velY[i] * dt;
            rotations[i] += rotationSpeeds[i] * dt;
            elapsed[i] += dt;
        }

        for (let i = 0; i < this._updateModules.length; i++) {
            this._updateModules[i].apply(this, dt);
        }

        // Compact: forward pass, fire death modules on expired, copy survivors down.
        const lifetime = this.lifetime;
        const alive = this.alive;
        const deathModules = this._deathModules;
        let writeIndex = 0;

        for (let readIndex = 0; readIndex < this.liveCount; readIndex++) {
            if (elapsed[readIndex] >= lifetime[readIndex]) {
                for (let m = 0; m < deathModules.length; m++) {
                    deathModules[m].onDeath(this, readIndex);
                }
                alive[readIndex] = 0;
                continue;
            }

            if (writeIndex !== readIndex) {
                this._copySlot(readIndex, writeIndex);
                alive[writeIndex] = 1;
            }

            writeIndex++;
        }

        for (let i = writeIndex; i < this.liveCount; i++) {
            alive[i] = 0;
        }

        this.liveCount = writeIndex;
    }

    private _updateGpu(dt: number): void {
        // CPU advances elapsed locally + detects expiries (cheap).
        // No readback from GPU.
        const elapsed = this.elapsed;
        const lifetime = this.lifetime;
        const alive = this.alive;
        const deathModules = this._deathModules;
        const liveCount = this.liveCount;

        for (let i = 0; i < liveCount; i++) {
            if (alive[i] === 0) continue;

            elapsed[i] += dt;

            if (elapsed[i] >= lifetime[i]) {
                for (let m = 0; m < deathModules.length; m++) {
                    deathModules[m].onDeath(this, i);
                }
                alive[i] = 0;
                lifetime[i] = -1;  // sentinel for GPU shader skip
            }
        }

        // Trim trailing dead slots.
        let newLiveCount = this.liveCount;
        while (newLiveCount > 0 && alive[newLiveCount - 1] === 0) {
            newLiveCount--;
        }
        this.liveCount = newLiveCount;

        // Dispatch GPU compute (integration + module bodies + pack-instances).
        this._gpuState!.dispatch(this, dt);
    }

    private _copySlot(from: number, to: number): void {
        this.posX[to] = this.posX[from];
        this.posY[to] = this.posY[from];
        this.velX[to] = this.velX[from];
        this.velY[to] = this.velY[from];
        this.scaleX[to] = this.scaleX[from];
        this.scaleY[to] = this.scaleY[from];
        this.rotations[to] = this.rotations[from];
        this.rotationSpeeds[to] = this.rotationSpeeds[from];
        this.color[to] = this.color[from];
        this.elapsed[to] = this.elapsed[from];
        this.lifetime[to] = this.lifetime[from];
        this.textureIndex[to] = this.textureIndex[from];
    }
}
