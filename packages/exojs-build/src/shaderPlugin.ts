// Rollup/Vite plugin that loads shader files (`.vert`, `.frag`, `.wgsl`) as JS
// string modules.
//
// The engine's rendering APIs - `ShaderFilter`, `ShaderSource`, `MeshMaterial`,
// `SpriteMaterial`, the WebGPU compute pipeline - all take shader source as a
// `string`. Without a loader that string has to be an inline template literal,
// which puts the shader outside every editor language service, formatter and
// shader-aware tool. This plugin is what lets the same source live in a real
// `.vert`/`.frag`/`.wgsl` file and still arrive at those APIs as a string.
//
// Nothing is emitted as a separate asset and nothing is fetched at runtime: the
// text ends up inside the bundle, which is also why `minify` exists (see
// `./shaderStrip.ts` for what it removes and why that is safe).
//
// The file is the module, so no `resolveId` hook is needed and the bundler's
// own watch already covers it - unlike the worklet and worker plugins, whose
// output depends on files that never enter the module graph.
import { readFileSync } from 'node:fs';

import type { SourcePlugin } from './pluginTypes.js';
import { isShaderId, stripShaderSource } from './shaderStrip.js';

export interface ShaderPluginOptions {
  /**
   * Strip comments and layout whitespace from the emitted source.
   *
   * Off by default, which keeps the shipped text readable in dev servers, in
   * driver compile logs and in stack traces. Turn it on for production builds:
   * shader text sits inside a string literal, which no JavaScript minifier
   * descends into, so every comment in a shader is bytes every visitor
   * downloads.
   *
   * The transform never changes program meaning - it is not a shader
   * optimizer, and there is deliberately no option that would make it one.
   */
  minify?: boolean;
}

/**
 * Loads `.vert`, `.frag` and `.wgsl` files as modules with a default-exported
 * source string.
 *
 * Only a bare import is claimed. An import carrying any query - `?raw`, `?url`,
 * `?inline`, anything else - is left to the bundler, so Vite's own asset
 * semantics keep working alongside this plugin and a build can still ask for a
 * shader as a URL.
 *
 * Included in the `exojs()` preset; construct it directly only to give shaders
 * different options from the worklet and worker plugins.
 */
export const createShaderPlugin = ({ minify = false }: ShaderPluginOptions = {}): SourcePlugin => ({
  name: 'exojs-shader-source',
  load(id: string): string | null {
    // A query means the importer asked for some other representation. Vite
    // resolves `?raw` and `?url` in a core plugin that runs ahead of this
    // one, so claiming them here would only change what Rollup does - and a
    // difference between the two bundlers is exactly what must not exist.
    if (id.includes('?') || !isShaderId(id)) return null;

    const source = readFileSync(id, 'utf8');

    return `export default ${JSON.stringify(minify ? stripShaderSource(source) : source)};`;
  },
});
