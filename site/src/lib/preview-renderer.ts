import type { ExampleRendererStatus } from '../../../examples/shared/runtime';

export const readRendererStatus = (value: unknown): ExampleRendererStatus | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const state = value as Record<string, unknown>;

  if (
    typeof state.requested !== 'string' ||
    !['unknown', 'auto', 'webgl2', 'webgpu'].includes(state.requested) ||
    typeof state.phase !== 'string' ||
    !['requested', 'initializing', 'active', 'fallback', 'failed'].includes(state.phase)
  ) {
    return null;
  }

  const initialized = state.phase === 'active' || state.phase === 'fallback';

  if (initialized ? state.actual !== 'webgl2' && state.actual !== 'webgpu' : state.actual !== null) {
    return null;
  }

  if (state.reason !== null && typeof state.reason !== 'string') {
    return null;
  }

  return { requested: state.requested, phase: state.phase, actual: state.actual, reason: state.reason } as ExampleRendererStatus;
};

export const rendererLabel = (state: ExampleRendererStatus | null): string => {
  if (!state) {
    return 'Renderer not reported';
  }

  if (state.phase === 'failed') {
    return 'Renderer failed';
  }

  if (state.phase === 'requested') {
    return 'Renderer requested';
  }

  if (state.phase === 'initializing') {
    return 'Renderer initializing';
  }

  return `${state.actual === 'webgpu' ? 'WebGPU' : 'WebGL2'}${state.phase === 'fallback' ? ' (fallback)' : ''}`;
};
