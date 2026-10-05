// Runs the central package-policy verifier (@codexo/exojs-config/package-policy)
// against every official runtime package plus the private config package.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyCliPackage, verifyConfigPackage, verifyRuntimePackage, verifyToolingPackage } from '@codexo/exojs-config/package-policy';

import { LOCKSTEP_PACKAGES, TOOLING_PACKAGES } from './release/lockstep-packages.ts';

// The verifier is plain JavaScript (see `scripts/untyped-config-modules.d.ts`),
// so its result shape is named here - this script reads nothing else from it.
interface PolicyCheck {
  readonly ok: boolean;
  readonly name: string;
  readonly detail?: string;
}

interface PolicyResult {
  readonly ok: boolean;
  readonly checks: readonly PolicyCheck[];
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = LOCKSTEP_PACKAGES.map(p => ({
  dir: p.dir === '.' ? root : resolve(root, p.dir),
  name: p.name,
  isExtension: p.isExtension,
  profile: 'profile' in p ? p.profile : ('runtime' as const),
}));

let failed = 0;

for (const t of targets) {
  // A CLI entry point is judged as a CLI: it ships an executable and names the
  // engine as a peer, which the imported-library profile would call missing.
  const result: PolicyResult =
    t.profile === 'cli' ? verifyCliPackage(t.dir, { name: t.name }) : verifyRuntimePackage(t.dir, { name: t.name, isExtension: t.isExtension });
  const bad = result.checks.filter(c => !c.ok);
  console.log(`${result.ok ? '✓' : '✗'} ${t.name} (${result.checks.length} checks${bad.length ? `, ${bad.length} failed` : ''})`);
  for (const c of bad) console.log(`    ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  if (!result.ok) failed++;
}

// Published tooling: the same publish contract, judged against the tooling
// profile (no engine peer, no dependency on the private config).
for (const tooling of TOOLING_PACKAGES) {
  const result: PolicyResult = verifyToolingPackage(resolve(root, tooling.dir), { name: tooling.name });
  const bad = result.checks.filter(c => !c.ok);
  console.log(`${result.ok ? '✓' : '✗'} ${tooling.name} (${result.checks.length} checks${bad.length ? `, ${bad.length} failed` : ''})`);
  for (const c of bad) console.log(`    ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  if (!result.ok) failed++;
}

const cfg: PolicyResult = verifyConfigPackage(resolve(root, 'packages/exojs-config'));
const cfgBad = cfg.checks.filter(c => !c.ok);
console.log(`${cfg.ok ? '✓' : '✗'} @codexo/exojs-config (${cfg.checks.length} checks${cfgBad.length ? `, ${cfgBad.length} failed` : ''})`);
for (const c of cfgBad) console.log(`    ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
if (!cfg.ok) failed++;

if (failed > 0) {
  console.error(`\nverify-package-policy: ${failed} package(s) failed policy.`);
  process.exit(1);
}
console.log('\nverify-package-policy: all packages pass policy.');
