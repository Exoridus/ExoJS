import { describe, expect, it } from 'vitest';

import type { PhysicsStamp, RenderingStamp } from '../src/profile/schema';
import { computeProfileSignature } from '../src/profile/signature';
import { deriveProfileParts, normalizeCpuModel, normalizeGpuAdapter, ProfileSlugError } from '../src/profile/slug';
import type { PlatformVersionStamp } from '../src/shared/provenance';

/**
 * The slug decides which file a re-measurement overwrites, so a normalization
 * that drifts silently re-publishes one machine under two names. These pin the
 * adapter shapes browsers actually report, the fallbacks a single-domain
 * profile relies on, and the two cases that must fail loudly rather than be
 * guessed: a browser that names no machine, and a platform that names no
 * version.
 */

const WINDOWS_11: PlatformVersionStamp = { major: 11, source: 'detected', evidence: `os.release() reported '10.0.26200'` };
const MACOS_27_BETA: PlatformVersionStamp = { major: 27, source: 'declared', evidence: `the runner declared '27-beta'` };
const NO_VERSION: PlatformVersionStamp = { major: 0, source: 'undetermined', evidence: 'the kernel version does not name the product version' };

const renderingStamp = (adapter: string, backend: RenderingStamp['backend'] = 'webgl2', overrides: Partial<RenderingStamp> = {}): RenderingStamp => ({
  backend,
  adapter,
  browser: 'chromium',
  browserVersion: '151.0.7922.34',
  os: '',
  platformVersion: WINDOWS_11,
  prerelease: { value: false, source: 'assumed-stable', evidence: 'no marker, none declared' },
  flags: [],
  headless: true,
  software: false,
  engineVersion: '0.17.0',
  timestamp: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const physicsStamp = (cpu: string, os: string, platformVersion: PlatformVersionStamp = WINDOWS_11, overrides: Partial<PhysicsStamp> = {}): PhysicsStamp => ({
  browser: 'chromium',
  browserVersion: '151.0.7922.34',
  host: { cpu, cpuCount: 16, os, platformVersion, arch: 'x64' },
  prerelease: { value: false, source: 'assumed-stable', evidence: 'no marker, none declared' },
  fixedDelta: 1 / 60,
  clock: { resolutionMs: 0.005, crossOriginIsolated: true },
  caveats: [],
  engineVersion: '0.17.0',
  timestamp: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** The WebKit-on-macOS-beta pair: a masked adapter, and the CPU model that has to name the machine instead. */
const webkitBetaStamp = (): RenderingStamp =>
  renderingStamp('Apple GPU', 'webgl2', {
    browser: 'webkit',
    browserVersion: '26.5',
    os: 'darwin 25.0.0',
    platformVersion: MACOS_27_BETA,
    prerelease: { value: true, source: 'declared', evidence: `the runner declared the platform as '27-beta'` },
  });

describe('normalizeGpuAdapter', () => {
  it.each([
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'rtx-5070-ti'],
    ['ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4090/PCIe/SSE2, OpenGL 4.5.0)', 'rtx-4090'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)', 'm3-max'],
    ['Apple M3 Max', 'm3-max'],
    ['nvidia blackwell', 'blackwell'],
  ])('reduces %s to the part it names', (adapter, expected) => {
    expect(normalizeGpuAdapter(adapter)).toBe(expected);
  });

  it('reduces a browser that reports a constant instead of the device to a word that names no machine', () => {
    expect(normalizeGpuAdapter('Apple GPU')).toBe('gpu');
  });
});

describe('normalizeCpuModel', () => {
  it.each([
    ['AMD Ryzen 7 3700X 8-Core Processor', 'ryzen-7-3700x'],
    ['Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz', 'i7-9750h'],
    ['Apple M3 Max', 'm3-max'],
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

    expect(parts).toEqual({
      slug: 'rtx-5070-ti-windows-11-chromium',
      gpu: 'rtx-5070-ti',
      os: 'windows-11',
      browser: 'chromium',
      platform: { name: 'windows', version: 11, versionSource: 'detected', prerelease: false },
    });
  });

  it('infers the operating system from the graphics API when no run recorded it', () => {
    const stamp = renderingStamp('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)', 'webgl2', {
      platformVersion: { major: 26, source: 'declared', evidence: `the runner declared '26'` },
    });

    expect(deriveProfileParts({ rendering: [stamp] }).slug).toBe('m3-max-macos-26-chromium');
  });

  it('names a physics-only profile after its CPU and the browser it was measured in', () => {
    expect(deriveProfileParts({ physics: physicsStamp('AMD Ryzen 7 3700X 8-Core Processor', 'win32 10.0.26200') }).slug).toBe(
      'ryzen-7-3700x-windows-11-chromium',
    );
  });

  it('names a physics-only profile measured in WebKit after WebKit, so it cannot overwrite the Chromium one', () => {
    const stamp = physicsStamp('Apple M3 Max', 'darwin 25.0.0', MACOS_27_BETA, { browser: 'webkit', browserVersion: '26.5' });

    expect(deriveProfileParts({ physics: stamp }).slug).toBe('m3-max-macos-27-webkit');
  });

  it('refuses a document whose domains were measured in different browsers rather than picking one', () => {
    const sources = {
      rendering: [renderingStamp('ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)')],
      physics: physicsStamp('AMD Ryzen 7 3700X 8-Core Processor', 'win32 10.0.26200', WINDOWS_11, { browser: 'webkit', browserVersion: '26.5' }),
    };

    expect(() => deriveProfileParts(sources)).toThrow(ProfileSlugError);
    expect(() => deriveProfileParts(sources)).toThrow(/different browsers/);
  });

  it('refuses to guess an operating system a rendering-only run does not evidence', () => {
    expect(() => deriveProfileParts({ rendering: [renderingStamp('nvidia blackwell', 'webgpu')] })).toThrow(/operating system/);
  });

  it('falls back to the CPU model when the browser reports a constant instead of the GPU', () => {
    const parts = deriveProfileParts({
      rendering: [webkitBetaStamp()],
      physics: physicsStamp('Apple M3 Max', 'darwin 25.0.0', MACOS_27_BETA, { browser: 'webkit', browserVersion: '26.5' }),
    });

    expect(parts).toEqual({
      slug: 'm3-max-macos-27-beta-webkit',
      gpu: 'm3-max',
      os: 'macos-27-beta',
      browser: 'webkit',
      platform: { name: 'macos', version: 27, versionSource: 'declared', prerelease: true },
    });
  });

  it('refuses a rendering-only profile whose adapter names no machine, naming the domain that would', () => {
    expect(() => deriveProfileParts({ rendering: [webkitBetaStamp()] })).toThrow(ProfileSlugError);
    expect(() => deriveProfileParts({ rendering: [webkitBetaStamp()] })).toThrow(/--physics/);
  });

  it('refuses a profile whose platform established no major version, rather than naming a file without one', () => {
    const stamp = renderingStamp('nvidia blackwell', 'webgpu', { os: 'darwin 25.0.0', platformVersion: NO_VERSION });

    expect(() => deriveProfileParts({ rendering: [stamp] })).toThrow(/--platform=<major>\[-beta\]/);
  });

  it('marks a pre-release platform in the operating-system part, so a beta run cannot overwrite a shipping one', () => {
    const onShipping = physicsStamp('Apple M3 Max', 'darwin 25.0.0', MACOS_27_BETA);
    const onBeta: PhysicsStamp = { ...onShipping, prerelease: { value: true, source: 'declared', evidence: `the runner declared the platform as '27-beta'` } };

    expect(deriveProfileParts({ physics: onShipping }).slug).toBe('m3-max-macos-27-chromium');
    expect(deriveProfileParts({ physics: onBeta }).slug).toBe('m3-max-macos-27-beta-chromium');
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
