import { beforeEach, describe, expect, it } from 'vitest';

import type { Extension } from '#extensions/Extension';
import { ExtensionRegistry } from '#extensions/ExtensionRegistry';
import { resetExtensionRegistryForTesting } from '#extensions/testing';

describe('ExtensionRegistry', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('registers first extension', () => {
    const ext: Extension = { id: 'test-ext' };
    ExtensionRegistry.register(ext);
    expect(ExtensionRegistry.has('test-ext')).toBe(true);
  });

  it('same object re-registered is a no-op', () => {
    const ext: Extension = { id: 'test-ext' };
    ExtensionRegistry.register(ext);
    ExtensionRegistry.register(ext);
    expect(ExtensionRegistry.list()).toHaveLength(1);
  });

  it('throws when same id registered with different object', () => {
    const extA: Extension = { id: 'conflict' };
    const extB: Extension = { id: 'conflict' };
    ExtensionRegistry.register(extA);
    expect(() => ExtensionRegistry.register(extB)).toThrow('An extension with id "conflict" is already registered with a different descriptor');
  });

  it('has() returns false for unregistered id', () => {
    expect(ExtensionRegistry.has('missing')).toBe(false);
  });

  it('has() returns true for registered id', () => {
    const ext: Extension = { id: 'foo' };
    ExtensionRegistry.register(ext);
    expect(ExtensionRegistry.has('foo')).toBe(true);
  });

  it('get() returns undefined for unregistered id', () => {
    expect(ExtensionRegistry.get('missing')).toBeUndefined();
  });

  it('get() returns the registered descriptor', () => {
    const ext: Extension = { id: 'foo' };
    ExtensionRegistry.register(ext);
    expect(ExtensionRegistry.get('foo')).toBe(ext);
  });

  it('list() returns extensions in registration order', () => {
    const extA: Extension = { id: 'a' };
    const extB: Extension = { id: 'b' };
    const extC: Extension = { id: 'c' };
    ExtensionRegistry.register(extA);
    ExtensionRegistry.register(extB);
    ExtensionRegistry.register(extC);
    const list = ExtensionRegistry.list();
    expect(list[0]).toBe(extA);
    expect(list[1]).toBe(extB);
    expect(list[2]).toBe(extC);
  });

  it('list() returns stable cached array on repeated calls', () => {
    const ext: Extension = { id: 'foo' };
    ExtensionRegistry.register(ext);
    const first = ExtensionRegistry.list();
    const second = ExtensionRegistry.list();
    expect(first).toBe(second);
  });

  it('list() cache is invalidated after new registration', () => {
    const extA: Extension = { id: 'a' };
    ExtensionRegistry.register(extA);
    const first = ExtensionRegistry.list();
    const extB: Extension = { id: 'b' };
    ExtensionRegistry.register(extB);
    const second = ExtensionRegistry.list();
    expect(first).not.toBe(second);
    expect(second).toHaveLength(2);
  });

  it('resetExtensionRegistryForTesting() clears all registrations', () => {
    const ext: Extension = { id: 'foo' };
    ExtensionRegistry.register(ext);
    expect(ExtensionRegistry.has('foo')).toBe(true);
    resetExtensionRegistryForTesting();
    expect(ExtensionRegistry.has('foo')).toBe(false);
    expect(ExtensionRegistry.list()).toHaveLength(0);
  });

  it('supports multiple distinct extensions', () => {
    const extA: Extension = { id: 'particles' };
    const extB: Extension = { id: 'tiled' };
    ExtensionRegistry.register(extA);
    ExtensionRegistry.register(extB);
    expect(ExtensionRegistry.has('particles')).toBe(true);
    expect(ExtensionRegistry.has('tiled')).toBe(true);
    expect(ExtensionRegistry.list()).toHaveLength(2);
  });
});
