import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const sourceRoot = resolve(__dirname, '../src');

/** Relative specifiers a module pulls in for their values, not just their types. */
const valueImports = (file: string): string[] => {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];

  for (const match of source.matchAll(/^import\s+(type\s+)?([^;]*?)from\s*'(\.[^']*)';$/gm)) {
    // `import type { X }` links nothing, and neither does a clause whose every
    // binding is marked `type` - which is what lets the abstract base name the
    // backend contract without linking a backend.
    if (match[1] !== undefined) {
      continue;
    }

    const clause = match[2]!;
    const bindings = clause
      .trim()
      .replace(/^\{|\}$/g, '')
      .split(',');

    if (clause.includes('{') && bindings.every(binding => binding.trim() === '' || binding.trim().startsWith('type '))) {
      continue;
    }

    found.push(match[3]!);
  }

  return found;
};

const resolveSpecifier = (from: string, specifier: string): string | null => {
  const base = resolve(dirname(from), specifier);

  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) {
      return candidate;
    }
  }

  return null;
};

/** Every module linked by importing `entry`, as paths relative to `src`. */
const linkedBy = (entry: string): Set<string> => {
  const seen = new Set<string>();
  const queue = [resolve(sourceRoot, entry)];

  while (queue.length > 0) {
    const file = queue.pop()!;
    const key = relative(sourceRoot, file).replaceAll('\\', '/');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (!file.endsWith('.ts')) {
      continue;
    }

    for (const specifier of valueImports(file)) {
      const target = resolveSpecifier(file, specifier);

      if (target !== null) {
        queue.push(target);
      }
    }
  }

  return seen;
};

/** What only a renderer that walks this frame's geometry may link. */
const walkOnly = [
  'backends/RadianceBackend.ts',
  'backends/radianceField.ts',
  'backends/transportGeometry.ts',
  'backends/transportShaders.ts',
  'backends/transportTextures.ts',
  'backends/maskBlocks.ts',
  'backends/shaders/transport.frag',
  'backends/shaders/transport.wgsl',
  'backends/shaders/cascade-transport.frag',
  'backends/shaders/cascade-gather-transport.frag',
  'backends/shaders/mask-blocks.frag',
] as const;

describe('lighting import graph', () => {
  test('the cascades and the tables they walk are linked only by the system that walks', () => {
    const radiance = linkedBy('RadianceLighting.ts');

    // Asserted first, so a renamed module cannot make the exclusions below
    // pass by leaving every graph empty.
    for (const module of walkOnly) {
      expect({ module, linked: radiance.has(module) }).toEqual({ module, linked: true });
    }

    for (const entry of ['ForwardLighting.ts', 'LightmapLighting.ts']) {
      const linked = linkedBy(entry);

      expect(linked.size).toBeGreaterThan(3);
      expect([...linked].filter(module => walkOnly.includes(module as (typeof walkOnly)[number]))).toEqual([]);
    }
  });

  test('the forward system links neither frame composition nor the shadow rows', () => {
    const forward = linkedBy('ForwardLighting.ts');

    for (const module of ['backends/FrameLightingBackend.ts', 'backends/LightmapBackend.ts', 'occluders/shadowMap.ts', 'backends/shadowMarch.ts']) {
      expect({ module, linked: forward.has(module) }).toEqual({ module, linked: false });
    }

    expect(forward.has('backends/ForwardBackend.ts')).toBe(true);
  });

  test('the abstract base names a backend without linking one', () => {
    const base = linkedBy('Lighting.ts');

    for (const module of ['backends/ForwardBackend.ts', 'backends/FrameLightingBackend.ts', 'backends/RadianceBackend.ts']) {
      expect({ module, linked: base.has(module) }).toEqual({ module, linked: false });
    }
  });
});
