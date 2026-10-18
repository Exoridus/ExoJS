import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const packagePath = 'packages/create-exo-app';
const manifest = JSON.parse(readFileSync(join(root, packagePath, 'package.json'), 'utf8')) as { bin: Record<string, string> };
const entry = manifest.bin['create-exo-app'];

describe('create-exo-app executable', () => {
  it('can be linked from a fresh checkout before build scripts run', () => {
    const sourceFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', packagePath], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');

    expect(sourceFiles).toContain(`${packagePath}/${entry.replace(/^\.\//, '')}`);
    expect(readFileSync(join(root, packagePath, entry), 'utf8')).toMatch(/^#!\/usr\/bin\/env node\r?\n/);
  });

  it('loads the built CLI relative to its package and preserves arguments and exit status', () => {
    const directory = mkdtempSync(join(tmpdir(), 'exo-scaffolder-bin-'));

    try {
      const entryPath = join(directory, entry);
      mkdirSync(dirname(entryPath), { recursive: true });
      mkdirSync(join(directory, 'dist'), { recursive: true });
      writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n');
      writeFileSync(entryPath, readFileSync(join(root, packagePath, entry)));
      writeFileSync(join(directory, 'dist/index.js'), 'console.log(JSON.stringify(process.argv.slice(2))); process.exitCode = 23;\n');

      const args = ['app with spaces', '--template', 'minimal'];
      const result = spawnSync(process.execPath, [entryPath, ...args], { cwd: tmpdir(), encoding: 'utf8' });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(23);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual(args);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
