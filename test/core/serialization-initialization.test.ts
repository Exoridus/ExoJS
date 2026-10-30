import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSerializationRegistry, registerSerializer } from '#core/serialization/SerializationRegistry';
import { _resetDefaultSerializers, deserializeInto, deserializeTree, serializeTree } from '#core/serialization/serialize';
import { Container } from '#rendering/Container';

beforeEach(_resetDefaultSerializers);
afterEach(_resetDefaultSerializers);

describe('core serializer initialization', () => {
  for (const entryPoint of ['serializeTree', 'deserializeTree', 'deserializeInto'] as const) {
    it(`keeps rejecting a failed initialization on repeated ${entryPoint} calls`, () => {
      class ConflictingNode extends Container {}

      registerSerializer('Sprite', ConflictingNode, {
        write: () => ({}),
        read: () => new ConflictingNode(),
      });

      const node = new Container();

      const attempt = (): void => {
        if (entryPoint === 'serializeTree') {
          serializeTree(node);
        } else if (entryPoint === 'deserializeTree') {
          deserializeTree({ type: 'Container' }).destroy();
        } else {
          deserializeInto(node, { type: 'Container' });
        }
      };

      try {
        expect(attempt).toThrow('A serializer for type name "Sprite" is already registered for a different constructor.');
        expect(attempt).toThrow('A serializer for type name "Sprite" is already registered for a different constructor.');
        expect(defaultSerializationRegistry.resolveByName('Sprite')?.ctor).toBe(ConflictingNode);
      } finally {
        node.destroy();
      }
    });
  }

  it('preserves registration precedence around the first successful initialization', () => {
    const writeBefore = vi.fn(() => ({ custom: 'before' }));
    const writeAfter = vi.fn(() => ({ custom: 'after' }));
    const node = new Container();

    try {
      registerSerializer('Container', Container, { write: writeBefore, read: () => new Container() });
      expect(serializeTree(node)).toEqual({ type: 'Container' });
      expect(writeBefore).not.toHaveBeenCalled();

      registerSerializer('Container', Container, { write: writeAfter, read: () => new Container() });
      expect(serializeTree(node)).toEqual({ type: 'Container', custom: 'after' });
      expect(serializeTree(node)).toEqual({ type: 'Container', custom: 'after' });
      expect(writeAfter).toHaveBeenCalledTimes(2);
    } finally {
      node.destroy();
    }
  });
});
