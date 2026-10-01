import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyRealConsumers } from './create-exo-app-consumers.ts';
import { runTypeScriptCompiler } from '@codexo/exojs-config/typescript/compiler';

// The package's public entry, by path: 'create-exo-app' is not a root
// dependency, and this script is a root script.
import { TEMPLATES as SCAFFOLDER_TEMPLATES } from '../packages/create-exo-app/src/scaffold.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..');
const tmpRoot = join(rootDir, '.workspace', 'tmp', 'create-exo-app');
const cliSrc = join(rootDir, 'packages', 'create-exo-app', 'src', 'index.ts');
const templatesDir = join(rootDir, 'packages', 'create-exo-app', 'templates');

/**
 * The placeholder an `@codexo/*` dependency carries in a template. The
 * scaffolder rewrites it to its own release line, so a template never holds an
 * engine version that could drift from the scaffolder that ships it.
 */
const LOCKSTEP_PLACEHOLDER = 'lockstep';

/** The range a scaffolded project must actually receive. */
const engineRange = (): string => {
  const own = JSON.parse(readFileSync(join(rootDir, 'packages', 'create-exo-app', 'package.json'), 'utf-8')) as { version: string };
  const match = /^(\d+)\.(\d+)\./.exec(own.version);
  if (!match) throw new Error(`create-exo-app has an unparseable version "${own.version}".`);
  return `${match[1]}.${match[2]}.x`;
};

// Imported rather than repeated: a second list here would pass while the
// scaffolder offered something else entirely.
const TEMPLATES = SCAFFOLDER_TEMPLATES;
type TemplateName = (typeof TEMPLATES)[number];

/** Resolved once: every scaffolded project must land on exactly this line. */
const expectedEngineRange = engineRange();

