import type { ParticleDeathContext } from '#ParticleStorage';
import type { ParticleSystem } from '#ParticleSystem';

import { DeathModule } from './DeathModule';
import type { SpawnModule } from './SpawnModule';

/**
 * Sub-emitter: triggers a child {@link SpawnModule} on a target system at the
 * dying particle's position. Use for explosion-on-impact, sparks at end of
 * life, multi-stage VFX.
 *
 * The child module receives a synthesized `dt` of 0 - it must spawn
 * immediately rather than rely on rate accumulation. {@link BurstSpawn}
 * works naturally; {@link RateSpawn} is the wrong fit here.
 *
 * Position is the only field taken from the dying particle - child
 * distributions decide everything else, and their sampled positions are treated
 * as offsets from the death position. To keep child particles riding the
 * parent's velocity, configure the child's velocity distribution to match, or
 * read {@link ParticleDeathContext.velocityX} in a custom death module.
 */
export class SpawnOnDeath extends DeathModule {
  public targetSystem: ParticleSystem;
  public spawner: SpawnModule;

  /** Number of times to invoke the spawner per dying particle. Default 1. */
  public count: number;

  public constructor(targetSystem: ParticleSystem, spawner: SpawnModule, count = 1) {
    super();
    this.targetSystem = targetSystem;
    this.spawner = spawner;
    this.count = count;
  }

  public override onDeath(_system: ParticleSystem, death: ParticleDeathContext): void {
    const target = this.targetSystem;

    // Which particles the spawner produced cannot be derived from the target's
    // live count: on the GPU path an emission recycles a dead slot below the
    // high-water mark, so the count can stay put while particles are added, and
    // the reused slots are scattered rather than contiguous.
    const previous = target._beginSpawnRecording();
    let spawned: readonly number[];

    try {
      for (let n = 0; n < this.count; n++) {
        this.spawner.apply(target, 0);
      }
    } finally {
      spawned = target._endSpawnRecording(previous);
    }

    target._offsetSpawned(spawned, death.x, death.y);
  }
}
