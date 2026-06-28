// Runs the central package-policy verifier (@codexo/exojs-config/package-policy)
// against every official runtime package plus the private config package.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyConfigPackage, verifyRuntimePackage } from '@codexo/exojs-config/package-policy';

import { LOCKSTEP_PACKAGES } from './release/lockstep-packages.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = LOCKSTEP_PACKAGES.map(p => ({
  dir: p.dir === '.' ? root : resolve(root, p.dir),
  name: p.name,
  isExtension: p.isExtension,
  hasRegister: p.hasRegister,
}));

let failed = 0;

for (const t of targets) {
  const { ok, checks } = verifyRuntimePackage(t.dir, { name: t.name, isExtension: t.isExtension, hasRegister: t.hasRegister ?? true });
  const bad = checks.filter(c => !c.ok);
  console.log(`${ok ? '✓' : '✗'} ${t.name} (${checks.length} checks${bad.length ? `, ${bad.length} failed` : ''})`);
  for (const c of bad) console.log(`    ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  if (!ok) failed++;
}

const cfg = verifyConfigPackage(resolve(root, 'packages/exojs-config'));
const cfgBad = cfg.checks.filter(c => !c.ok);
console.log(`${cfg.ok ? '✓' : '✗'} @codexo/exojs-config (${cfg.checks.length} checks${cfgBad.length ? `, ${cfgBad.length} failed` : ''})`);
for (const c of cfgBad) console.log(`    ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
if (!cfg.ok) failed++;

if (failed > 0) {
  console.error(`\nverify-package-policy: ${failed} package(s) failed policy.`);
  process.exit(1);
}
console.log('\nverify-package-policy: all packages pass policy.');
