import { describe, expect, it, beforeEach } from 'vitest';
import { ExtensionRegistry } from '@codexo/exojs/extensions';
import { resetExtensionRegistryForTesting } from '../../../src/extensions/testing';
import { particlesExtension, createParticlesExtension } from '../src/particlesExtension';
import { ParticleSystem } from '../src/ParticleSystem';

describe('@codexo/exojs-particles root', () => {
  it('particlesExtension has correct id', () => {
    expect(particlesExtension.id).toBe('@codexo/exojs-particles');
  });

  it('particlesExtension has renderer bindings', () => {
    expect(particlesExtension.renderers).toBeDefined();
    expect(particlesExtension.renderers!.length).toBe(1);
  });

  it('particlesExtension renderer binding targets ParticleSystem', () => {
    const binding = particlesExtension.renderers![0];
    expect(binding.targets).toContain(ParticleSystem);
  });

  it('createParticlesExtension() returns an extension with same id', () => {
    const ext = createParticlesExtension();
    expect(ext.id).toBe('@codexo/exojs-particles');
  });

  it('createParticlesExtension() accepts batchSize option', () => {
    const ext = createParticlesExtension({ batchSize: 4096 });
    expect(ext.id).toBe('@codexo/exojs-particles');
    expect(ext.renderers).toBeDefined();
  });

  it('root import does NOT register in ExtensionRegistry', () => {
    const registry = ExtensionRegistry.list();
    expect(registry.some(e => e.id === '@codexo/exojs-particles')).toBe(false);
  });
});

describe('@codexo/exojs-particles/register', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('register entry registers particlesExtension', async () => {
    resetExtensionRegistryForTesting();
    await import('../src/register');
    expect(ExtensionRegistry.has('@codexo/exojs-particles')).toBe(true);
  });
});

describe('export parity', () => {
  it('root and register have same named exports', async () => {
    const root = await import('../src/index');
    const register = await import('../src/register');
    const rootKeys = Object.keys(root).filter(k => k !== 'default').sort();
    const registerKeys = Object.keys(register).filter(k => k !== 'default').sort();
    expect(rootKeys).toEqual(registerKeys);
  });
});
