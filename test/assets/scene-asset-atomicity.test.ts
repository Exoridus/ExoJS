import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';
import type { Stage } from '#core/Stage';
import { materializeAssetTypes } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

const loaders: Loader[] = [];
const roots: Container[] = [];

const loader = (): Loader => {
  const result = new Loader();

  materializeAssetTypes(result, coreAssetTypes);
  loaders.push(result);

  return result;
};

const root = (scope: LoaderScope | null): Container => {
  const result = new Container();

  result._setAssetScope(scope);
  roots.push(result);

  return result;
};

const stage = (): Stage => ({
  interaction: {
    _notifyNodeAdded() {},
    _notifyNodeRemoved() {},
    _notifyInteractiveChanged() {},
    _notifyBoundsInvalidated() {},
    _notifyTransformGroupMoved() {},
  },
  focus: { focused: null, focus() {}, blur() {}, _notifyNodeRemoved() {} },
});

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
  for (const container of roots.splice(0)) {
    container.destroy();
  }

  for (const owner of loaders.splice(0)) {
    owner.destroy();
  }

  vi.unstubAllGlobals();
});

describe('scene asset mutations', () => {
  test('a rejected texture replacement leaves texture, geometry and the original claim unchanged', async () => {
    const a = loader();
    const b = loader();
    const parent = root(a.createScope());
    const original = new Texture('original.png');
    const foreign = new Texture('foreign.png');
    const sprite = new Sprite(original);

    parent.addChild(sprite);
    await Promise.all([original.loaded, b.createScope().loadGroup(foreign)]);
    sprite.setScale(2, 3).setAnchor(0.5);

    const owners = a.inspect().map(row => row.owners);
    const frame = [sprite.textureFrame.x, sprite.textureFrame.y, sprite.textureFrame.width, sprite.textureFrame.height];
    const origin = { x: sprite.origin.x, y: sprite.origin.y };

    expect(() => sprite.setTexture(foreign)).toThrow(/already belongs to another loader/);
    expect(sprite.texture === original).toBe(true);
    expect([sprite.textureFrame.x, sprite.textureFrame.y, sprite.textureFrame.width, sprite.textureFrame.height]).toEqual(frame);
    expect(sprite.origin.x).toBe(origin.x);
    expect(sprite.origin.y).toBe(origin.y);
    expect(sprite.scale.x).toBe(2);
    expect(sprite.scale.y).toBe(3);
    expect(a.inspect().map(row => row.owners)).toEqual(owners);
    expect(original.ready).toBe(true);
  });

  test('a foreign child is rejected before parent, stage or claims change', async () => {
    const a = loader();
    const b = loader();
    const parent = root(a.createScope());
    const foreign = new Texture('foreign.png');
    const sprite = new Sprite(foreign);

    parent._setStage(stage());
    await b.createScope().loadGroup(foreign);

    expect(() => parent.addChild(sprite)).toThrow(/already belongs to another loader/);
    expect(parent.children).toHaveLength(0);
    expect(sprite.parent).toBeNull();
    expect(sprite._getStage()).toBeNull();
    expect(a.inspect()).toHaveLength(0);
    sprite.destroy();
  });

  test('a rejected reparent keeps the old parent, stage and claim', async () => {
    const a = loader();
    const b = loader();
    const source = root(a.createScope());
    const target = root(b.createScope());
    const originalStage = stage();
    const sprite = new Sprite('owned.png');

    source._setStage(originalStage);
    target._setStage(stage());
    source.addChild(sprite);
    await (sprite.texture as Texture).loaded;

    const owners = a.inspect().map(row => row.owners);

    expect(() => target.addChild(sprite)).toThrow(/already belongs to another loader/);
    expect(source.children).toHaveLength(1);
    expect(source.children[0] === sprite).toBe(true);
    expect(target.children).toHaveLength(0);
    expect(sprite.parent === source).toBe(true);
    expect(sprite._getStage() === originalStage).toBe(true);
    expect(a.inspect().map(row => row.owners)).toEqual(owners);
    expect(b.inspect()).toHaveLength(0);
  });

  test('a rejected subtree does not acquire earlier siblings or bind their fresh handles', async () => {
    const a = loader();
    const b = loader();
    const parent = root(a.createScope());
    const branch = root(null);
    const fresh = new Texture('fresh.png');
    const foreign = new Texture('foreign.png');

    branch.addChild(new Sprite(fresh), new Sprite(foreign));
    await b.createScope().loadGroup(foreign);

    expect(() => parent.addChild(branch)).toThrow(/already belongs to another loader/);
    expect(parent.children).toHaveLength(0);
    expect(branch.parent).toBeNull();
    expect(branch._getAssetScope()).toBeNull();
    expect(a.inspect()).toHaveLength(0);
    expect(fresh.loadState).toBe('idle');
    await expect(b.createScope().loadGroup(fresh)).resolves.toBe(fresh);
  });

  test('a successful same-source replacement retains residency and the new claim', async () => {
    const a = loader();
    const parent = root(a.createScope());
    const first = new Texture('shared.png');
    const second = new Texture('shared.png');
    const sprite = new Sprite(first);

    parent.addChild(sprite);
    await first.loaded;
    sprite.setTexture(second);
    await second.loaded;

    expect(sprite.texture).toBe(second);
    expect(second.source).toBe(first.source);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a.inspect()[0]!.owners).toHaveLength(1);
  });

  test('an exception during attach restores the original tree and resident asset', async () => {
    const a = loader();
    const source = root(a.createScope());
    const target = root(a.createScope());
    const originalStage = stage();
    const failingStage = stage();
    const sprite = new Sprite('owned.png');

    source._setStage(originalStage);
    target._setStage(failingStage);
    source.addChild(sprite);
    await (sprite.texture as Texture).loaded;

    failingStage.interaction._notifyNodeAdded = () => {
      throw new Error('attach failed');
    };

    expect(() => target.addChild(sprite)).toThrow('attach failed');
    expect(source.children).toHaveLength(1);
    expect(source.children[0] === sprite).toBe(true);
    expect(target.children).toHaveLength(0);
    expect(sprite.parent === source).toBe(true);
    expect(sprite._getStage() === originalStage).toBe(true);
    expect((sprite.texture as Texture).ready).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('a texture swap reentered during acquisition keeps the newer swap and releases abandoned claims', async () => {
    const a = loader();
    const parent = root(a.createScope());
    const sprite = new Sprite('original.png');

    parent.addChild(sprite);
    await (sprite.texture as Texture).loaded;

    const replacement = new Texture('replacement.png');
    const newer = new Texture('newer.png');
    let reentered = false;

    const adopt = a._adopt.bind(a);

    vi.spyOn(a, '_adopt').mockImplementationOnce((...args) => {
      adopt(...args);
      reentered = true;
      sprite.setTexture(newer);
    });
    sprite.setTexture(replacement);
    await newer.loaded;

    expect(reentered).toBe(true);
    expect(sprite.texture).toBe(newer);
    expect(a.inspect().filter(row => row.owners.length > 0)).toHaveLength(1);
  });

  test('destruction during acquisition leaves no published texture or claim behind', async () => {
    const a = loader();
    const parent = root(a.createScope());
    const sprite = new Sprite('original.png');

    parent.addChild(sprite);
    await (sprite.texture as Texture).loaded;

    const adopt = a._adopt.bind(a);

    vi.spyOn(a, '_adopt').mockImplementationOnce((...args) => {
      adopt(...args);
      sprite.destroy();
    });
    sprite.setTexture(new Texture('replacement.png'));

    expect(sprite.destroyed).toBe(true);
    expect(sprite.texture).toBeNull();
    expect(parent.children).toHaveLength(0);
    expect(a.inspect().filter(row => row.owners.length > 0)).toHaveLength(0);
  });
});
