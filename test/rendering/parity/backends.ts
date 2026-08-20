/**
 * Backend construction for the parity properties.
 *
 * Wraps the shared test-backend helpers with the one thing a scene may need on
 * top of them: registering renderers that live outside the core binding set.
 * Every property goes through here, so a scene declaring `wireRenderers` is
 * honoured identically in all of them - putting that call in each property
 * instead would mean three places to forget it in.
 */

import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGl2TestBackend, createWebGpuTestBackend } from '../browser/_backendSetup';
import type { Scene } from './types';

export const openWebGl2 = async (scene: Scene): Promise<WebGl2Backend> => {
  const backend = await createWebGl2TestBackend(scene.size);

  scene.wireRenderers?.(backend);

  return backend;
};

export const openWebGpu = async (scene: Scene): Promise<WebGpuBackend> => {
  const backend = await createWebGpuTestBackend(scene.size);

  scene.wireRenderers?.(backend);

  return backend;
};
