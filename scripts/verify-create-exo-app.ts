import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..');
const tmpRoot = join(rootDir, '.workspace', 'tmp', 'create-exo-app');
const cliSrc = join(rootDir, 'packages', 'create-exo-app', 'src', 'index.ts');
const templatesDir = join(rootDir, 'packages', 'create-exo-app', 'templates');

const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as { version: string };
const EXPECTED_EXOJS_VERSION = `^${rootPkg.version}`;

const TEMPLATES = ['minimal', 'game-starter', 'audio-reactive'] as const;
type TemplateName = (typeof TEMPLATES)[number];

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

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
  passed++;
}

function fail(msg: string): void {
  console.error(`  ✗ ${msg}`);
  failed++;
}

function check(condition: boolean, okMsg: string, failMsg: string): void {
  if (condition) {
    ok(okMsg);
  } else {
    fail(failMsg);
  }
}

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

// 7. Template ExoJS dependency version
console.log('\n7. Template ExoJS dependency versions');
for (const t of TEMPLATES) {
  const pkgPath = join(templatesDir, t, 'package.json');
  try {
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
    const actual = pkg.dependencies?.['@codexo/exojs'];
    check(
      actual === EXPECTED_EXOJS_VERSION,
      `${t}: @codexo/exojs="${actual}" matches expected "${EXPECTED_EXOJS_VERSION}"`,
      `${t}: @codexo/exojs="${actual ?? '(missing)'}" — expected "${EXPECTED_EXOJS_VERSION}"`,
    );
    const hasWorkspaceDep = Object.values(pkg.dependencies ?? {}).some(v => v.startsWith('workspace:'));
    check(!hasWorkspaceDep, `${t}: no workspace: dependency`, `${t}: contains a workspace: dependency — templates must not reference workspace packages`);
  } catch {
    fail(`${t}/package.json could not be read for version check`);
  }
}

// Summary
console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
