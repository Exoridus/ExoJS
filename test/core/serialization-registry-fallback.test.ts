import { describe, expect, it } from 'vitest';

import type { NodeSerializer } from '#core/serialization/NodeSerializer';
import { SerializationRegistry } from '#core/serialization/SerializationRegistry';
import { Container } from '#rendering/Container';

// Concrete SceneNode subclasses used purely as registry keys.
class GlobalNode extends Container {}
class AppNode extends Container {}

// A three-level hierarchy for the specificity-ranking tests below.
class BaseNode extends Container {}
class MiddleNode extends BaseNode {}
class LeafNode extends MiddleNode {}

const stub = <T extends Container>(): NodeSerializer<T> => ({
  write: () => ({}),
  read: () => new Container() as unknown as T,
});

/**
 * A2: Application owns its own serializer registry chained to the global
 * `defaultSerializationRegistry`. Extension serializers materialise on the
 * app-scoped registry, so two Applications in one process stay isolated while
 * core/global registrations remain shared through the fallback.
 */
describe('SerializationRegistry fallback chain (app-scoped serializers)', () => {
  it('inherits fallback entries while keeping its own entries isolated from the parent', () => {
    const global = new SerializationRegistry();
    global.register('GlobalNode', GlobalNode, stub<GlobalNode>());

    const app = new SerializationRegistry(global);
    app.register('AppNode', AppNode, stub<AppNode>());

    // The app registry resolves both its own and the inherited global serializer.
    expect(app.resolveByName('AppNode')?.typeName).toBe('AppNode');
    expect(app.resolveByName('GlobalNode')?.typeName).toBe('GlobalNode');
    expect(app.resolveByNode(new AppNode())?.typeName).toBe('AppNode');
    expect(app.resolveByNode(new GlobalNode())?.typeName).toBe('GlobalNode');
    expect(app.hasType('AppNode')).toBe(true);
    expect(app.hasType('GlobalNode')).toBe(true);

    // The global registry must NOT see the app-scoped serializer.
    expect(global.resolveByName('AppNode')).toBeUndefined();
    expect(global.resolveByNode(new AppNode())).toBeUndefined();
    expect(global.hasType('AppNode')).toBe(false);
  });

  it('isolates two app registries that share one global fallback', () => {
    const global = new SerializationRegistry();
    const appA = new SerializationRegistry(global);
    const appB = new SerializationRegistry(global);

    appA.register('AppNode', AppNode, stub<AppNode>());

    expect(appA.hasType('AppNode')).toBe(true);
    expect(appB.hasType('AppNode')).toBe(false);
  });
});

/**
 * Constructor resolution ranks the whole chain — own registrations and
 * inherited ones together — by how specific the registered constructor is.
 * Consulting the local registry to exhaustion first would let a local base-class
 * registration beat an exact inherited one.
 */
describe('SerializationRegistry constructor resolution (specificity ranking)', () => {
  it('prefers an inherited exact match over a locally registered ancestor', () => {
    const global = new SerializationRegistry();
    global.register('LeafNode', LeafNode, stub<LeafNode>());

    const app = new SerializationRegistry(global);
    app.register('BaseNode', BaseNode, stub<BaseNode>());

    expect(app.resolveByNode(new LeafNode())?.typeName).toBe('LeafNode');
  });

  it('prefers an inherited nearer ancestor over a locally registered farther one', () => {
    const global = new SerializationRegistry();
    global.register('MiddleNode', MiddleNode, stub<MiddleNode>());

    const app = new SerializationRegistry(global);
    app.register('BaseNode', BaseNode, stub<BaseNode>());

    expect(app.resolveByNode(new LeafNode())?.typeName).toBe('MiddleNode');
  });

  it('prefers a local registration over an inherited one at the same specificity', () => {
    const global = new SerializationRegistry();
    global.register('GlobalLeaf', LeafNode, stub<LeafNode>());

    const app = new SerializationRegistry(global);
    // A different type name for the same constructor is only legal across
    // registries — `register` rejects it within one.
    app.register('AppLeaf', LeafNode, stub<LeafNode>());

    expect(app.resolveByNode(new LeafNode())?.typeName).toBe('AppLeaf');
  });

  it('still falls back to an ancestor when nothing registers the exact constructor', () => {
    const global = new SerializationRegistry();
    global.register('BaseNode', BaseNode, stub<BaseNode>());

    const app = new SerializationRegistry(global);

    expect(app.resolveByNode(new LeafNode())?.typeName).toBe('BaseNode');
  });

  it('returns undefined when neither registry covers the constructor chain', () => {
    const app = new SerializationRegistry(new SerializationRegistry());

    expect(app.resolveByNode(new LeafNode())).toBeUndefined();
  });
});
