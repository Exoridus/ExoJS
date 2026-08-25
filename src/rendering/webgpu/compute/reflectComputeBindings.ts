/// <reference types="@webgpu/types" />

import type { ComputeBinding } from './WebGpuComputePipeline';

/**
 * Derives the `bindingGroups` shape {@link WebGpuComputePipeline.create} expects directly from
 * a WGSL compute shader's own `@group(N) @binding(M)` declarations, instead of hand-writing a
 * parallel `ComputeBinding[][]` that has to be kept in sync with the shader text by hand.
 *
 * Deliberately narrow - this is NOT a general WGSL parser. No expression/statement parsing, no
 * auto-assignment of group/binding numbers (unlike e.g. PlayCanvas's WGSL processor, which lets
 * shaders omit `@group`/`@binding` entirely and assigns them itself), no uniform-buffer member
 * byte-offset computation (that stays a JS-side concern - see `WgslContribution`/
 * `wgslUniformByteSize` in `@codexo/exojs-particles`). It only reads resource declarations that
 * already carry explicit `@group`/`@binding` attributes, the convention every ExoJS-authored
 * compute shader already follows.
 *
 * `f32`-sampled textures (`texture_1d<f32>`, `texture_2d<f32>`, ...) and plain `sampler`
 * bindings are ambiguous between WebGPU's filterable and non-filterable variants - that
 * distinction depends on the actual `GPUTextureFormat` bound at runtime (e.g. `r32float` is
 * unfilterable, `rgba8unorm` is not), which isn't expressible in the WGSL declaration itself.
 * Defaults to filterable (`'float'` / `'filtering'`); pass `nonFilteringResources` (a set of the
 * WGSL variable names involved) to override per-resource.
 *
 * Comments are stripped before matching. Block-comment stripping is NOT nesting-aware (WGSL
 * technically permits nested `/*` `*` `/` comments) - fine for engine-generated shader text,
 * which never nests comments; a hand-authored shader that does would need manual
 * `ComputeBinding[][]` instead.
 */
export const reflectComputeBindings = (wgsl: string, options?: { nonFilteringResources?: ReadonlySet<string> }): ComputeBinding[][] => {
  const nonFiltering = options?.nonFilteringResources ?? new Set<string>();
  const source = stripComments(wgsl);
  const groups: ComputeBinding[][] = [];

  const push = (groupIndex: number, binding: ComputeBinding): void => {
    (groups[groupIndex] ??= []).push(binding);
  };

  for (const m of source.matchAll(uniformBufferDecl)) {
    push(Number(m[1]), { kind: 'buffer', binding: Number(m[2]), type: 'uniform' });
  }

  for (const m of source.matchAll(storageBufferDecl)) {
    const readOnly = m[3] === 'read';

    push(Number(m[1]), { kind: 'buffer', binding: Number(m[2]), type: readOnly ? 'storage-read' : 'storage' });
  }

  for (const m of source.matchAll(samplerDecl)) {
    const name = m[3]!;
    const comparison = m[4] === 'sampler_comparison';

    push(Number(m[1]), { kind: 'sampler', binding: Number(m[2]), type: samplerTypeFor(comparison, nonFiltering.has(name)) });
  }

  for (const m of source.matchAll(textureDecl)) {
    const name = m[3]!;
    const viewDimension = textureViewDimensions.get(m[4]!)!;
    const component = m[5]!;

    push(Number(m[1]), { kind: 'texture', binding: Number(m[2]), viewDimension, sampleType: sampleTypeFor(component, nonFiltering.has(name)) });
  }

  for (const m of source.matchAll(storageTextureDecl)) {
    const viewDimension = storageTextureViewDimensions.get(m[4]!)!;
    const format = m[5] as GPUTextureFormat;

    push(Number(m[1]), { kind: 'storageTexture', binding: Number(m[2]), access: storageAccessFor(m[6]!), format, viewDimension });
  }

  return Array.from({ length: groups.length }, (_, i) => [...(groups[i] ?? [])].sort((a, b) => a.binding - b.binding));
};

const samplerTypeFor = (comparison: boolean, nonFiltering: boolean): GPUSamplerBindingType => {
  if (comparison) return 'comparison';

  return nonFiltering ? 'non-filtering' : 'filtering';
};

const sampleTypeFor = (component: string, nonFiltering: boolean): GPUTextureSampleType => {
  if (component === 'i32') return 'sint';
  if (component === 'u32') return 'uint';

  return nonFiltering ? 'unfilterable-float' : 'float';
};

const storageAccessFor = (accessToken: string): GPUStorageTextureAccess => {
  if (accessToken === 'write') return 'write-only';
  if (accessToken === 'read') return 'read-only';

  return 'read-write';
};

const stripComments = (source: string): string => source.replaceAll(/\/\/.*$/gm, '').replaceAll(/\/\*[\s\S]*?\*\//g, '');

// Buffer declarations never need their WGSL type text - only the storage class matters for a
// `ComputeBinding`, so these stop at `:` rather than chasing the type through to `;`.
const uniformBufferDecl = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var\s*<uniform>\s*(\w+)\s*:/g;
const storageBufferDecl = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var\s*<storage\s*,\s*(read_write|read)\s*>\s*(\w+)\s*:/g;
const samplerDecl = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var\s+(\w+)\s*:\s*(sampler_comparison|sampler)\s*;/g;
const textureDecl =
  /@group\((\d+)\)\s*@binding\((\d+)\)\s*var\s+(\w+)\s*:\s*(texture_1d|texture_2d|texture_2d_array|texture_3d|texture_cube|texture_cube_array)<(f32|i32|u32)>\s*;/g;
const storageTextureDecl =
  /@group\((\d+)\)\s*@binding\((\d+)\)\s*var\s+(\w+)\s*:\s*(texture_storage_1d|texture_storage_2d|texture_storage_2d_array|texture_storage_3d)<([\w-]+)\s*,\s*(read_write|read|write)\s*>\s*;/g;

const textureViewDimensions = new Map<string, GPUTextureViewDimension>([
  ['texture_1d', '1d'],
  ['texture_2d', '2d'],
  ['texture_2d_array', '2d-array'],
  ['texture_3d', '3d'],
  ['texture_cube', 'cube'],
  ['texture_cube_array', 'cube-array'],
]);

const storageTextureViewDimensions = new Map<string, GPUTextureViewDimension>([
  ['texture_storage_1d', '1d'],
  ['texture_storage_2d', '2d'],
  ['texture_storage_2d_array', '2d-array'],
  ['texture_storage_3d', '3d'],
]);
