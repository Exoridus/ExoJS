import { Rectangle } from '@/math/Rectangle';
import type { Time } from '@/core/Time';
import { Drawable } from '@/rendering/Drawable';
import type { Texture } from '@/rendering/texture/Texture';
import type { SpawnModule } from './modules/SpawnModule';
import type { UpdateModule } from './modules/UpdateModule';
import type { DeathModule } from './modules/DeathModule';

const DEFAULT_CAPACITY = 4096;

/**
 * The central coordinator of the particle pipeline. `ParticleSystem` is a
 * {@link Drawable} that owns:
 *
 * - **SoA particle storage** — one `Float32Array` (or `Uint32Array` /
 *   `Uint16Array`) per particle attribute, sized to a fixed capacity at
 *   construction. Live particles occupy slots `[0, liveCount)`; expired
 *   slots are recycled in place by the per-frame compaction pass.
 * - **Spawn modules** — write new particles into freshly allocated slots.
 * - **Update modules** — mutate the live range each frame (forces, color
 *   blends, scale curves, drag, ...).
 * - **Death modules** — fire once per dying particle, before its slot is
 *   recycled (sub-emitters, event hooks).
 *
 * **Per-frame order in {@link update}:**
 * 1. Run every spawn module (each may emit any number of particles).
 * 2. Integrate position from velocity, rotation from rotationSpeed, and
 *    advance `elapsed` by `dt`. One inner loop, no method calls.
 * 3. Run every update module on the live range.
 * 4. Compact: scan `[0, liveCount)` forward, fire death modules on expired
 *    slots, copy survivors down to fill gaps. `liveCount` shrinks to the
 *    survivor count.
 *
 * **Coordinate space:** particle positions are LOCAL to the system. The
 * system's `getGlobalTransform()` is applied on top during rendering — both
 * the WebGL2 and WebGPU shaders multiply `projection * translation * rotated`.
 * Setting world-space positions on individual particles (e.g. `system.x +
 * offset`) double-translates because the shader translates again. Position
 * the system itself via `system.setPosition(...)` and emit relative to `(0, 0)`.
 *
 * **Capacity** is fixed at construction (default 4096). Spawn modules call
 * {@link spawn} to allocate a slot; the call returns `-1` when at capacity
 * — modules should bail cleanly in that case rather than overwriting live
 * slots.
 *
 * @example
 * const system = new ParticleSystem(loader.get(Texture, 'spark'), 8192);
 * system.addSpawnModule(new RateSpawn({ rate: new Constant(60), ... }));
 * system.addUpdateModule(new ApplyForce(0, 980));     // gravity
 * system.addUpdateModule(new ColorOverLifetime(fireGradient));
 * scene.addChild(system);
 */
export class ParticleSystem extends Drawable {
    /** Maximum particle count this system will store. Fixed at construction. */
    public readonly capacity: number;

    // SoA storage — public + readonly references, but the array contents
    // are mutable: spawn / update / death modules write into them directly.
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
    public readonly lifetime: Float32Array;    // total seconds before expiry
    public readonly textureIndex: Uint16Array; // atlas frame index (reserved; renderer uses single frame currently)

    /** Number of currently live particles. Slots `[0, liveCount)` are valid; `[liveCount, capacity)` are dead. */
    public liveCount = 0;

    private readonly _spawnModules: Array<SpawnModule> = [];
    private readonly _updateModules: Array<UpdateModule> = [];
    private readonly _deathModules: Array<DeathModule> = [];

    private _texture: Texture;
    private readonly _textureFrame: Rectangle = new Rectangle();
    private readonly _vertices: Float32Array = new Float32Array(4);
    private readonly _texCoords: Uint32Array = new Uint32Array(4);
    private _updateTexCoords = true;
    private _updateVertices = true;

