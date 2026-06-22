import { describe, expect, it } from 'vitest';

import type { NodeSerializer } from '#core/serialization/NodeSerializer';
import { SerializationRegistry } from '#core/serialization/SerializationRegistry';
import { Container } from '#rendering/Container';

// Concrete SceneNode subclasses used purely as registry keys.
class GlobalNode extends Container {}
class AppNode extends Container {}

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