const EXPECTED_FILES: Record<TemplateName, string[]> = {
  minimal: ['index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'src/main.ts', 'src/scenes/MainScene.ts'],
  'game-starter': [
    'index.html',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'src/main.ts',
    'src/scenes/GameScene.ts',
    'src/scenes/GameOverScene.ts',
    'src/objects/Player.ts',
  ],
  platformer: [
    'index.html',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'src/main.ts',
    'src/objects/Player.ts',
    'src/scenes/PlatformerScene.ts',
    'public/assets/platformer-characters.png',
    'public/assets/platformer-tiles.png',
    'public/assets/ART-LICENSE.txt',
  ],
  'top-down': [
    'index.html',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'src/main.ts',
    'src/level.ts',
    'src/scenes/TopDownScene.ts',
    'src/scenes/ProceduralMapScene.ts',
    'src/scenes/TiledMapScene.ts',
    'public/assets/map-pack.png',
    'public/assets/town-square.tmj',
    'public/assets/ART-LICENSE.txt',
  ],
  'ui-app': ['index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'src/main.ts', 'src/scenes/SettingsScene.ts'],
  'audio-reactive': ['index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'src/main.ts', 'src/scenes/AudioReactiveScene.ts'],
};

// Patterns that indicate stale API usage
const FORBIDDEN_PATTERNS = [
  { pattern: /draw\s*\(\s*backend\s*\)/, label: 'draw(backend)' },
  { pattern: /backend\.clear\(\)(?!\s*;)/, label: 'bare backend.clear() outside context' },
  { pattern: /\.render\s*\(\s*backend\s*\)/, label: '.render(backend)' },
  { pattern: /new Application\s*\(\s*\{\s*width/, label: 'new Application({ width ... })' },
  { pattern: /@codexo\/exojs-debug/, label: '@codexo/exojs-debug import' },
];

let passed = 0;
let failed = 0;

const ok = (msg: string): void => {
  console.log(`  ✓ ${msg}`);
  passed++;
};

const fail = (msg: string): void => {
  console.error(`  ✗ ${msg}`);
  failed++;
};

const check = (condition: boolean, okMsg: string, failMsg: string): void => {
  if (condition) {
    ok(okMsg);
  } else {
    fail(failMsg);
  }
};

/** Indents a multi-line diagnostic so it stays under its own check line. */
const indent = (text: string): string =>
  text
    .split('\n')
    .map(line => `      ${line}`)
    .join('\n');

console.log('\n=== verify:create-exo-app ===\n');

// 1. CLI file exists
console.log('1. CLI source exists');
check(existsSync(cliSrc), 'src/index.ts found', 'src/index.ts missing');

// 2. All templates present
console.log('\n2. Template directories');
for (const t of TEMPLATES) {
  check(existsSync(join(templatesDir, t)), `templates/${t}/ exists`, `templates/${t}/ missing`);
}

// 3. Scaffold each template
console.log('\n3. Scaffold each template (non-TTY, --force)');
for (const t of TEMPLATES) {
  const destDir = join(tmpRoot, t);
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }

  try {
    execSync(`node --import tsx/esm "${cliSrc}" "${destDir}" --template ${t} --force`, { stdio: 'pipe', env: { ...process.env, FORCE_COLOR: '0' } });
    ok(`scaffold ${t} → .workspace/tmp/create-exo-app/${t}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`scaffold ${t} failed: ${msg}`);
  }
}

// 4. Expected files present
console.log('\n4. Expected files in scaffolded projects');
for (const t of TEMPLATES) {
  const destDir = join(tmpRoot, t);
  for (const file of EXPECTED_FILES[t]) {
    check(existsSync(join(destDir, file)), `${t}/${file}`, `${t}/${file} missing`);
  }
}

// 5. Valid package.json
console.log('\n5. Valid package.json in scaffolded projects');
for (const t of TEMPLATES) {
  const pkgPath = join(tmpRoot, t, 'package.json');
  try {
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { name?: unknown };
    const validName = typeof pkg.name === 'string' && pkg.name === t;
    ok(`${t}/package.json is valid JSON, name="${String(pkg.name)}"`);
    if (!validName) {
      fail(`${t}/package.json name should be "${t}", got "${String(pkg.name)}"`);
    }
  } catch {
    fail(`${t}/package.json is not valid JSON`);
  }
}

// 6. No forbidden API patterns in template source files
console.log('\n6. No forbidden API patterns in template sources');
for (const t of TEMPLATES) {
  const srcDir = join(templatesDir, t, 'src');
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    try {
      const result = execSync(
        `node --input-type=module --eval "
          import{readdirSync,readFileSync,statSync}from'node:fs';
          import{join}from'node:path';
          function scan(dir){
            for(const e of readdirSync(dir)){
              const p=join(dir,e);
              if(statSync(p).isDirectory()){scan(p);}
              else if(p.endsWith('.ts')){
                const c=readFileSync(p,'utf-8');
                if(${pattern}.test(c)){process.stdout.write(p+'\\n');}
              }
            }
          }
          scan('${srcDir.replace(/\\/g, '\\\\')}');
        "`,
        { encoding: 'utf-8', stdio: 'pipe' },
      ).trim();
      if (result) {
        fail(`${t}: found "${label}" in ${result}`);
      } else {
        ok(`${t}: no "${label}"`);
      }
    } catch {
      ok(`${t}: no "${label}"`);
    }
  }
}

// 7. Template sources carry no engine version; scaffolded projects carry the
//    scaffolder's own release line
console.log('\n7. Template @codexo dependencies');
const seenCoreRanges = new Set<string>();
for (const t of TEMPLATES) {
  // The template source, before scaffolding. A version here would be a second
  // place the engine release is written down, and the one that goes stale: the
  // release cut bumps package versions, not template text.
  const sourcePkg = JSON.parse(readFileSync(join(templatesDir, t, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const [name, range] of Object.entries({ ...sourcePkg.dependencies, ...sourcePkg.devDependencies }).filter(([dep]) => dep.startsWith('@codexo/'))) {
    check(
      range === LOCKSTEP_PLACEHOLDER,
      `templates/${t}: ${name} holds the "${LOCKSTEP_PLACEHOLDER}" placeholder`,
      `templates/${t}: ${name} is pinned to "${range}" in template source — the engine version belongs in one place, the scaffolder's own version`,
    );
  }
}

for (const t of TEMPLATES) {
  const pkgPath = join(tmpRoot, t, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { dependencies?: Record<string, string> };
    const coreRange = pkg.dependencies?.['@codexo/exojs'];

    if (coreRange === undefined) {
      fail(`${t}: missing @codexo/exojs dependency`);
      continue;
    }

    seenCoreRanges.add(coreRange);

    // Every extension a template pulls in is published on the engine's cadence,
    // so the scaffolder pins all of them to its own release line. A template
    // that carried a version of its own would scaffold a project mixing versions
    // as soon as either side moved, which is why the template source holds a
    // placeholder and the range is written here.
    for (const [name, range] of Object.entries(pkg.dependencies ?? {}).filter(([dependency]) => dependency.startsWith('@codexo/'))) {
      check(
        range === expectedEngineRange,
        `${t}: ${name} "${range}" ✓`,
        `${t}: ${name} is "${range}", expected the scaffolder's own line "${expectedEngineRange}" — every ExoJS dependency moves together`,
      );
      check(
        !range.startsWith('workspace:'),
        `${t}: ${name} has no workspace: protocol`,
        `${t}: ${name} uses workspace: protocol ("${range}") — not publishable`,
      );
    }
  } catch {
    fail(`${t}: could not read scaffolded package.json dependency`);
  }
}
check(
  seenCoreRanges.size === 1,
  `all templates agree on one core range (${[...seenCoreRanges].join(', ')})`,
  `templates disagree on core range: ${[...seenCoreRanges].join(', ')}`,
);

// 8. Template sources compile against the engine in this working tree
//
// A scaffolded project resolves `@codexo/exojs` from npm, so on its own a
// template only meets the engine when a user runs it - after the release that
// broke it. `tsconfig.templates.json` compiles the template sources against the
// workspace sources instead. It is in the `typecheck` gate group as well, which
// covers an engine change; running it here is what covers the other direction,
// a templates-only change, which routes to this script's lane and not to that
// one.
console.log('\n8. Template sources type-check against the workspace engine');
{
  const result = runTypeScriptCompiler(['--noEmit', '-p', 'tsconfig.templates.json'], { cwd: rootDir, stdio: 'pipe' });
  if (result.status === 0) {
    ok('tsc --noEmit -p tsconfig.templates.json');
  } else {
    fail(`template type-check failed:\n${result.output.trim() || `tsc exit ${result.status}`}`);
  }
}

// 9. The generated projects really install and build
//
// Step 8 compiles the template sources against the engine's *sources*. A user
// installs a package and resolves its *declarations*, so a template can pass step 8
// and still not build. That is not hypothetical: a scene's activation-data
// inference was correct in the source and broken in the emitted declarations, and
// only a consumer compiling against the packed package saw it.
//
// This step therefore packs the engine packages, scaffolds every template against
// them and runs `tsc` and `vite build` separately per project. Both results are
// recorded even when one fails - the two contracts break for unrelated reasons,
// and a type error that stopped the chain would hide the bundler result.
//
// Requires the built `dist` trees. The lane that runs this script gets them as a
// build artifact; locally, `pnpm build` and `pnpm build:packages` first.
console.log('\n9. Generated projects install and build against the packed engine');
{
  const outcomes = verifyRealConsumers({
    repoRoot: rootDir,
    workspace: join(rootDir, '.workspace', 'tmp', 'create-exo-app-consumers'),
    templates: TEMPLATES,
    runScaffold: (template, destination) => {
      execFileSync(process.execPath, ['--import', 'tsx/esm', cliSrc, destination, '--template', template, '--force'], {
        stdio: 'pipe',
        env: { ...process.env, FORCE_COLOR: '0' },
      });
    },
    report: ({ template, typecheck, bundle, viteVersion, typescriptVersion }) => {
      const label = `${template} (vite ${viteVersion}, typescript ${typescriptVersion})`;
      check(typecheck.ok, `${label}: tsc`, `${label}: tsc failed\n${indent(typecheck.detail)}`);
      check(bundle.ok, `${label}: vite build`, `${label}: vite build failed\n${indent(bundle.detail)}`);
    },
  });
  ok(`${outcomes.length} generated project(s) checked against the packed engine`);
}

// Summary
console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
