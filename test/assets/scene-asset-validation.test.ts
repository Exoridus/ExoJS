import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';
import { materializeAssetTypes } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

const roots: Container[] = [];
const loaders: Loader[] = [];

const loader = (): Loader => {
  const result = new Loader();

  materializeAssetTypes(result, coreAssetTypes);
  loaders.push(result);

  return result;
};

const root = (scope: LoaderScope | null = null): Container => {
  const result = new Container();

  result._setAssetScope(scope);
  roots.push(result);

  return result;
};

const chain = (depth: number): Container => {
  let branch = new Container();

  for (let index = 1; index < depth; index++) {
    const parent = new Container();

    parent.addChild(branch);
    branch = parent;
  }

  roots.push(branch);

  return branch;
};

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 16, height: 8, close() {} })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }) as Response),
  );
});

afterEach(() => {
  vi.restoreAllMocks();

  for (const node of roots.splice(0)) {
    node.destroy();
  }

  for (const owner of loaders.splice(0)) {
    owner.destroy();
  }

  vi.unstubAllGlobals();
});

describe('asset scope validation traversal', () => {
  test.each([8, 16, 32])('direct scope assignment validates a depth-%i subtree once', depth => {
    const scope = loader().createScope();
    const branch = chain(depth);
    const validate = vi.spyOn(Container.prototype, '_validateAssetScope');

    branch._setAssetScope(scope);

    expect(validate).toHaveBeenCalledTimes(depth);
    expect(branch._getAssetScope()).toBe(scope);
  });

  test.each([8, 16, 32])('attachment validates a depth-%i subtree in at most two linear passes', depth => {
    const target = root(loader().createScope());
    const branch = chain(depth);
    const validate = vi.spyOn(Container.prototype, '_validateAssetScope');

    target.addChild(branch);

    expect(validate.mock.calls.length).toBeLessThanOrEqual(depth * 2);
    expect(branch.parent).toBe(target);
    expect(branch._getAssetScope()).toBe(target._getAssetScope());
  });

  test.each(['shared', 'unscoped'])('a %s-scope move does not validate descendants', mode => {
    const scope = mode === 'shared' ? loader().createScope() : null;
    const source = root(scope);
    const target = root(scope);
    const branch = chain(32);

    source.addChild(branch);
    const validate = vi.spyOn(branch.children[0]!, '_validateAssetScope');

    target.addChild(branch);

    expect(validate).not.toHaveBeenCalled();
    expect(branch.parent).toBe(target);
    expect(branch._getAssetScope()).toBe(scope);
  });

  test('clearing a scope releases its descendants without ownership validation walks', () => {
    const branch = chain(32);

    branch._setAssetScope(loader().createScope());
    const validate = vi.spyOn(branch.children[0]!, '_validateAssetScope');

    branch._setAssetScope(null);

    expect(validate).not.toHaveBeenCalled();
    expect(branch._getAssetScope()).toBeNull();
  });
});

