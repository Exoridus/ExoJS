import type { AssetDependencyScope } from '#assets/AssetFactory';
import { loadSoundSpriteSheet } from '#assets/factories/soundSprites';

import { factoryContext } from './factory-context';

const scopeLoading = (data: unknown): AssetDependencyScope =>
  factoryContext(undefined, { dependencies: { load: async () => data } as unknown as AssetDependencyScope }).dependencies;

describe('loadSoundSpriteSheet', () => {
  test('stores a clip named __proto__ as an ordinary own entry', async () => {
    const sheet = await loadSoundSpriteSheet('sprites.json', scopeLoading(JSON.parse('{"__proto__":{"start":0,"end":0.5}}') as unknown));

    expect(Object.keys(sheet)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(sheet)).toBe(Object.prototype);
    expect(sheet['__proto__']).toEqual({ start: 0, end: 0.5 });
  });
});
