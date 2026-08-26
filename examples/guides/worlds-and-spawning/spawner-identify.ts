import { Container } from '@codexo/exojs';
import { MapObjectSpawner } from '@codexo/exojs-tilemap';

// #region guide:custom-identify
class Enemy extends Container {}

export const eliteAware = new MapObjectSpawner<void, Enemy>(
  { 'Enemy:elite': () => new Enemy() },
  { identify: object => `${object.kind}:${String(object.properties.variant)}` },
);
// #endregion guide:custom-identify
