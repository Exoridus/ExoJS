import { Container } from '@codexo/exojs';
import { MapObjectSpawner } from '@codexo/exojs-tilemap';

// #region guide:unknown-error
class Enemy extends Container {}

export const strict = new MapObjectSpawner<void, Enemy>({ Enemy: () => new Enemy() }, { unknown: 'error' });
// #endregion guide:unknown-error
