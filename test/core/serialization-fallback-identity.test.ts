import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NodeSerializer } from '#core/serialization/NodeSerializer';
import { defaultSerializationRegistry, SerializationRegistry } from '#core/serialization/SerializationRegistry';
import { _resetDefaultSerializers, deserializeTree, serializeTree } from '#core/serialization/serialize';
import { Container } from '#rendering/Container';

class A extends Container {}
class B extends Container {}
class Leaf extends A {}

const serializer = <T extends Container>(ctor: new () => T): NodeSerializer<T> => ({
  write: vi.fn(() => ({})),
  read: vi.fn(() => new ctor()),
});

beforeEach(_resetDefaultSerializers);
afterEach(_resetDefaultSerializers);

const roundTrip = <T extends Container>(ctor: new () => T, registry: SerializationRegistry) => {
  const input = new ctor();
  let output: ReturnType<typeof deserializeTree> | undefined;

  try {
    const document = serializeTree(input, null, registry);
    output = deserializeTree(document, null, registry);
    expect(output).toBeInstanceOf(ctor);

    return document;
  } finally {
    input.destroy();
    output?.destroy();
  }
};

describe('serialization fallback type identity', () => {
  it('rejects an existing fallback name before mutating either own lookup', () => {
    const fallback = new SerializationRegistry();
    const local = new SerializationRegistry(fallback);
    fallback.register('Shared', A, serializer(A));
    local.register('LocalB', B, serializer(B));
    const inherited = fallback.resolveByName('Shared');
    const own = local.resolveByName('LocalB');

    expect(() => local.register('Shared', B, serializer(B))).toThrow(/already registered for a different constructor/);
    expect(local.resolveByName('Shared')).toBe(inherited);
    expect(local.resolveByName('LocalB')).toBe(own);
    expect(roundTrip(B, local).type).toBe('LocalB');
    expect(roundTrip(A, fallback).type).toBe('Shared');
  });

  for (const ctor of [A, B]) {
    it(`refuses to write ${ctor.name} after a later parent name collision`, () => {
      const fallback = new SerializationRegistry();
      const local = new SerializationRegistry(fallback);
      const a = serializer(A);
      const b = serializer(B);
      local.register('Shared', B, b);
      fallback.register('Shared', A, a);
      const node = new ctor();

      try {
        expect(() => local.resolveByNode(node)).toThrow(/already registered for a different constructor/);
        expect(() => serializeTree(node, null, local)).toThrow(/already registered for a different constructor/);
        expect(a.write).not.toHaveBeenCalled();
        expect(b.write).not.toHaveBeenCalled();
      } finally {
        node.destroy();
      }
    });
  }

  it('refuses name lookup and deserialization before invoking either conflicting reader', () => {
    const fallback = new SerializationRegistry();
    const local = new SerializationRegistry(fallback);
    const a = serializer(A);
    const b = serializer(B);
    local.register('Shared', B, b);
    fallback.register('Shared', A, a);

    expect(() => local.resolveByName('Shared')).toThrow(/already registered for a different constructor/);
    expect(() => deserializeTree({ type: 'Shared' }, null, local)).toThrow(/already registered for a different constructor/);
    expect(a.read).not.toHaveBeenCalled();
    expect(b.read).not.toHaveBeenCalled();
  });

  it('detects a late collision through an intermediate fallback', () => {
    const fallback = new SerializationRegistry();
    const middle = new SerializationRegistry(fallback);
    const local = new SerializationRegistry(middle);
    local.register('Shared', B, serializer(B));
    fallback.register('Shared', A, serializer(A));

    expect(() => local.resolveByName('Shared')).toThrow(/already registered for a different constructor/);
    expect(() => roundTrip(A, local)).toThrow(/already registered for a different constructor/);
  });

  it('detects a local conflict introduced by lazy core registration', () => {
    const local = new SerializationRegistry(defaultSerializationRegistry);
    const custom = serializer(B);
    local.register('Container', B, custom);
    const node = new Container();

    try {
      expect(() => serializeTree(node, null, local)).toThrow(/already registered for a different constructor/);
      expect(defaultSerializationRegistry.resolveByName('Container')?.ctor).toBe(Container);
      expect(custom.write).not.toHaveBeenCalled();
      expect(custom.read).not.toHaveBeenCalled();
    } finally {
      node.destroy();
    }
  });

  it('keeps the parent and an unrelated sibling usable when another child conflicts', () => {
    const fallback = new SerializationRegistry();
    const conflicting = new SerializationRegistry(fallback);
    const sibling = new SerializationRegistry(fallback);
    conflicting.register('Shared', B, serializer(B));
    sibling.register('SiblingB', B, serializer(B));
    fallback.register('Shared', A, serializer(A));

    expect(() => conflicting.resolveByName('Shared')).toThrow(/already registered for a different constructor/);
    expect(roundTrip(A, fallback).type).toBe('Shared');
    expect(roundTrip(A, sibling).type).toBe('Shared');
    expect(roundTrip(B, sibling).type).toBe('SiblingB');
  });

  it('recovers after clearing only the conflicting local registrations', () => {
    const fallback = new SerializationRegistry();
    const local = new SerializationRegistry(fallback);
    local.register('Shared', B, serializer(B));
    fallback.register('Shared', A, serializer(A));
    expect(() => local.resolveByName('Shared')).toThrow(/already registered for a different constructor/);

    local.clear();

    expect(local.resolveByName('Shared')).toBe(fallback.resolveByName('Shared'));
    expect(roundTrip(A, local).type).toBe('Shared');
  });

  it('observes parent clear and later compatible registrations without caching a conflict', () => {
    const fallback = new SerializationRegistry();
    const local = new SerializationRegistry(fallback);
    const own = serializer(B);
    local.register('Shared', B, own);
    fallback.register('Shared', A, serializer(A));
    expect(() => local.resolveByName('Shared')).toThrow(/already registered for a different constructor/);

    fallback.clear();
    expect(roundTrip(B, local).type).toBe('Shared');
    fallback.register('Shared', B, serializer(B));
    expect(local.resolveByName('Shared')?.serializer).toBe(own);
    expect(roundTrip(B, local).type).toBe('Shared');
  });

  it('preserves same-pair replacement and local precedence for the same constructor', () => {
    const fallback = new SerializationRegistry();
    const local = new SerializationRegistry(fallback);
    fallback.register('Shared', A, serializer(A));
    local.register('Shared', A, serializer(A));
    const replacement = serializer(A);
    local.register('Shared', A, replacement);

    expect(local.resolveByName('Shared')?.serializer).toBe(replacement);
    expect(roundTrip(A, local).type).toBe('Shared');
    expect(replacement.write).toHaveBeenCalledOnce();
    expect(replacement.read).toHaveBeenCalledOnce();
  });

  it('preserves a different local name for the same inherited constructor', () => {
    const fallback = new SerializationRegistry();
    const local = new SerializationRegistry(fallback);
    fallback.register('GlobalA', A, serializer(A));
    local.register('LocalA', A, serializer(A));

    expect(roundTrip(A, local).type).toBe('LocalA');
    expect(roundTrip(A, fallback).type).toBe('GlobalA');
  });

  it('preserves multiple names and same-pair replacements for one own constructor', () => {
    const registry = new SerializationRegistry();
    const first = serializer(A);
    const second = serializer(A);
    registry.register('FirstA', A, first);
    registry.register('SecondA', A, second);

    expect(registry.resolveByName('FirstA')?.serializer).toBe(first);
    expect(registry.resolveByName('SecondA')?.serializer).toBe(second);
    expect(roundTrip(A, registry).type).toBe('SecondA');

    const replacement = serializer(A);
    registry.register('FirstA', A, replacement);

    expect(registry.resolveByName('SecondA')?.serializer).toBe(second);
    expect(roundTrip(A, registry).type).toBe('FirstA');
    expect(replacement.write).toHaveBeenCalledOnce();
    expect(replacement.read).toHaveBeenCalledOnce();
  });

  it('preserves constructor specificity across registries with unrelated names', () => {
    const fallback = new SerializationRegistry();
    const local = new SerializationRegistry(fallback);
    fallback.register('GlobalLeaf', Leaf, serializer(Leaf));
    local.register('LocalBase', A, serializer(A));

    expect(roundTrip(Leaf, local).type).toBe('GlobalLeaf');
    expect(roundTrip(A, local).type).toBe('LocalBase');
  });
});
