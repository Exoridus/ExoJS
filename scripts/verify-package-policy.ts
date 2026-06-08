// Runs the central package-policy verifier (@codexo/exojs-config/package-policy)
// against every official runtime package plus the private config package.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyConfigPackage, verifyRuntimePackage } from '@codexo/exojs-config/package-policy';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { dir: root, name: '@codexo/exojs', isExtension: false },
  { dir: resolve(root, 'packages/exojs-particles'), name: '@codexo/exojs-particles', isExtension: true },
  { dir: resolve(root, 'packages/exojs-tiled'), name: '@codexo/exojs-tiled', isExtension: true },
];

let failed = 0;

for (const t of targets) {
  const { ok, checks } = verifyRuntimePackage(t.dir, { name: t.name, isExtension: t.isExtension });
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
