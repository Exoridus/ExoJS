import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 16, height: 8, close() {} })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(8),
        }) as Response,
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test.each(['newer', 'return', 'throw'])('a branch reparented during scope acquisition preserves the latest scope (%s)', async mode => {
  const loader = new Loader();

  materializeAssetTypes(loader, coreAssetTypes);

  const staleScope = loader.createScope();
  const newerScope = loader.createScope();
  const target = new Container();
  const newer = new Container();
  const branch = new Container();
  const first = new Texture('first.png');
  const second = new Texture('second.png');

  target._setAssetScope(staleScope);
  newer._setAssetScope(newerScope);
  branch.addChild(new Sprite(first), new Sprite(second));

  const adopt = loader._adopt.bind(loader);

  vi.spyOn(loader, '_adopt').mockImplementationOnce((...args) => {
    adopt(...args);
    newer.addChild(branch);

    if (mode === 'return') {
      target.addChild(branch);
    } else if (mode === 'throw') {
      throw new Error('stale acquisition failed');
    }
  });

  try {
    if (mode === 'throw') {
      expect(() => target.addChild(branch)).toThrow('stale acquisition failed');
    } else {
      target.addChild(branch);
    }

    await Promise.all([first.loaded, second.loaded]);

    expect(branch.parent).toBe(mode === 'return' ? target : newer);
    expect(branch._getAssetScope()).toBe(mode === 'return' ? staleScope : newerScope);
    (mode === 'return' ? newerScope : staleScope).destroy();
    expect(first.ready).toBe(true);
    expect(second.ready).toBe(true);
  } finally {
    target.destroy();
    newer.destroy();
    branch.destroy();
    loader.destroy();
  }
});

test('a child moved during scope acquisition does not skip the remaining sibling', async () => {
  const loader = new Loader();

  materializeAssetTypes(loader, coreAssetTypes);

  const oldScope = loader.createScope();
  const targetScope = loader.createScope();
  const newerScope = loader.createScope();
  const source = new Container();
  const target = new Container();
  const newer = new Container();
  const branch = new Container();
  const first = new Texture('first.png');
  const second = new Texture('second.png');
  const moving = new Sprite(first);

  source._setAssetScope(oldScope);
  target._setAssetScope(targetScope);
  newer._setAssetScope(newerScope);
  branch.addChild(moving, new Sprite(second));
  source.addChild(branch);

  try {
    await Promise.all([first.loaded, second.loaded]);

    const adopt = loader._adopt.bind(loader);

    vi.spyOn(loader, '_adopt').mockImplementationOnce((...args) => {
      adopt(...args);
      newer.addChild(moving);
    });
    target.addChild(branch);

    expect(branch.parent).toBe(target);
    expect(branch._getAssetScope()).toBe(targetScope);
    expect(moving.parent).toBe(newer);
    oldScope.destroy();
    expect(first.ready).toBe(true);
    expect(second.ready).toBe(true);
  } finally {
    source.destroy();
    target.destroy();
    newer.destroy();
    branch.destroy();
    loader.destroy();
  }
});
