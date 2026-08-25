// Runs the central package-policy verifier (@codexo/exojs-config/package-policy)
// against every official runtime package plus the private config package.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyConfigPackage, verifyRuntimePackage, verifyToolingPackage } from '@codexo/exojs-config/package-policy';

import { INDEPENDENT_PACKAGES, LOCKSTEP_PACKAGES } from './release/lockstep-packages.ts';

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
}));

let failed = 0;

for (const t of targets) {
  const { ok, checks }: PolicyResult = verifyRuntimePackage(t.dir, { name: t.name, isExtension: t.isExtension });
  const bad = checks.filter(c => !c.ok);
  console.log(`${ok ? '✓' : '✗'} ${t.name} (${checks.length} checks${bad.length ? `, ${bad.length} failed` : ''})`);
  for (const c of bad) console.log(`    ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  if (!ok) failed++;
}

// Published build tooling: the same publish contract, judged against the
// tooling profile (no engine peer, no dependency on the private config).
const tooling = INDEPENDENT_PACKAGES.find(p => p.name === '@codexo/exojs-build');

if (tooling === undefined) {
  console.error('verify-package-policy: @codexo/exojs-build is missing from INDEPENDENT_PACKAGES.');
  process.exit(1);
}

const build: PolicyResult = verifyToolingPackage(resolve(root, tooling.dir), { name: tooling.name });
const buildBad = build.checks.filter(c => !c.ok);
console.log(`${build.ok ? '✓' : '✗'} ${tooling.name} (${build.checks.length} checks${buildBad.length ? `, ${buildBad.length} failed` : ''})`);
for (const c of buildBad) console.log(`    ✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
if (!build.ok) failed++;

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