    public constructor(texture: Texture, capacity: number = DEFAULT_CAPACITY) {
        super();

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

    /**
     * Quad corner offsets for the current {@link textureFrame}, in local
     * space as `[minX, minY, maxX, maxY]`. Recomputed lazily whenever
     * `textureFrame` changes. Used by the renderer to position each particle
     * sprite relative to its world position.
     */
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

    /**
     * Packed UV coordinates for the current {@link textureFrame} as four
     * `Uint32` values, each encoding a `(u, v)` pair in the upper/lower 16
     * bits (normalised to 0–65535). Vertex order respects {@link Texture.flipY}.
     * Recomputed lazily on texture or frame changes.
     */
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

    public get spawnModules(): ReadonlyArray<SpawnModule> {
        return this._spawnModules;
    }

    public get updateModules(): ReadonlyArray<UpdateModule> {
        return this._updateModules;
    }

    public get deathModules(): ReadonlyArray<DeathModule> {
        return this._deathModules;
    }

    /** Replaces the particle sprite texture and resets the texture frame to cover the new texture. */
    public setTexture(texture: Texture): this {
        if (this._texture !== texture) {
            this._texture = texture;
            this.resetTextureFrame();
        }

        return this;
    }

    /** Sets the sub-rectangle of the texture used as the particle sprite. */
    public setTextureFrame(frame: Rectangle): this {
        this._textureFrame.copy(frame);
        this._updateTexCoords = true;
        this._updateVertices = true;

        this.localBounds.set(0, 0, frame.width, frame.height);
        this._invalidateBoundsCascade();

        return this;
    }

    /** Resets the texture frame to the full dimensions of the current texture. */
    public resetTextureFrame(): this {
        return this.setTextureFrame(Rectangle.temp.set(0, 0, this._texture.width, this._texture.height));
    }

    public addSpawnModule(mod: SpawnModule): this {
        this._spawnModules.push(mod);

        return this;
    }

    public addUpdateModule(mod: UpdateModule): this {
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
     * Allocates a fresh particle slot and returns its index. Returns `-1`
     * when the system is at {@link capacity} — spawn modules should bail
     * cleanly in that case. The slot's previous data is overwritten by the
     * spawn module; only `elapsed` is reset to 0 here so a partially
     * initialised slot still expires correctly.
     */
    public spawn(): number {
        if (this.liveCount >= this.capacity) {
            return -1;
        }

        const slot = this.liveCount++;

        this.elapsed[slot] = 0;

        return slot;
    }

    /** Resets the system to zero live particles without destroying it. */
    public clearParticles(): this {
        this.liveCount = 0;

        return this;
    }

    /**
     * Advances the full simulation by one `delta` step. See class JSDoc for
     * the exact spawn → integrate → update → expire ordering.
     */
    public update(delta: Time): this {
        const dt = delta.seconds;

        // 1. Spawn.
        for (let i = 0; i < this._spawnModules.length; i++) {
            this._spawnModules[i].apply(this, dt);
        }

        // 2. Integrate position + rotation, advance lifetime. Tight inner loop.
        const { posX, posY, velX, velY, rotations, rotationSpeeds, elapsed } = this;
        const liveCount = this.liveCount;

        for (let i = 0; i < liveCount; i++) {
            posX[i] += velX[i] * dt;
            posY[i] += velY[i] * dt;
            rotations[i] += rotationSpeeds[i] * dt;
            elapsed[i] += dt;
        }

        // 3. Update modules — operate on the live range.
        for (let i = 0; i < this._updateModules.length; i++) {
            this._updateModules[i].apply(this, dt);
        }

        // 4. Compact: forward pass, fire death modules, copy survivors down.
        const lifetime = this.lifetime;
        const deathModules = this._deathModules;
        let writeIndex = 0;

        for (let readIndex = 0; readIndex < this.liveCount; readIndex++) {
            if (elapsed[readIndex] >= lifetime[readIndex]) {
                for (let m = 0; m < deathModules.length; m++) {
                    deathModules[m].onDeath(this, readIndex);
                }

                continue;
            }

            if (writeIndex !== readIndex) {
                this._copySlot(readIndex, writeIndex);
            }

            writeIndex++;
        }

        this.liveCount = writeIndex;

        return this;
    }

    public override destroy(): void {
        super.destroy();

        this.clearSpawnModules();
        this.clearUpdateModules();
        this.clearDeathModules();
        this.liveCount = 0;
        this._textureFrame.destroy();
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
