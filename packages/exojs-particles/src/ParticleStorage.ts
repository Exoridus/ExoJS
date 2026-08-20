/**
 * A two-component particle channel, one array per component.
 *
 * The arrays are the simulation's own storage rather than a copy: writing
 * `position.x[i]` moves particle `i`. Their length is the system's capacity, so
 * only indices below {@link ParticleBatch.count} carry meaning.
 */
export interface ParticleVectorChannel {
  readonly x: Float32Array;
  readonly y: Float32Array;
}

/** The rotation channel: current angle and the speed integrated into it each frame. */
export interface ParticleRotationChannel {
  readonly angle: Float32Array;
  readonly speed: Float32Array;
}

/** The timing channel: seconds since spawn, and total seconds before expiry. */
export interface ParticleTimingChannel {
  readonly elapsed: Float32Array;
  readonly lifetime: Float32Array;
}

/**
 * The live particles of one system, addressed by semantic channel.
 *
 * This is the bulk surface an {@link UpdateModule} and a
 * {@link ParticleRenderMode} operate on. Channels are named for what they mean;
 * how they are packed - one array per component today, something else tomorrow -
 * is the simulation's business and may change. A loop reads the channel it needs
 * once and then indexes plain typed arrays, so naming costs nothing per particle.
 *
 * Indices `[0, count)` are the range worth visiting. A batch can contain dead
 * slots, so a loop that must not touch them checks {@link isAlive}; a purely
 * arithmetic pass over dead slots is harmless and can skip the check.
 */
export interface ParticleBatch {
  /** Upper bound of the range that can hold live particles. */
  readonly count: number;
  /** Fixed number of slots this system can ever hold. */
  readonly capacity: number;
  readonly position: ParticleVectorChannel;
  readonly velocity: ParticleVectorChannel;
  readonly scale: ParticleVectorChannel;
  readonly rotation: ParticleRotationChannel;
  readonly timing: ParticleTimingChannel;
  /** Packed `0xAABBGGRR` tint, one entry per slot. */
  readonly color: Uint32Array;
  /** Atlas frame selector, one entry per slot. Anything that is not a declared frame index shows frame 0. */
  readonly frame: Uint16Array;
  /** Whether the slot at `index` currently holds a live particle. */
  isAlive(index: number): boolean;
}

/** Writable two-component channel of a single particle. */
export interface ParticleVectorWriter {
  x: number;
  y: number;
  set(x: number, y: number): void;
}

/**
 * A single freshly emitted particle, addressed by name.
 *
 * Every field starts at its default - zero position, velocity, rotation and
 * rotation speed, unit scale, opaque white, frame 0, lifetime 1 - so a spawner
 * writes only what it varies.
 *
 * The writer is a cursor onto the emitting system, not a particle object: it is
 * reused by the next {@link ParticleEmitter.emit} call and must not be kept.
 * Read what you need before emitting again.
 */
export interface ParticleWriter {
  readonly position: ParticleVectorWriter;
  readonly velocity: ParticleVectorWriter;
  readonly scale: ParticleVectorWriter;
  rotation: number;
  rotationSpeed: number;
  /** Packed `0xAABBGGRR` tint. */
  color: number;
  /** Total seconds before this particle expires. */
  lifetime: number;
  /** Atlas frame index. Ignored by a system that declares no frames. */
  frame: number;
}

/**
 * The emitting face of a particle system: the only supported way to bring
 * particles into existence.
 *
 * Emission is the one per-particle write that is true on every backend, because
 * spawn values always originate on the CPU and are uploaded from there.
 */
export interface ParticleEmitter {
  /** Emits one particle at its default values, or returns `null` when the system is at capacity. */
  emit(): ParticleWriter | null;
}

/**
 * The state of one particle at the moment it expired.
 *
 * A snapshot, not a view: it is copied out of the simulation when the particle
 * dies and stays valid for the whole callback, whichever backend ran the
 * simulation and whether or not the slot has already been reused. It carries no
 * slot index for that reason - there is nothing to read back afterwards.
 */
export interface ParticleDeathContext {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Packed `0xAABBGGRR` tint at death. */
  readonly color: number;
  /** Seconds the particle lived. */
  readonly elapsed: number;
  /** Lifetime the particle was spawned with. */
  readonly lifetime: number;
}

/**
 * The simulation's own storage: one typed array per channel, sized to capacity
 * once and never reallocated.
 *
 * Implements {@link ParticleBatch}, which is the face handed to modules and
 * render modes. Nothing outside the simulation gets the object itself.
 * @internal
 */
export class ParticleStorage implements ParticleBatch {
  public readonly capacity: number;

  public readonly posX: Float32Array;
  public readonly posY: Float32Array;
  public readonly velX: Float32Array;
  public readonly velY: Float32Array;
  public readonly scaleX: Float32Array;
  public readonly scaleY: Float32Array;
  public readonly rotations: Float32Array;
  public readonly rotationSpeeds: Float32Array;
  public readonly color: Uint32Array;
  public readonly elapsed: Float32Array;
  public readonly lifetime: Float32Array;
  public readonly frame: Uint16Array;
  public readonly alive: Uint8Array;

  public readonly position: ParticleVectorChannel;
  public readonly velocity: ParticleVectorChannel;
  public readonly scale: ParticleVectorChannel;
  public readonly rotation: ParticleRotationChannel;
  public readonly timing: ParticleTimingChannel;

  /** Upper bound of the range that can hold live particles. Owned by the system. */
  public count = 0;

