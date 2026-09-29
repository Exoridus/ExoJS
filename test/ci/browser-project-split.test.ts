import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The WebGPU Core / Media split is a glob in `vitest.config.ts`, and a glob
 * silently stops describing the specs it was written for when a file is added
 * or renamed. This ties it back to what the specs actually do: a spec that
 * drives the browser media stack must be in the media project, and nothing
 * else may be.
 */

const repoRoot = resolve(import.meta.dirname!, '../..');
const browserDir = resolve(repoRoot, 'test/rendering/browser');
const config = readFileSync(resolve(repoRoot, 'vitest.config.ts'), 'utf8');

const mediaGlob = /const webgpuMediaTests = \['test\/rendering\/browser\/([^']+)'\]/.exec(config)?.[1];
const globToRegExp = (glob: string): RegExp => new RegExp(`^${glob.replaceAll('.', String.raw`\.`).replaceAll('*', '[^/]*')}$`);

const MEDIA_API = /captureStream|createElement\('video'\)|importExternalTexture|_videoFixture|HTMLVideoElement/;

const webgpuSpecs = readdirSync(browserDir).filter(name => /^webgpu-.*\.test\.ts$/.test(name));

describe('WebGPU Core / Media project split', () => {
  it('declares a media glob', () => {
    expect(mediaGlob).toBeDefined();
  });

  const isMedia = (name: string): boolean => globToRegExp(mediaGlob!).test(name);

  it.each(webgpuSpecs)('%s is in the project its use of media APIs calls for', name => {
    const usesMedia = MEDIA_API.test(readFileSync(resolve(browserDir, name), 'utf8'));

    expect(isMedia(name)).toBe(usesMedia);
  });

  it('keeps at least one spec in each project', () => {
    expect(webgpuSpecs.some(isMedia)).toBe(true);
    expect(webgpuSpecs.some(name => !isMedia(name))).toBe(true);
  });

  it('gives the media projects serial files and the Core projects no media glob', () => {
    expect(config).toMatch(/name: 'browser-webgpu-media',[\s\S]*?fileParallelism: false/);
    expect(config).toMatch(/name: 'browser-webgpu-firefox-media',[\s\S]*?fileParallelism: false/);
    expect(config).toContain('const webgpuCoreExclude = [...configDefaults.exclude, ...webgpuMediaTests];');
  });
});
