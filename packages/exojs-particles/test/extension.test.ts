import { ExtensionRegistry } from '@codexo/exojs/extensions';
import type { RenderBackend } from '@codexo/exojs/renderer-sdk';
import { RenderBackendType } from '@codexo/exojs/renderer-sdk';
import { beforeEach,describe, expect, it } from 'vitest';

import { resetExtensionRegistryForTesting } from '../../../src/extensions/testing';
import { createParticlesExtension,particlesExtension } from '../src/particlesExtension';
import { ParticleSystem } from '../src/ParticleSystem';
import { WebGl2ParticleRenderer } from '../src/renderers/WebGl2ParticleRenderer';
import { WebGpuParticleRenderer } from '../src/renderers/WebGpuParticleRenderer';

const mockBackend = (backendType: RenderBackendType): RenderBackend => ({ backendType }) as RenderBackend;

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

describe('particlesExtension renderer binding — renders through the package', () => {
  it('create() produces a WebGl2ParticleRenderer for a WebGL2 backend', () => {
    const binding = particlesExtension.renderers![0];
    const renderer = binding.create(mockBackend(RenderBackendType.WebGl2));
    expect(renderer).toBeInstanceOf(WebGl2ParticleRenderer);
  });

  it('create() produces a WebGpuParticleRenderer for a WebGPU backend', () => {
    const binding = particlesExtension.renderers![0];
    const renderer = binding.create(mockBackend(RenderBackendType.WebGpu));
    expect(renderer).toBeInstanceOf(WebGpuParticleRenderer);
  });

  it('create() throws for an unsupported backend', () => {
    const binding = particlesExtension.renderers![0];
    expect(() => binding.create(mockBackend('unknown' as unknown as RenderBackendType))).toThrow('Unsupported render backend');
  });

  it('binding targets the package ParticleSystem (not a Core type)', () => {
    const binding = particlesExtension.renderers![0];
    expect(binding.targets).toContain(ParticleSystem);
  });

  it('createParticlesExtension({ batchSize }) still produces a WebGL2 renderer', () => {
    const ext = createParticlesExtension({ batchSize: 4096 });
    const renderer = ext.renderers![0].create(mockBackend(RenderBackendType.WebGl2));
    expect(renderer).toBeInstanceOf(WebGl2ParticleRenderer);
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
