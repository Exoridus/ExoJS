import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const manifest = require.resolve('oxlint/package.json');
const configPath = resolve(process.cwd(), 'scripts/ci/oxlint-react-shadow.json');
const oxlintBin = resolve(dirname(manifest), 'bin/oxlint');
const fixtures = [
  {
    id: 'react/rules-of-hooks',
    invalid: "import { useState } from 'react'; function App({ enabled }) { if (enabled) { useState(0); } return null; }",
  },
  {
    id: 'react/exhaustive-deps',
    invalid: "import { useEffect } from 'react'; function App(props) { useEffect(() => { console.log(props.name); }, []); return null; }",
  },
  {
    id: 'jsx-a11y/alt-text',
    invalid: 'const App = () => <img src="example.png" />;',
  },
] as const;

const clean = 'export const value = 1;\n';

const diagnostics = (source: string): string[] => {
  const directory = mkdtempSync(join(tmpdir(), 'exojs-react-oxlint-'));
  const file = join(directory, 'fixture.tsx');

  try {
    writeFileSync(file, source);

    const result = spawnSync(process.execPath, [oxlintBin, '--format=json', '-c', configPath, '--no-ignore', file], {
      encoding: 'utf8',
      cwd: process.cwd(),
    });

    if (result.error) {
      throw result.error;
    }

    expect([0, 1]).toContain(result.status);

    const output = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };

    return output.diagnostics.map(item => item.code.replace(/^([^()]+)\(([^()]+)\)$/u, '$1/$2'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('native React Oxlint shadow', () => {
  for (const fixture of fixtures) {
    it(`reports ${fixture.id} on a negative fixture`, () => {
      expect(diagnostics(fixture.invalid)).toContain(fixture.id);
      expect(diagnostics(clean)).toEqual([]);
    });
  }
});
