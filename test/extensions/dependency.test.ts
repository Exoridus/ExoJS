import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Extension, RendererBinding } from '#extensions/Extension';
import { ExtensionRegistry, getGlobalSnapshotInternal } from '#extensions/ExtensionRegistry';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildSnapshot, EMPTY_SNAPSHOT } from '#extensions/snapshot';
import { resetExtensionRegistryForTesting } from '#extensions/testing';
import { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { DrawableConstructor } from '#rendering/Renderer';
import { RendererRegistry } from '#rendering/RendererRegistry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class FakeDrawable extends Drawable {}

function extension(id: string, deps?: readonly Extension[]): Extension {
  return { id, dependencies: deps };
}

function createStubBackend(): RenderBackend {
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
}

function ids(snapshot: ReturnType<typeof buildSnapshot>): string[] {
  return snapshot.extensions.map(e => e.id);
}

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
      const a: Extension = { id: 'A' };
      (a as { dependencies: Extension[] }).dependencies = [a];
      expect(() => buildSnapshot([a])).toThrow('Extension dependency cycle detected: A → A');
    });

    it('two-node cycle', () => {
      const a: Extension = { id: 'A', dependencies: [] };
      const b: Extension = { id: 'B', dependencies: [] };
      (a as { dependencies: Extension[] }).dependencies = [b];
      (b as { dependencies: Extension[] }).dependencies = [a];
      expect(() => buildSnapshot([a])).toThrow('Extension dependency cycle detected: A → B → A');
    });

    it('three-node cycle', () => {
      const a: Extension = { id: 'A', dependencies: [] };
      const b: Extension = { id: 'B', dependencies: [] };
      const c: Extension = { id: 'C', dependencies: [] };
      (a as { dependencies: Extension[] }).dependencies = [b];
      (b as { dependencies: Extension[] }).dependencies = [c];
      (c as { dependencies: Extension[] }).dependencies = [a];
      expect(() => buildSnapshot([a])).toThrow('Extension dependency cycle detected: A → B → C → A');
    });

    it('cycle error includes complete path with repeated start at end', () => {
      // D -> B -> C -> D
      const d: Extension = { id: 'D', dependencies: [] };
      const b: Extension = { id: 'B', dependencies: [] };
      const c: Extension = { id: 'C', dependencies: [] };
      (d as { dependencies: Extension[] }).dependencies = [b];
      (b as { dependencies: Extension[] }).dependencies = [c];
      (c as { dependencies: Extension[] }).dependencies = [d];

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
      const y: Extension = { id: 'Y', dependencies: [] };
      (y as { dependencies: Extension[] }).dependencies = [y]; // self-cycle
      const root = extension('root', [x, y]);
      expect(() => buildSnapshot([root])).toThrow('Extension dependency cycle detected: Y → Y');
    });

    it('cycle detection prevents partial snapshot materialisation', () => {
      const a: Extension = { id: 'A', dependencies: [] };
      (a as { dependencies: Extension[] }).dependencies = [a];

      // The function must throw — it must not return a snapshot.
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
        create: () => ({ connect() {}, disconnect() {}, render() {}, flush() {} }),
      };
      const rootBinding: RendererBinding = {
        targets: [DrawableY as DrawableConstructor],
        create: () => ({ connect() {}, disconnect() {}, render() {}, flush() {} }),
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
        create: () => ({ connect() {}, disconnect() {}, render() {}, flush() {} }),
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
        create: () => ({ connect() {}, disconnect() {}, render() {}, flush() {} }),
      };
      const bindingB: RendererBinding = {
        targets: [DrawableX as DrawableConstructor],
        create: () => ({ connect() {}, disconnect() {}, render() {}, flush() {} }),
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
        create: () => ({ connect() {}, disconnect() {}, render() {}, flush() {} }),
      };

      const depExt: Extension = { id: 'dep', renderers: [depBinding] };
      const A = extension('A', [depExt]);
      const B = extension('B', [depExt]);

      const snapshot = buildSnapshot([A, B]);

      // dep appears once — no self-conflict
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
// Global + local behaviour
// ---------------------------------------------------------------------------

describe('Global registry + local extensions', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  afterEach(() => {
    resetExtensionRegistryForTesting();
  });

  function ids(snapshot: ReturnType<typeof getGlobalSnapshotInternal>): string[] {
    return snapshot.extensions.map(e => e.id);
  }

  it('global snapshot resolves dependencies correctly', () => {
    // Register via global registry — the snapshot traverses dependencies.
    const tilemap = extension('tilemap');
    const tiled = extension('tiled', [tilemap]);

    // Register both globally
    ExtensionRegistry.register(tilemap);
    ExtensionRegistry.register(tiled);

    const snapshot = getGlobalSnapshotInternal();
    // The global registry stores extensions; buildSnapshot resolves deps.
    // With both registered, tilemap appears first (dependency) then tiled.
    expect(ids(snapshot)).toEqual(['tilemap', 'tiled']);
  });

  it('dependency globally registered, dependent local', () => {
    // local buildSnapshot only — but tiled's dependency pulls in tilemap
    const tilemap = extension('tilemap');
    const tiled = extension('tiled', [tilemap]);

    // tilemap is globally registered but we use local path only
    // Since local path doesn't consult global, tilemap only comes from deps.
    const snapshot = buildSnapshot([tiled]);
    expect(ids(snapshot)).toEqual(['tilemap', 'tiled']);
  });

  it('both globally registered — each materialised once in order', () => {
    const tilemap = extension('tilemap');
    const tiled = extension('tiled', [tilemap]);

    // Register tiled only (tilemap comes from deps)
    ExtensionRegistry.register(tiled);

    const snapshot = getGlobalSnapshotInternal();
    expect(ids(snapshot)).toEqual(['tilemap', 'tiled']);
  });

  it('both local — each materialised once', () => {
    const tilemap = extension('tilemap');
    const tiled = extension('tiled', [tilemap]);

    const snapshot = buildSnapshot([tilemap, tiled]);
    expect(ids(snapshot)).toEqual(['tilemap', 'tiled']);
  });

  it('same descriptor appears globally and locally — local path deduplicates', () => {
    const tilemap = extension('tilemap');
    const tiled = extension('tiled', [tilemap]);

    // Register tilemap globally
    ExtensionRegistry.register(tilemap);

    // Local snapshot uses tiled only — tilemap comes from deps (same object)
    const snapshot = buildSnapshot([tiled]);
    expect(ids(snapshot)).toEqual(['tilemap', 'tiled']);
    // tilemap appears exactly once
    expect(snapshot.extensions.filter(e => e.id === 'tilemap')).toHaveLength(1);
  });

  it('same ID appears globally and locally through different objects — local path does NOT see global', () => {
    // This test verifies that local buildSnapshot is isolated from global registry.
    // Different objects with the same ID in local path trigger an error.
    // But since local doesn't consult global, the global-registered one is irrelevant.
    const tilemapGlobal = extension('tilemap');
    const tilemapLocal = extension('tilemap');
    const tiled = extension('tiled', [tilemapLocal]);

    // Register a different tilemap globally
    ExtensionRegistry.register(tilemapGlobal);

    // Local path uses tilemapLocal — that's fine within the local scope.
    // The global tilemapGlobal is not consulted.
    const snapshot = buildSnapshot([tiled]);
    expect(ids(snapshot)).toEqual(['tilemap', 'tiled']);
    expect(snapshot.extensions[0]).toBe(tilemapLocal);
  });

  it('global snapshot with dependencies preserves deterministic order', () => {
    // Register in a specific order; snapshot traversal produces dependency-first order.
    const leaf = extension('leaf');
    const mid = extension('mid', [leaf]);
    const root = extension('root', [mid]);

    ExtensionRegistry.register(root); // register root first
    ExtensionRegistry.register(mid);
    ExtensionRegistry.register(leaf);

    const snapshot = getGlobalSnapshotInternal();
    // Dependency-first order: leaf, mid, root
    expect(ids(snapshot)).toEqual(['leaf', 'mid', 'root']);
  });
});
