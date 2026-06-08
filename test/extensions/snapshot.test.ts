import { beforeEach, describe, expect, it } from 'vitest';

import type { Extension } from '#extensions/Extension';
import { ExtensionRegistry, getGlobalSnapshotInternal } from '#extensions/ExtensionRegistry';
import { buildSnapshot, EMPTY_SNAPSHOT } from '#extensions/snapshot';
import { resetExtensionRegistryForTesting } from '#extensions/testing';

describe('ExtensionSnapshot', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('buildSnapshot([]) returns EMPTY_SNAPSHOT singleton', () => {
    const result = buildSnapshot([]);
    expect(result).toBe(EMPTY_SNAPSHOT);
  });

  it('EMPTY_SNAPSHOT has empty arrays', () => {
    expect(EMPTY_SNAPSHOT.extensions).toHaveLength(0);
    expect(EMPTY_SNAPSHOT.renderers).toHaveLength(0);
    expect(EMPTY_SNAPSHOT.assets).toHaveLength(0);
  });

  it('global snapshot returns same object on repeated calls (cache hit)', () => {
    const ext: Extension = { id: 'test' };
    ExtensionRegistry.register(ext);
    const first = getGlobalSnapshotInternal();
    const second = getGlobalSnapshotInternal();
    expect(first).toBe(second);
  });

  it('global snapshot is invalidated after new registration', () => {
    const extA: Extension = { id: 'a' };
    ExtensionRegistry.register(extA);
    const first = getGlobalSnapshotInternal();
    const extB: Extension = { id: 'b' };
    ExtensionRegistry.register(extB);
    const second = getGlobalSnapshotInternal();
    expect(first).not.toBe(second);
  });

  it('buildSnapshot flattens renderer bindings from multiple extensions', () => {
    const binding1 = { targets: [], create: () => undefined as never };
    const binding2 = { targets: [], create: () => undefined as never };
    const extA: Extension = { id: 'a', renderers: [binding1] };
    const extB: Extension = { id: 'b', renderers: [binding2] };
    const snapshot = buildSnapshot([extA, extB]);
    expect(snapshot.renderers).toHaveLength(2);
    expect(snapshot.renderers[0]).toBe(binding1);
    expect(snapshot.renderers[1]).toBe(binding2);
  });

  it('buildSnapshot flattens asset bindings from multiple extensions', () => {
    class FakeType {}
    const handler1 = { create: () => ({ load: async () => ({}) as never, destroy: () => undefined }) };
    const handler2 = { create: () => ({ load: async () => ({}) as never, destroy: () => undefined }) };
    const extA: Extension = {
      id: 'a',
      assets: [{ type: FakeType as never, create: handler1.create as never }],
    };
    const extB: Extension = {
      id: 'b',
      assets: [{ type: FakeType as never, create: handler2.create as never }],
    };
    const snapshot = buildSnapshot([extA, extB]);
    expect(snapshot.assets).toHaveLength(2);
  });

  it('buildSnapshot de-duplicates same id + same object (no-op)', () => {
    const ext: Extension = { id: 'dup' };
    const snapshot = buildSnapshot([ext, ext]);
    expect(snapshot.extensions).toHaveLength(1);
  });

  it('buildSnapshot throws on same id + different object', () => {
    const extA: Extension = { id: 'dup' };
    const extB: Extension = { id: 'dup' };
    expect(() => buildSnapshot([extA, extB])).toThrow('Duplicate extension id "dup" with a different descriptor');
  });

  it('snapshot is frozen', () => {
    const ext: Extension = { id: 'test' };
    const snapshot = buildSnapshot([ext]);
    expect(() => {
      // @ts-expect-error intentional mutation attempt
      snapshot.extensions = [];
    }).toThrow();
  });

  it('explicit extensions:[] uses EMPTY_SNAPSHOT', () => {
    const result = buildSnapshot([]);
    expect(result.extensions).toHaveLength(0);
    expect(result.renderers).toHaveLength(0);
    expect(result.assets).toHaveLength(0);
  });

  it('multiple calls to global snapshot without new registrations return identical object', () => {
    const ext: Extension = { id: 'stable' };
    ExtensionRegistry.register(ext);
    const snapshots = Array.from({ length: 5 }, () => getGlobalSnapshotInternal());
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i]).toBe(snapshots[0]);
    }
  });
});
