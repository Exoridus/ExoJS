import { type ParticleSystem, SpawnModule, SpawnOnDeath } from '@codexo/exojs-particles';

declare const system: ParticleSystem;
declare const childSystem: ParticleSystem;
declare const childBurst: SpawnModule;

// #region guide:spawn-on-death
system.addDeathModule(
  new SpawnOnDeath(
    childSystem, // target ParticleSystem
    childBurst, // SpawnModule that spawns into childSystem
    3, // spawn childBurst.apply(...) this many times
  ),
);
// #endregion guide:spawn-on-death
