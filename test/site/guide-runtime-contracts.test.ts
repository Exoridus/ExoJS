import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const GUIDE_DIR = join(ROOT, 'site', 'src', 'content', 'guide');
const EXAMPLES_DIR = join(ROOT, 'examples');

const walk = (dir: string, extension: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full, extension) : full.endsWith(extension) ? [full] : [];
  });

const where = (file: string, source: string, index: number): string =>
  `${relative(ROOT, file).replaceAll('\\', '/')}:${source.slice(0, index).split('\n').length}`;

const violations = (files: string[], pattern: RegExp): string[] =>
  files.flatMap(file => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(pattern)].map(match => where(file, source, match.index ?? 0));
  });

const guideCodeViolations = (pattern: RegExp): string[] =>
  guideFiles.flatMap(file => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(/```(?:ts|tsx)[^\n]*\n([\s\S]*?)```/g)].flatMap(fence =>
      [...(fence[1] ?? '').matchAll(pattern)].map(match => where(file, source, (fence.index ?? 0) + fence[0].indexOf(fence[1] ?? '') + (match.index ?? 0))),
    );
  });

const guideFiles = walk(GUIDE_DIR, '.mdx');
const exampleFiles = walk(EXAMPLES_DIR, '.ts').filter(file => !file.endsWith('.d.ts'));

describe('guide and example runtime contracts', () => {
  it('does not null-check the throwing, non-null Scene.app getter', () => {
    expect(violations(exampleFiles, /const app = this\.app;\s*if \(app === null/g)).toEqual([]);
  });

  it('uses logical application dimensions for scene layout', () => {
    const backingStoreLayout = /(?:\{[^}\n]*\b(?:width|height)\b[^}\n]*\}\s*=\s*(?:this\.)?app\.canvas|(?:this\.)?app\.canvas\.(?:width|height))/g;
    expect([...violations(exampleFiles, backingStoreLayout), ...guideCodeViolations(backingStoreLayout)]).toEqual([]);
  });

  it('does not pass constructed scene instances to Application.start', () => {
    const sceneInstanceStart = /const\s+(\w+)\s*=\s*new\s+\w*Scene\s*\([^;]*\);[\s\S]{0,160}?app\.start\(\1\)/g;
    expect(violations(guideFiles, sceneInstanceStart)).toEqual([]);
  });

  it('does not describe superseded scene and coordinate contracts', () => {
    const staleContract =
      /`Scene\.app` is `null`|app\.start\(\) expects a `Scene` instance|`scene\.currentScene|\(canvas\.width, canvas\.height\).*bottom-right/g;
    expect(violations(guideFiles, staleContract)).toEqual([]);
  });
});
