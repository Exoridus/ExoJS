import { WebStorageStore } from '@codexo/exojs';

// #region guide:key-value-store
const saves = new WebStorageStore(localStorage, { prefix: 'my-game:' });

await saves.set('slot-1', {
  level: 4,
  score: 12800,
  options: { music: true, sfx: false },
});

const slot = await saves.get('slot-1'); // object | null
await saves.delete('slot-1');
// #endregion guide:key-value-store
