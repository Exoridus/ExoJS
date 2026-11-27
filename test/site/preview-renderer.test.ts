import { describe, expect, it } from 'vitest';

import { readRendererStatus, rendererLabel } from '../../site/src/lib/preview-renderer';

describe('reported renderer state', () => {
  it('never treats selection or capability as an initialized renderer', () => {
    expect(readRendererStatus({ requested: 'webgpu', phase: 'initializing', actual: 'webgpu', reason: null })).toBeNull();
    expect(readRendererStatus({ requested: 'auto', phase: 'active', actual: null, reason: null })).toBeNull();
    expect(readRendererStatus(null)).toBeNull();
    expect(rendererLabel(null)).toBe('Renderer not reported');
    expect(rendererLabel({ requested: 'webgpu', phase: 'initializing', actual: null, reason: null })).toBe('Renderer initializing');
  });
  it('keeps auto fallback and original failure separate from successful initialization', () => {
    const fallback = readRendererStatus({ requested: 'auto', phase: 'fallback', actual: 'webgl2', reason: 'WebGPU initialization failed' });
    expect(rendererLabel(fallback)).toBe('WebGL2 (fallback)');
    expect(fallback?.reason).toBe('WebGPU initialization failed');
    expect(rendererLabel({ requested: 'webgpu', phase: 'failed', actual: null, reason: 'No adapter' })).toBe('Renderer failed');
  });
});
