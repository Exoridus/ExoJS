export { SpawnModule } from './SpawnModule';
export { UpdateModule } from './UpdateModule';
export { DeathModule } from './DeathModule';
export type { WgslContribution, WgslPrimitive, WgslUniformField, WgslTextureBinding } from './WgslContribution';
export { wgslUniformByteSize, wgslFieldLayout } from './WgslContribution';

export { RateSpawn } from './RateSpawn';
export type { RateSpawnConfig } from './RateSpawn';
export { BurstSpawn } from './BurstSpawn';
export type { BurstSpawnConfig, BurstSchedule } from './BurstSpawn';

export { ApplyForce } from './ApplyForce';
export { Drag } from './Drag';
export { ColorOverLifetime } from './ColorOverLifetime';
export { ColorOverSpeed } from './ColorOverSpeed';
export { ScaleOverLifetime } from './ScaleOverLifetime';
export { RotateOverLifetime } from './RotateOverLifetime';
export { AlphaFadeOverLifetime } from './AlphaFadeOverLifetime';
export { VelocityOverLifetime } from './VelocityOverLifetime';
export { AttractToPoint } from './AttractToPoint';
export { RepelFromPoint } from './RepelFromPoint';
export { OrbitalForce } from './OrbitalForce';
export { Turbulence } from './Turbulence';

export { SpawnOnDeath } from './SpawnOnDeath';
