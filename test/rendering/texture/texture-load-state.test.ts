import { Texture } from '#rendering/texture/Texture';

describe('Texture load state', () => {
  test("directly constructed textures are 'ready'", () => {
    expect(new Texture(null).loadState).toBe('ready');
    expect(Texture.empty.loadState).toBe('ready');
    expect(Texture.fromColor('#fff').loadState).toBe('ready');
  });

  test('loaded resolves immediately with the texture itself when ready', async () => {
    const texture = new Texture(null);

    await expect(texture.loaded).resolves.toBe(texture);
  });

  test('internal begin/settle cycle is reflected in loadState and loaded', async () => {
    const texture = new Texture(null);

    texture._loadState.begin();
    expect(texture.loadState).toBe('loading');

    const pending = texture.loaded;

    texture._loadState.settle(texture);
    expect(texture.loadState).toBe('ready');
    await expect(pending).resolves.toBe(texture);
  });
});
