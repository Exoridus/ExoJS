import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const apiDir = path.resolve(repoRoot, 'site', 'src', 'content', 'api');
const tmpDir = path.resolve(repoRoot, '.workspace', 'tmp-api-check');

const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;

function run(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: 'pipe' });
}

function copyDirContents(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const dstPath = path.join(dst, entry);
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(entry.name);
    }
  }
  return out.sort();
}

function compareDirectories(currentDir: string, generatedDir: string): boolean {
  const filesCurrent = collectFiles(currentDir);
  const filesGenerated = collectFiles(generatedDir);

  const added = filesGenerated.filter(f => !filesCurrent.includes(f));
  const removed = filesCurrent.filter(f => !filesGenerated.includes(f));
  const common = filesCurrent.filter(f => filesGenerated.includes(f));

  let diffCount = 0;
  const diffs: string[] = [];

  for (const name of added) {
    diffs.push(`  + ${name}`);
    diffCount += 1;
  }
  for (const name of removed) {
    diffs.push(`  - ${name}`);
    diffCount += 1;
  }

  for (const name of common) {
    const aContent = fs.readFileSync(path.join(currentDir, name), 'utf8');
    const bContent = fs.readFileSync(path.join(generatedDir, name), 'utf8');
    if (aContent !== bContent) {
      diffs.push(`  ~ ${name}`);
      diffCount += 1;
    }
  }

  if (diffCount > 0) {
    console.log(red(`API docs are out of sync — ${diffCount} file(s) differ:`));
    for (const d of diffs) console.log(d);
    console.log(red('\nRun `pnpm docs:api:generate` to regenerate.'));
    return false;
  }

  return true;
}

function main(): void {
  console.log('Checking API doc synchronization...\n');

  // 1. Backup current API directory
  const backupDir = path.resolve(tmpDir, 'backup');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (fs.existsSync(apiDir)) {
    copyDirContents(apiDir, backupDir);
  }

  // 2. Regenerate API docs (writes to the real apiDir)
  console.log('Regenerating API docs...');
  try {
    run('pnpm --filter @codexo/exojs-examples build:api', repoRoot);
  } catch {
    console.log(red('API doc generation failed. Check TypeDoc errors above.'));
    // Restore backup before exiting
    if (fs.existsSync(backupDir)) {
      fs.rmSync(apiDir, { recursive: true, force: true });
      copyDirContents(backupDir, apiDir);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  // 3. Copy generated output to a temp location for comparison, then restore backup
  const generatedDir = path.resolve(tmpDir, 'generated');
  copyDirContents(apiDir, generatedDir);

  // Restore the original files from backup
  fs.rmSync(apiDir, { recursive: true, force: true });
  copyDirContents(backupDir, apiDir);

  // 4. Compare
  console.log('\nComparing regenerated output against committed content...');
  const synced = compareDirectories(apiDir, generatedDir);

  // 5. Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (synced) {
    console.log(green('\nAPI docs are in sync with source.'));
    process.exit(0);
  } else {
    process.exit(1);
  }
}

void main();
