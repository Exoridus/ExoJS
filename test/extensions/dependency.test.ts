import { describe, expect, it } from 'vitest';

import type { Extension, RendererBinding } from '#extensions/Extension';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildSnapshot, EMPTY_SNAPSHOT } from '#extensions/snapshot';
import { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { DrawableConstructor } from '#rendering/Renderer';
import { RendererRegistry } from '#rendering/RendererRegistry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class FakeDrawable extends Drawable {}

const extension = (id: string, deps?: readonly Extension[]): Extension => (deps ? { id, dependencies: deps } : { id });

/**
 * A dependency cycle can only be wired after every node exists, which
 * `Extension.dependencies` being readonly forbids.
 */
interface CycleNode {
  id: string;
  dependencies?: Extension[];
}

const createStubBackend = (): RenderBackend => {
  const registry = new RendererRegistry<RenderBackend>();
  return {
    backendType: RenderBackendType.WebGl2,
    rendererRegistry: registry,
    view: null as never,
    renderTarget: null as never,
    stats: null as never,
    initialize: () => Promise.resolve(),
    resetStats: () => undefined,
    clear: () => undefined,
    resize: () => undefined,
    setView: () => undefined,
    setRenderTarget: () => undefined,
    pushScissorRect: () => undefined,
    popScissorRect: () => undefined,
    pushStencilClip: () => undefined,
    popStencilClip: () => undefined,
    acquireRenderTexture: () => undefined,
    releaseRenderTexture: () => undefined,
    composeWithAlphaMask: () => undefined,
    draw: () => undefined,
    execute: () => undefined,
    flush: () => undefined,
    destroy: () => undefined,
  } as unknown as RenderBackend;
};

const ids = (snapshot: ReturnType<typeof buildSnapshot>): string[] => {
  return snapshot.extensions.map(e => e.id);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Extension dependency graph', () => {
  // -- basic ordering -------------------------------------------------------

  describe('basic ordering', () => {
    it('dependency materialised before dependent', () => {
      const dep = extension('dep');
      const root = extension('root', [dep]);
      const result = buildSnapshot([root]);
      expect(ids(result)).toEqual(['dep', 'root']);
    });

    it('nested dependencies', () => {
      const leaf = extension('leaf');
      const mid = extension('mid', [leaf]);
      const root = extension('root', [mid]);
      const result = buildSnapshot([root]);
      expect(ids(result)).toEqual(['leaf', 'mid', 'root']);
    });

    it('multiple unrelated roots preserve caller order', () => {
      const depC = extension('C');
      const A = extension('A', [depC]);
      const depD = extension('D');
      const B = extension('B', [depD]);
      const result = buildSnapshot([A, B]);
      expect(ids(result)).toEqual(['C', 'A', 'D', 'B']);
    });

    it('dependency supplied after dependent in input list', () => {
      const dep = extension('dep');
      const root = extension('root', [dep]);
      const result = buildSnapshot([root, dep]);
      expect(ids(result)).toEqual(['dep', 'root']);
    });

    it('dependency supplied before dependent in input list', () => {
      const dep = extension('dep');
      const root = extension('root', [dep]);
      const result = buildSnapshot([dep, root]);
      expect(ids(result)).toEqual(['dep', 'root']);
    });
  });

  // -- deduplication --------------------------------------------------------

  describe('deduplication', () => {
    it('same dependency reached twice — deduped', () => {
      const dep = extension('dep');
      const A = extension('A', [dep]);
      const B = extension('B', [dep]);
      const result = buildSnapshot([A, B]);
      expect(ids(result)).toEqual(['dep', 'A', 'B']);
    });

    it('diamond graph — shared dep materialised once', () => {
      const top = extension('top');
      const common = extension('common', [top]);
      const left = extension('left', [common]);
      const right = extension('right', [common]);
      const result = buildSnapshot([left, right]);
      expect(ids(result)).toEqual(['top', 'common', 'left', 'right']);
    });

    it('explicit dependency also listed as root', () => {
      const dep = extension('dep');
      const root = extension('root', [dep]);
      const result = buildSnapshot([root, dep]);
      expect(ids(result)).toEqual(['dep', 'root']);
    });
  });

  // -- ID conflicts ---------------------------------------------------------

  describe('ID conflicts', () => {
    it('direct same-ID/different-object roots', () => {
      const a1 = extension('A');
      const a2 = extension('A');
      expect(() => buildSnapshot([a1, a2])).toThrow('Extension "A" was provided by multiple descriptor objects.');
    });

    it('nested same-ID/different-object — rejected on entry', () => {
      const a2 = extension('A');
      const a1: Extension = { id: 'A', dependencies: [a2] };
      expect(() => buildSnapshot([a1])).toThrow('Extension "A" was provided by multiple descriptor objects.');
    });

    it('nested same-ID/different-object caught before any binding materialisation', () => {
      // Even though neither has bindings, the error must throw before any
      // extension is added to the ordered list.
      const a2 = extension('A');
      const a1: Extension = { id: 'A', dependencies: [a2] };
      expect(() => buildSnapshot([a1])).toThrow();
    });

    it('same-ID/different-object through two dependency branches', () => {
      const shared = extension('shared');
      const altShared = extension('shared');
      const A = extension('A', [shared]);
      const B = extension('B', [altShared]);
      expect(() => buildSnapshot([A, B])).toThrow('Extension "shared" was provided by multiple descriptor objects.');
    });

    it('same-ID/same-object always deduped (roots)', () => {
      const ext = extension('same');
      const result = buildSnapshot([ext, ext]);
      expect(ids(result)).toEqual(['same']);
    });

    it('same-ID/same-object always deduped (dependency + root)', () => {
      const dep = extension('same');
      const root = extension('root', [dep]);
      const result = buildSnapshot([root, dep]);
      expect(ids(result)).toEqual(['same', 'root']);
    });
  });

  // -- cycles ---------------------------------------------------------------

  describe('cycles', () => {
    it('self-cycle', () => {
      const a: CycleNode = { id: 'A' };
      a.dependencies = [a];
      expect(() => buildSnapshot([a])).toThrow('Extension dependency cycle detected: A → A');
    });

    it('two-node cycle', () => {
      const a: CycleNode = { id: 'A', dependencies: [] };
      const b: CycleNode = { id: 'B', dependencies: [] };
      a.dependencies = [b];
      b.dependencies = [a];
      expect(() => buildSnapshot([a])).toThrow('Extension dependency cycle detected: A → B → A');
    });

    it('three-node cycle', () => {
      const a: CycleNode = { id: 'A', dependencies: [] };
      const b: CycleNode = { id: 'B', dependencies: [] };
      const c: CycleNode = { id: 'C', dependencies: [] };
      a.dependencies = [b];
      b.dependencies = [c];
      c.dependencies = [a];
      expect(() => buildSnapshot([a])).toThrow('Extension dependency cycle detected: A → B → C → A');
    });

    it('cycle error includes complete path with repeated start at end', () => {
      // D -> B -> C -> D
      const d: CycleNode = { id: 'D', dependencies: [] };
      const b: CycleNode = { id: 'B', dependencies: [] };
      const c: CycleNode = { id: 'C', dependencies: [] };
      d.dependencies = [b];
      b.dependencies = [c];
      c.dependencies = [d];

      let error: Error | undefined;
      try {
        buildSnapshot([d]);
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeDefined();
      expect(error!.message).toContain('D → B → C → D');
    });

    it('cycle below an acyclic root propagates', () => {
      const x = extension('X');
      const y: CycleNode = { id: 'Y', dependencies: [] };
      y.dependencies = [y]; // self-cycle
      const root = extension('root', [x, y]);
      expect(() => buildSnapshot([root])).toThrow('Extension dependency cycle detected: Y → Y');
    });

    it('cycle detection prevents partial snapshot materialisation', () => {
      const a: CycleNode = { id: 'A', dependencies: [] };
      a.dependencies = [a];

      // The function must throw - it must not return a snapshot.
      expect(() => buildSnapshot([a])).toThrow();
    });
  });

  // -- binding behaviour ----------------------------------------------------

  describe('binding behaviour', () => {
    it('dependencies materialised before dependents in flatten order', () => {
      class DrawableX extends Drawable {}
      class DrawableY extends Drawable {}

      const depBinding: RendererBinding = {
        targets: [DrawableX as DrawableConstructor],
        create: () => ({ backendType: RenderBackendType.WebGl2, connect() {}, disconnect() {}, render() {}, flush() {} }),
      };
      const rootBinding: RendererBinding = {
        targets: [DrawableY as DrawableConstructor],
        create: () => ({ backendType: RenderBackendType.WebGl2, connect() {}, disconnect() {}, render() {}, flush() {} }),
      };

      const depExt: Extension = { id: 'dep', renderers: [depBinding] };
      const rootExt: Extension = { id: 'root', renderers: [rootBinding], dependencies: [depExt] };

      const snapshot = buildSnapshot([rootExt]);

      // dep's binding must appear before root's binding
      expect(snapshot.renderers[0]).toBe(depBinding);
      expect(snapshot.renderers[1]).toBe(rootBinding);
      expect(snapshot.renderers).toHaveLength(2);
    });

    it('shared dependency bindings installed once', () => {
      class DrawableX extends Drawable {}

      const depBinding: RendererBinding = {
        targets: [DrawableX as DrawableConstructor],
        create: () => ({ backendType: RenderBackendType.WebGl2, connect() {}, disconnect() {}, render() {}, flush() {} }),
      };

      const depExt: Extension = { id: 'dep', renderers: [depBinding] };
      const A = extension('A', [depExt]);
      const B = extension('B', [depExt]);

      const snapshot = buildSnapshot([A, B]);

      // dep appears once, its binding appears once
      expect(ids(snapshot)).toEqual(['dep', 'A', 'B']);
      expect(snapshot.renderers).toHaveLength(1);
      expect(snapshot.renderers[0]).toBe(depBinding);
    });

    it('genuine different-extension binding conflict still throws', () => {
      class DrawableX extends Drawable {}

      const bindingA: RendererBinding = {
        targets: [DrawableX as DrawableConstructor],
        create: () => ({ backendType: RenderBackendType.WebGl2, connect() {}, disconnect() {}, render() {}, flush() {} }),
      };
      const bindingB: RendererBinding = {
        targets: [DrawableX as DrawableConstructor],
        create: () => ({ backendType: RenderBackendType.WebGl2, connect() {}, disconnect() {}, render() {}, flush() {} }),
      };

      const extA: Extension = { id: 'A', renderers: [bindingA] };
      const extB: Extension = { id: 'B', renderers: [bindingB] };

      const snapshot = buildSnapshot([extA, extB]);
      const backend = createStubBackend();

      expect(() => materializeRendererBindings(backend, [...snapshot.renderers])).toThrow('Two bindings target the same drawable type DrawableX');
    });

    it('dependency dedup happens before binding-conflict validation', () => {
      class DrawableX extends Drawable {}

      const depBinding: RendererBinding = {
        targets: [DrawableX as DrawableConstructor],
        create: () => ({ backendType: RenderBackendType.WebGl2, connect() {}, disconnect() {}, render() {}, flush() {} }),
      };

      const depExt: Extension = { id: 'dep', renderers: [depBinding] };
      const A = extension('A', [depExt]);
      const B = extension('B', [depExt]);

      const snapshot = buildSnapshot([A, B]);

      // dep appears once - no self-conflict
      expect(snapshot.renderers).toHaveLength(1);

      // Materialisation succeeds because the binding is not self-duplicated
      const backend = createStubBackend();
      expect(() => materializeRendererBindings(backend, [...snapshot.renderers])).not.toThrow();
    });
  });

  // -- immutability ---------------------------------------------------------

  describe('immutability', () => {
    it('snapshot arrays remain immutable', () => {
      const result = buildSnapshot([extension('A')]);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.extensions)).toBe(true);
      expect(Object.isFrozen(result.renderers)).toBe(true);
      expect(Object.isFrozen(result.assets)).toBe(true);
    });

    it('EMPTY_SNAPSHOT is immutable', () => {
      expect(Object.isFrozen(EMPTY_SNAPSHOT)).toBe(true);
      expect(Object.isFrozen(EMPTY_SNAPSHOT.extensions)).toBe(true);
      expect(Object.isFrozen(EMPTY_SNAPSHOT.renderers)).toBe(true);
      expect(Object.isFrozen(EMPTY_SNAPSHOT.assets)).toBe(true);
    });

    it('later mutation attempts cannot alter an existing Application snapshot', () => {
      const snapshot = buildSnapshot([extension('A')]);
      expect(() => {
        // @ts-expect-error intentional mutation attempt
        snapshot.extensions = [];
      }).toThrow();
    });

    it('repeated calls return different (also immutable) snapshot objects for same input', () => {
      const ext = extension('A');
      const a = buildSnapshot([ext]);
      const b = buildSnapshot([ext]);
      expect(a).not.toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
      expect(Object.isFrozen(b)).toBe(true);
    });
  });

  // -- reuse ----------------------------------------------------------------

  describe('reuse', () => {
    it('same descriptor graph can construct multiple snapshots', () => {
      const dep = extension('dep');
      const root = extension('root', [dep]);

      const snap1 = buildSnapshot([root]);
      const snap2 = buildSnapshot([root]);

      expect(snap1).not.toBe(snap2);
      expect(ids(snap1)).toEqual(ids(snap2));
    });
  });
});

