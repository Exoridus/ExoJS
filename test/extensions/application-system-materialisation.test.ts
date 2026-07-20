import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Application } from '#core/Application';
import type { System } from '#core/System';
import { SystemRegistry } from '#core/SystemRegistry';
import type { ApplicationSystemBinding } from '#extensions/Extension';
import { materializeApplicationSystems } from '#extensions/materialize';
import { resetExtensionRegistryForTesting } from '#extensions/testing';

function createStubApp(): Application & { systems: SystemRegistry } {
  return { systems: new SystemRegistry() } as unknown as Application & { systems: SystemRegistry };
}

describe('materializeApplicationSystems', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('registers the system produced by a binding', () => {
    const app = createStubApp();
    const system: System = { update: vi.fn() };
    const binding: ApplicationSystemBinding = { create: () => system };

    materializeApplicationSystems(app, [binding]);

    expect(app.systems.has(system)).toBe(true);
  });

  it('create() is called exactly once per binding, with the application', () => {
    const app = createStubApp();
    const system: System = { update: vi.fn() };
    const createFn = vi.fn(() => system);
    const binding: ApplicationSystemBinding = { create: createFn };

    materializeApplicationSystems(app, [binding]);

    expect(createFn).toHaveBeenCalledTimes(1);
    expect(createFn).toHaveBeenCalledWith(app);
  });

  it('skips a binding whose create() returns undefined, without throwing', () => {
    const app = createStubApp();
    const binding: ApplicationSystemBinding = { create: () => undefined };

    expect(() => materializeApplicationSystems(app, [binding])).not.toThrow();
    expect(app.systems.size).toBe(0);
  });

  it('registers systems from multiple bindings, skipping only the undefined ones', () => {
    const app = createStubApp();
    const systemA: System = { update: vi.fn() };
    const systemC: System = { update: vi.fn() };
    const bindings: ApplicationSystemBinding[] = [{ create: () => systemA }, { create: () => undefined }, { create: () => systemC }];

    materializeApplicationSystems(app, bindings);

    expect(app.systems.size).toBe(2);
    expect(app.systems.has(systemA)).toBe(true);
    expect(app.systems.has(systemC)).toBe(true);
  });

  it('two applications receive independent system instances from the same binding', () => {
    const appA = createStubApp();
    const appB = createStubApp();
    const systemA: System = { update: vi.fn() };
    const systemB: System = { update: vi.fn() };
    let callCount = 0;
    const binding: ApplicationSystemBinding = { create: () => (callCount++ === 0 ? systemA : systemB) };

    materializeApplicationSystems(appA, [binding]);
    materializeApplicationSystems(appB, [binding]);

    expect(appA.systems.has(systemA)).toBe(true);
    expect(appA.systems.has(systemB)).toBe(false);
    expect(appB.systems.has(systemB)).toBe(true);
    expect(appB.systems.has(systemA)).toBe(false);
  });
});
