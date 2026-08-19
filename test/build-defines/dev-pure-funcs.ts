/**
 * Names of every exported function in `src/core/dev.ts` whose entire body is
 * gated by `if (__DEV__ ...)` - the functions a production build reduces to
 * side-effect-free no-ops. The real production build (Rolldown) infers this
 * automatically once `__DEV__` is replaced with `false`, needing no such list;
 * the synthetic Rollup+terser pipelines a few tests use to model production
 * minification still need one explicitly, which is what this derives.
 *
 * Derived from the real source rather than hard-coded, so a renamed or newly
 * `__DEV__`-gated helper updates every test that depends on this list without
 * a second edit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname!, '..', '..');

const EXPORTED_FUNCTION = /export function (\w+)(?:<[^>]*>)?\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;
const DEV_GATED_BODY = /^\s*if\s*\(\s*__DEV__/;

export function devGatedPureFuncs(): string[] {
  const source = readFileSync(resolve(rootDir, 'src/core/dev.ts'), 'utf8');
  const names: string[] = [];

  for (const match of source.matchAll(EXPORTED_FUNCTION)) {
    const [, name, body] = match;
    if (DEV_GATED_BODY.test(body!)) names.push(name!);
  }

  return names;
}