// ---------------------------------------------------------------------------
// Selection is per application
// ---------------------------------------------------------------------------

describe('Per-application selection', () => {
  const ids = (snapshot: ReturnType<typeof buildSnapshot>): string[] => {
    return snapshot.extensions.map(e => e.id);
  };

  it('a dependency is pulled in without being selected', () => {
    const tilemap = extension('tilemap');
    const tiled = extension('tiled', [tilemap]);

    // Selecting the dependent alone is enough - the graph supplies the rest.
    expect(ids(buildSnapshot([tiled]))).toEqual(['tilemap', 'tiled']);
  });

  it('selecting both a dependency and its dependent materialises each once', () => {
    const tilemap = extension('tilemap');
    const tiled = extension('tiled', [tilemap]);
    const snapshot = buildSnapshot([tilemap, tiled]);

    expect(ids(snapshot)).toEqual(['tilemap', 'tiled']);
    expect(snapshot.extensions.filter(e => e.id === 'tilemap')).toHaveLength(1);
  });

  it('a deep chain comes out dependency-first regardless of selection order', () => {
    const leaf = extension('leaf');
    const mid = extension('mid', [leaf]);
    const root = extension('root', [mid]);

    expect(ids(buildSnapshot([root]))).toEqual(['leaf', 'mid', 'root']);
  });

  it('an application selecting nothing gets nothing', () => {
    expect(buildSnapshot([])).toBe(EMPTY_SNAPSHOT);
  });
});
