// Central package-policy verifier for the ExoJS monorepo. Pure Node (no build,
// no third-party deps) so it can run from any package or the root. Validates the
// published manifest shape of the official runtime packages and the private
// status of the config package.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** @typedef {{ ok: boolean, checks: { name: string, ok: boolean, detail?: string }[] }} PolicyResult */

const SOURCE_CONDITION_RE = /-source$/;

function read(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

/**
 * Verify an official runtime package (Core or an extension).
 * @param {string} dir absolute package directory
 * @param {{ name: string, isExtension: boolean, hasRegister?: boolean }} opts
 *   `hasRegister` defaults to `true`; set `false` for library-style extensions
 *   that have no `/register` subpath and ship `sideEffects: false`
 *   (e.g. @codexo/exojs-physics).
 * @returns {PolicyResult}
 */
export function verifyRuntimePackage(dir, opts) {
  const pkg = read(dir);
  const checks = [];
  const ok = (name, cond, detail) => checks.push({ name, ok: Boolean(cond), detail });

  ok('name matches', pkg.name === opts.name, `${pkg.name} vs ${opts.name}`);
  ok('type: module', pkg.type === 'module');
  ok('not private', pkg.private !== true);
  ok('has version', typeof pkg.version === 'string');
  ok('exports map', pkg.exports && typeof pkg.exports === 'object');
  ok('exports "." entry', pkg.exports?.['.']?.types && pkg.exports['.'].import);
  ok('exports ./package.json', pkg.exports?.['./package.json'] === './package.json');
  ok('files allowlist', Array.isArray(pkg.files) && pkg.files.length > 0);
  ok('files ship dist/esm', (pkg.files ?? []).some((f) => f.includes('dist/esm')));
  ok('ships LICENSE', (pkg.files ?? []).includes('LICENSE'));
  ok('publishConfig public', pkg.publishConfig?.access === 'public');
  ok('LICENSE file present', existsSync(join(dir, 'LICENSE')));
  ok('README present', existsSync(join(dir, 'README.md')));

  // No raw .ts runtime entries.
  const exportTargets = JSON.stringify(pkg.exports ?? {});
  ok('no raw .ts runtime entry', !/\.ts"/.test(exportTargets.replace(/\.d\.ts"/g, '')));
  // No @/ alias leak in the manifest.
  ok('no @/ alias in manifest', !JSON.stringify(pkg).includes('"@/'));
  // No workspace: protocol leak (would break a published tarball).
  ok('no workspace: in deps', !JSON.stringify(pkg.dependencies ?? {}).includes('workspace:'));

  // imports map: package-private `#` with a package-specific source condition.
  if (pkg.imports) {
    const star = pkg.imports['#*'];
    const conds = star && typeof star === 'object' ? Object.keys(star) : [];
    ok('imports `#*` conditional', conds.length > 0);
    ok('imports has package source condition', conds.some((c) => SOURCE_CONDITION_RE.test(c) || c === '@codexo/source'));
    ok('imports default -> dist', star?.default?.includes('dist/esm'));
  }

  if (opts.isExtension) {
    const hasRegister = opts.hasRegister !== false;
    ok('peer @codexo/exojs', Boolean(pkg.peerDependencies?.['@codexo/exojs']));
    ok('core dev dep', pkg.devDependencies?.['@codexo/exojs'] === 'workspace:*');
    ok('no production deps', !pkg.dependencies || Object.keys(pkg.dependencies).length === 0);
    if (hasRegister) {
      const reg = pkg.exports?.['./register'];
      ok('exposes /register', Boolean(reg?.import));
      ok('register side-effect declared', Array.isArray(pkg.sideEffects) && pkg.sideEffects.some((s) => s.includes('register')));
    } else {
      ok('library sideEffects: false', pkg.sideEffects === false);
    }
  } else {
    ok('Core sideEffects: false', pkg.sideEffects === false);
    ok('Core has no extension deps', !Object.keys({ ...pkg.dependencies }).some((d) => /^@codexo\/exojs-(particles|tiled)/.test(d)));
  }

  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * Verify the private shared-config package.
 * @param {string} dir
 * @returns {PolicyResult}
 */
export function verifyConfigPackage(dir) {
  const pkg = read(dir);
  const checks = [];
  const ok = (name, cond, detail) => checks.push({ name, ok: Boolean(cond), detail });
  ok('name @codexo/exojs-config', pkg.name === '@codexo/exojs-config');
  ok('private: true', pkg.private === true);
  ok('no publishConfig', pkg.publishConfig === undefined);
  ok('type: module', pkg.type === 'module');
  ok('no runtime @codexo/exojs dep', !pkg.dependencies?.['@codexo/exojs'] && !pkg.peerDependencies?.['@codexo/exojs']);
  ok('exposes tooling subpaths', Boolean(pkg.exports?.['./eslint'] && pkg.exports?.['./typescript/base.json']));
  ok('no vague root export', pkg.exports?.['.'] === undefined);
  return { ok: checks.every((c) => c.ok), checks };
}
