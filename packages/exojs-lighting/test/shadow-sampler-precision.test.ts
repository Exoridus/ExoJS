import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

describe('shadow sampler precision', () => {
  test.each(['light-quad.frag', 'sun-quad.frag'])('%s reads shadow depths at highp', file => {
    const source = readFileSync(resolve(__dirname, '../src/backends/shaders', file), 'utf8');

    expect(source).toMatch(/uniform\s+highp\s+sampler2D\s+u_shadow\s*;/);
  });
});
