import type { ParticleSystem } from "../ParticleSystem";

import { DeathModule } from './DeathModule';
import type { SpawnModule } from './SpawnModule';

/**
 * Sub-emitter: triggers a child {@link SpawnModule} on a target system at
 * the dying particle's position. Use for explosion-on-impact, sparks at
 * end-of-life, multi-stage VFX.
 *
 * The child module receives a synthesized `dt` of 0 — it must spawn
 * immediately rather than rely on rate accumulation. {@link BurstSpawn}
 * works naturally; {@link RateSpawn} is the wrong fit here.
 *
 * Position is the only field forwarded — child distributions decide
 * everything else. To keep child particles riding the parent's velocity,
 * configure the child's velocity distribution to match.
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

  public override onDeath(parent: ParticleSystem, slot: number): void {
    const target = this.targetSystem;
    const x = parent.posX[slot];
    const y = parent.posY[slot];

    // Snapshot the target's pre-spawn count so we can apply the
    // position to whichever slots the spawner adds.
    const before = target.liveCount;

    for (let n = 0; n < this.count; n++) {
      this.spawner.apply(target, 0);
    }

    const added = target.liveCount - before;

    for (let i = 0; i < added; i++) {
      const dst = before + i;

      target.posX[dst] += x;
      target.posY[dst] += y;
    }
  }
}
