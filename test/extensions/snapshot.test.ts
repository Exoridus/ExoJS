import { describe, expect, it } from 'vitest';

import type { Extension } from '#extensions/Extension';
import { buildSnapshot, EMPTY_SNAPSHOT } from '#extensions/snapshot';

import { testAssetType } from '../assets/test-asset-type';

describe('ExtensionSnapshot', () => {
  it('buildSnapshot([]) returns EMPTY_SNAPSHOT singleton', () => {
    const result = buildSnapshot([]);
    expect(result).toBe(EMPTY_SNAPSHOT);
  });

  it('EMPTY_SNAPSHOT has empty arrays', () => {
    expect(EMPTY_SNAPSHOT.extensions).toHaveLength(0);
    expect(EMPTY_SNAPSHOT.renderers).toHaveLength(0);
    expect(EMPTY_SNAPSHOT.assets).toHaveLength(0);
    expect(EMPTY_SNAPSHOT.serializers).toHaveLength(0);
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

  it('buildSnapshot flattens asset types from multiple extensions', () => {
    const extA: Extension = { id: 'a', assets: [testAssetType({ id: 'fake-a', create: async () => ({}) })] };
    const extB: Extension = { id: 'b', assets: [testAssetType({ id: 'fake-b', create: async () => ({}) })] };
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
    expect(() => buildSnapshot([extA, extB])).toThrow('Extension "dup" was provided by multiple descriptor objects.');
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
});
