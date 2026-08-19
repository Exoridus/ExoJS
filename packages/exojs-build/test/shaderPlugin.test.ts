// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createShaderPlugin } from '../src/index.ts';
import type { SourcePlugin } from '../src/pluginTypes.ts';

/**
 * The shader plugin's contract, stated as behaviour: what it claims, what it
 * deliberately does not claim, and what it is allowed to change about the text.
 *
 * The boundary matters more than the transform. A loader that claimed every id
 * ending in a shader extension would silently take `?raw` and `?url` away from
 * the bundler, so a consumer asking for a URL would receive source instead -
 * with no error anywhere.
 *
 * The fixtures are the same three files the packed-consumer spec builds, so
 * this spec and that one cannot disagree about what a shader looks like.
 */
const fixtureDirectory = join(import.meta.dirname, 'fixtures', 'consumer', 'shader-example');

const fixture = (name: string): string => join(fixtureDirectory, name);

const load = (plugin: SourcePlugin, id: string): string | null => plugin.load.call({}, id);

/** The string a loaded shader module default-exports. */
const sourceFromModule = (moduleCode: string): string => {
  const match = /^export default (.*);$/s.exec(moduleCode);

  expect(match, 'plugin output is not a single default-exported string').not.toBeNull();

  return JSON.parse(match![1]!) as string;
};

describe('createShaderPlugin', () => {
  it('loads each shader extension as a default-exported string', () => {
    const plugin = createShaderPlugin();

    for (const name of ['demo.vert', 'demo.frag', 'demo.wgsl']) {
      const loaded = load(plugin, fixture(name));

      expect(loaded, `${name} was not claimed`).not.toBeNull();
      expect(typeof sourceFromModule(loaded!)).toBe('string');
    }
  });

  it('emits the file verbatim by default', () => {
    expect(sourceFromModule(load(createShaderPlugin(), fixture('demo.frag'))!)).toBe(readFileSync(fixture('demo.frag'), 'utf8'));
  });

  it('removes comments under `minify` without touching the code', () => {
    const minified = sourceFromModule(load(createShaderPlugin({ minify: true }), fixture('demo.frag'))!);

    expect(minified).not.toContain('exojs-build-demo-fragment');
    // `#version` must still own the first line, and every statement has to
    // survive with its tokens still apart.
    expect(minified.split('\n')[0]).toBe('#version 300 es');
    expect(minified).toContain('precision mediump float;');
    expect(minified).toContain('fragColor = vec4(vUv, abs(sin(u_time)), 1.0);');
  });

  it('leaves an import that carries a query to the bundler', () => {
    const plugin = createShaderPlugin();

    for (const query of ['?raw', '?url', '?inline', '?worker&type=classic']) {
      expect(load(plugin, `${fixture('demo.frag')}${query}`), `${query} was claimed`).toBeNull();
    }
  });

  it('claims nothing else', () => {
    expect(load(createShaderPlugin(), fixture('main.ts'))).toBeNull();
  });
});
