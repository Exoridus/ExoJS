import { describe, expect, it } from 'vitest';

import type { PhysicsStamp, RenderingStamp } from '../src/profile/schema';
import { computeProfileSignature } from '../src/profile/signature';
import { deriveProfileParts, normalizeCpuModel, normalizeGpuAdapter } from '../src/profile/slug';

/**
 * The slug decides which file a re-measurement overwrites, so a normalization
 * that drifts silently re-publishes one machine under two names. These pin the
 * adapter shapes browsers actually report, and the fallbacks a single-domain
 * profile relies on.
 */

const renderingStamp = (adapter: string, backend: RenderingStamp['backend'] = 'webgl2'): RenderingStamp => ({
  backend,
  adapter,
  flags: [],
  headless: true,
  software: false,
  engineVersion: '0.17.0',
  timestamp: '2026-01-01T00:00:00.000Z',
});

const physicsStamp = (cpu: string, os: string): PhysicsStamp => ({
  host: { node: 'v24.14.1', cpu, cpuCount: 16, os, arch: 'x64' },
  fixedDelta: 1 / 60,
  caveats: [],
  engineVersion: '0.17.0',
  timestamp: '2026-01-01T00:00:00.000Z',
});

describe('normalizeGpuAdapter', () => {
  it.each([
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'rtx-5070-ti'],
    ['ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4090/PCIe/SSE2, OpenGL 4.5.0)', 'rtx-4090'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)', 'apple-m3-max'],
    ['Apple M3 Max', 'apple-m3-max'],
    ['nvidia blackwell', 'blackwell'],
  ])('reduces %s to the part it names', (adapter, expected) => {
    expect(normalizeGpuAdapter(adapter)).toBe(expected);
  });
});

describe('normalizeCpuModel', () => {
  it.each([
    ['AMD Ryzen 7 3700X 8-Core Processor', 'ryzen-7-3700x'],
    ['Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz', 'i7-9750h'],
  ])('reduces %s to the part it names', (cpu, expected) => {
    expect(normalizeCpuModel(cpu)).toBe(expected);
  });
});

describe('deriveProfileParts', () => {
  it('prefers the adapter that names a model number over one naming an architecture', () => {
    const parts = deriveProfileParts({
      rendering: [renderingStamp('nvidia blackwell', 'webgpu'), renderingStamp('ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11, D3D11)')],
      physics: physicsStamp('AMD Ryzen 7 3700X 8-Core Processor', 'win32 10.0.26200'),
    });

    expect(parts).toEqual({ slug: 'rtx-5070-ti-windows-chromium', gpu: 'rtx-5070-ti', os: 'windows', browser: 'chromium' });
  });

  it('infers the operating system from the graphics API when no physics run recorded it', () => {
    expect(deriveProfileParts({ rendering: [renderingStamp('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)')] }).slug).toBe(
      'apple-m3-max-macos-chromium',
    );
  });

  it('names a physics-only profile after its CPU and the runtime it was measured in', () => {
    expect(deriveProfileParts({ physics: physicsStamp('AMD Ryzen 7 3700X 8-Core Processor', 'win32 10.0.26200') }).slug).toBe('ryzen-7-3700x-windows-node');
  });

  it('refuses to guess an operating system a rendering-only run does not evidence', () => {
    expect(() => deriveProfileParts({ rendering: [renderingStamp('nvidia blackwell', 'webgpu')] })).toThrow(/operating system/);
  });
});

describe('computeProfileSignature', () => {
  it('is independent of key order, so a re-serialized file verifies unchanged', () => {
    expect(computeProfileSignature({ schemaVersion: 1, profile: { slug: 'a-b-c' } })).toBe(
      computeProfileSignature({ profile: { slug: 'a-b-c' }, schemaVersion: 1 }),
    );
  });

  it('ignores the signature field, so a signed document and its unsigned form agree', () => {
    const document = { schemaVersion: 1, profile: { slug: 'a-b-c' } };

    expect(computeProfileSignature({ ...document, signature: { algorithm: 'sha256', value: 'stale' } })).toBe(computeProfileSignature(document));
  });

  it('changes when any measured value changes', () => {
    expect(computeProfileSignature({ value: 0.25 })).not.toBe(computeProfileSignature({ value: 0.26 }));
  });
});