describe('scope preflight boundaries', () => {
  test('a direct scope entry rejects every foreign descendant before binding a fresh sibling', async () => {
    const a = loader();
    const b = loader();
    const foreign = new Texture('foreign.png');
    const fresh = new Texture('fresh.png');
    const branch = root();
    const nested = new Container();

    await b.createScope().loadGroup(foreign);
    nested.addChild(new Sprite(fresh), new Sprite(foreign));
    branch.addChild(nested);

    expect(() => branch._setAssetScope(a.createScope())).toThrow(/already belongs to another loader/);
    expect(branch._getAssetScope()).toBeNull();
    expect(nested._getAssetScope()).toBeNull();
    expect(a.inspect()).toHaveLength(0);
    await expect(b.createScope().loadGroup(fresh)).resolves.toBe(fresh);
  });

  test('a nested independent scope entry still preflights its whole subtree', async () => {
    const a = loader();
    const b = loader();
    const scope = a.createScope();
    const foreign = new Texture('foreign.png');
    const fresh = new Texture('fresh.png');
    const independent = root();
    const branch = root();
    const trigger = new Texture('trigger.png');

    await b.createScope().loadGroup(foreign);
    independent.addChild(new Sprite(fresh), new Sprite(foreign));
    branch.addChild(new Sprite(trigger));
    const adopt = a._adopt.bind(a);

    vi.spyOn(a, '_adopt').mockImplementationOnce((...args) => {
      adopt(...args);
      expect(() => independent._setAssetScope(scope)).toThrow(/already belongs to another loader/);
      expect(independent._getAssetScope()).toBeNull();
    });

    branch._setAssetScope(scope);
    await trigger.loaded;
    await expect(b.createScope().loadGroup(fresh)).resolves.toBe(fresh);
  });

  test.each(['insert', 'texture'])('an earlier acquisition cannot lend stale preflight after a later subtree %s', async mode => {
    const a = loader();
    const b = loader();
    const foreign = new Texture('foreign.png');
    const fresh = new Texture('fresh.png');
    const branch = root();
    const later = new Container();
    const replacement = new Sprite();

    await b.createScope().loadGroup(foreign);
    later.addChild(new Sprite(fresh), replacement);
    branch.addChild(new Sprite('trigger.png'), later);
    const adopt = a._adopt.bind(a);

    vi.spyOn(a, '_adopt').mockImplementationOnce((...args) => {
      adopt(...args);

      if (mode === 'insert') {
        later.addChild(new Sprite(foreign));
      } else {
        replacement.setTexture(foreign);
      }
    });

    expect(() => branch._setAssetScope(a.createScope())).toThrow(/already belongs to another loader/);
    expect(branch._getAssetScope()).toBeNull();
    expect(later._getAssetScope()).toBeNull();
    await expect(b.createScope().loadGroup(fresh)).resolves.toBe(fresh);
  });

  test('an external first claim invalidates preflight without changing the later subtree', async () => {
    const a = loader();
    const b = loader();
    const fresh = new Texture('fresh.png');
    const newlyForeign = new Texture('newly-foreign.png');
    const branch = root();
    const later = new Container();

    later.addChild(new Sprite(fresh), new Sprite(newlyForeign));
    branch.addChild(new Sprite('trigger.png'), later);
    const adopt = a._adopt.bind(a);

    vi.spyOn(a, '_adopt').mockImplementationOnce((...args) => {
      adopt(...args);
      const content = later._contentRevision;

      b.createScope().get(newlyForeign._pathAsset()!);
      expect(later._contentRevision).toBe(content);
    });

    expect(() => branch._setAssetScope(a.createScope())).toThrow(/already belongs to another loader/);
    expect(branch._getAssetScope()).toBeNull();
    expect(later._getAssetScope()).toBeNull();
    await newlyForeign.loaded;
    await expect(b.createScope().loadGroup(fresh)).resolves.toBe(fresh);
  });

  test('a same-scope reparent during propagation rejects foreign descendants before unlinking', async () => {
    const a = loader();
    const b = loader();
    const scope = a.createScope();
    const source = root();
    const target = root(scope);
    const branch = root();
    const later = new Texture('later.png');

    branch.addChild(new Sprite('trigger.png'), new Sprite(later));
    source.addChild(branch);
    const adopt = a._adopt.bind(a);

    vi.spyOn(a, '_adopt').mockImplementationOnce((...args) => {
      adopt(...args);
      b.createScope().get(later._pathAsset()!);
      target.addChild(branch);
    });

    expect(() => branch._setAssetScope(scope)).toThrow(/already belongs to another loader/);
    expect(branch.parent).toBe(source);
    expect(source.children).toEqual([branch]);
    expect(target.children).toHaveLength(0);
    expect(branch._getAssetScope()).toBeNull();
    await later.loaded;
  });

  test('an accepted same-scope reparent survives a stale outer acquisition failure', async () => {
    const a = loader();
    const scope = a.createScope();
    const source = root(scope);
    const target = root(scope);
    const branch = root();
    const first = new Texture('first.png');
    const later = new Texture('later.png');

    branch.addChild(new Sprite(first), new Sprite(later));
    const adopt = a._adopt.bind(a);

    vi.spyOn(a, '_adopt').mockImplementationOnce((...args) => {
      adopt(...args);
      target.addChild(branch);

      throw new Error('stale acquisition failed');
    });

    expect(() => source.addChild(branch)).toThrow('stale acquisition failed');
    expect(branch.parent).toBe(target);
    expect(source.children).toHaveLength(0);
    expect(target.children).toEqual([branch]);
    expect(branch._getAssetScope()).toBe(scope);
    await Promise.all([first.loaded, later.loaded]);
    expect(first.ready).toBe(true);
    expect(later.ready).toBe(true);
  });

  test('forward propagation retains subclass scope hooks', () => {
    const scope = loader().createScope();
    const calls: Array<LoaderScope | null> = [];

    class ObservingContainer extends Container {
      public override _setAssetScope(next: LoaderScope | null): void {
        calls.push(next);
        super._setAssetScope(next);
      }
    }

    const branch = root();
    const child = new ObservingContainer();

    branch.addChild(child);
    calls.length = 0;
    branch._setAssetScope(scope);

    expect(calls).toEqual([scope]);
    expect(child._getAssetScope()).toBe(scope);
  });
});