  public constructor(capacity: number) {
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
    this.frame = new Uint16Array(capacity);
    this.alive = new Uint8Array(capacity);

    this.position = { x: this.posX, y: this.posY };
    this.velocity = { x: this.velX, y: this.velY };
    this.scale = { x: this.scaleX, y: this.scaleY };
    this.rotation = { angle: this.rotations, speed: this.rotationSpeeds };
    this.timing = { elapsed: this.elapsed, lifetime: this.lifetime };
  }

  public isAlive(index: number): boolean {
    return this.alive[index] === 1;
  }

  /** Resets one slot to the spawn defaults every writer starts from. */
  public reset(slot: number): void {
    this.posX[slot] = 0;
    this.posY[slot] = 0;
    this.velX[slot] = 0;
    this.velY[slot] = 0;
    this.scaleX[slot] = 1;
    this.scaleY[slot] = 1;
    this.rotations[slot] = 0;
    this.rotationSpeeds[slot] = 0;
    this.color[slot] = 0xffffffff;
    this.elapsed[slot] = 0;
    this.lifetime[slot] = 1;
    this.frame[slot] = 0;
  }

  /** Copies every channel of `from` onto `to`, for the CPU compaction pass. */
  public copySlot(from: number, to: number): void {
    this.posX[to] = this.posX[from]!;
    this.posY[to] = this.posY[from]!;
    this.velX[to] = this.velX[from]!;
    this.velY[to] = this.velY[from]!;
    this.scaleX[to] = this.scaleX[from]!;
    this.scaleY[to] = this.scaleY[from]!;
    this.rotations[to] = this.rotations[from]!;
    this.rotationSpeeds[to] = this.rotationSpeeds[from]!;
    this.color[to] = this.color[from]!;
    this.elapsed[to] = this.elapsed[from]!;
    this.lifetime[to] = this.lifetime[from]!;
    this.frame[to] = this.frame[from]!;
  }

  /** Snapshots one slot for a death callback. */
  public snapshot(slot: number): ParticleDeathContext {
    return {
      x: this.posX[slot]!,
      y: this.posY[slot]!,
      velocityX: this.velX[slot]!,
      velocityY: this.velY[slot]!,
      rotation: this.rotations[slot]!,
      scaleX: this.scaleX[slot]!,
      scaleY: this.scaleY[slot]!,
      color: this.color[slot]!,
      elapsed: this.elapsed[slot]!,
      lifetime: this.lifetime[slot]!,
    };
  }
}

/** Cursor implementation of {@link ParticleWriter}, rebound to a slot by each emit. @internal */
export class ParticleSlotWriter implements ParticleWriter {
  public readonly position: ParticleVectorWriter;
  public readonly velocity: ParticleVectorWriter;
  public readonly scale: ParticleVectorWriter;

  private readonly _storage: ParticleStorage;
  private _slot = 0;

  public constructor(storage: ParticleStorage) {
    this._storage = storage;

    const slotOf = this._currentSlot.bind(this);

    this.position = createVectorWriter(storage.posX, storage.posY, slotOf);
    this.velocity = createVectorWriter(storage.velX, storage.velY, slotOf);
    this.scale = createVectorWriter(storage.scaleX, storage.scaleY, slotOf);
  }

  /** The slot this cursor currently writes to. Used by the emitter to track what a spawner produced. @internal */
  public get slot(): number {
    return this._slot;
  }

  public bind(slot: number): this {
    this._slot = slot;

    return this;
  }

  /**
   * Marks this writer as belonging to a finished emission. Development builds
   * hand out one writer per emission and retire the previous one here, so
   * writing through a stale writer fails loudly instead of silently filling
   * whatever particle was emitted since.
   * @internal
   */
  public retire(): void {
    this._retired = true;
  }

  private _retired = false;

  /** Resolves the bound slot, refusing a writer a later emission has taken over. */
  private _currentSlot(): number {
    if (this._retired) {
      throw new Error('ParticleWriter: this writer belongs to an earlier emit(). Fill each emitted particle before emitting the next one.');
    }

    return this._slot;
  }

  public get rotation(): number {
    return this._storage.rotations[this._currentSlot()]!;
  }

  public set rotation(value: number) {
    this._storage.rotations[this._currentSlot()] = value;
  }

  public get rotationSpeed(): number {
    return this._storage.rotationSpeeds[this._currentSlot()]!;
  }

  public set rotationSpeed(value: number) {
    this._storage.rotationSpeeds[this._currentSlot()] = value;
  }

  public get color(): number {
    return this._storage.color[this._currentSlot()]!;
  }

  public set color(value: number) {
    this._storage.color[this._currentSlot()] = value;
  }

  public get lifetime(): number {
    return this._storage.lifetime[this._currentSlot()]!;
  }

  public set lifetime(value: number) {
    this._storage.lifetime[this._currentSlot()] = value;
  }

  public get frame(): number {
    return this._storage.frame[this._currentSlot()]!;
  }

  public set frame(value: number) {
    this._storage.frame[this._currentSlot()] = value | 0;
  }
}

function createVectorWriter(xs: Float32Array, ys: Float32Array, slotOf: () => number): ParticleVectorWriter {
  return {
    get x(): number {
      return xs[slotOf()]!;
    },
    set x(value: number) {
      xs[slotOf()] = value;
    },
    get y(): number {
      return ys[slotOf()]!;
    },
    set y(value: number) {
      ys[slotOf()] = value;
    },
    set(x: number, y: number): void {
      const slot = slotOf();

      xs[slot] = x;
      ys[slot] = y;
    },
  };
}
