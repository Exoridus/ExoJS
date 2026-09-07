import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TEMPLATES } from 'create-exo-app';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runCreate } from '../src/commands/create';

let workDir: string;
let previousCwd: string;

beforeEach(() => {
  previousCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'exo-create-'));
  process.chdir(workDir);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  process.chdir(previousCwd);
  vi.restoreAllMocks();
  rmSync(workDir, { recursive: true, force: true });
});

// `exo create` and `npm create exo-app` are the same scaffolder over the same
// templates; this asserts the delegation, not the template contents, which
// `verify:create-exo-app` covers.
describe('exo create', () => {
  test('scaffolds from the templates create-exo-app ships', async () => {
    await expect(runCreate(['my-game', '--template', 'minimal'])).resolves.toBe(0);

    expect(existsSync(join(workDir, 'my-game', 'src', 'main.ts'))).toBe(true);
    expect(JSON.parse(readFileSync(join(workDir, 'my-game', 'package.json'), 'utf8'))).toMatchObject({ name: 'my-game' });
  });

  test('offers the same template names as create-exo-app', () => {
    expect([...TEMPLATES]).toEqual(['minimal', 'game-starter', 'platformer', 'top-down', 'ui-app', 'audio-reactive']);
  });

  test('an unknown template lists the valid ones and exits non-zero', async () => {
    const errors: string[] = [];

    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(args.join(' ')));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    await expect(runCreate(['my-game', '--template', 'roguelike'])).rejects.toThrow('exit');

    expect(exit).toHaveBeenCalledWith(1);
    expect(errors).toContain('Error: unknown template "roguelike".');
    // Derived, not repeated: the assertion above pins WHICH templates exist, so
    // spelling them out again here would only pin the same list twice. What is
    // left to check is that the message lists them at all.
    expect(errors).toContain(`Valid templates: ${TEMPLATES.join(', ')}`);
  });

  test('refuses a non-empty directory without --force', async () => {
    await runCreate(['my-game', '--template', 'minimal']);

    const errors: string[] = [];

    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(args.join(' ')));
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    await expect(runCreate(['my-game', '--template', 'minimal'])).rejects.toThrow('exit');
    expect(errors).toContain('Error: directory "my-game" already exists and is not empty.');
    expect(errors).toContain('Use --force to overwrite.');
  });
});
