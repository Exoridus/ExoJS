import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { qualify, type QualifyOptions, readRows } from '../../scripts/ci/qualify.ts';

for (const name of Object.keys(process.env)) {
  if (name.startsWith('GIT_')) {
    delete process.env[name];
  }
}

const temporary: string[] = [];

const workspace = (): { cwd: string; records: string } => {
  const cwd = mkdtempSync(join(tmpdir(), 'exojs-qualify-'));
  temporary.push(cwd);

  return { cwd, records: join(cwd, 'records') };
};

const options = (row: string, script: string, extra: Partial<QualifyOptions> = {}): QualifyOptions => ({
  row,
  policy: 'required',
  requires: [],
  command: [process.execPath, '-e', script],
  ...extra,
});

after(() => {
  for (const path of temporary) {
    rmSync(path, { recursive: true, force: true });
  }
});

void test('a clean exit is recorded as PASS with the supervised log', async () => {
  const { cwd, records } = workspace();
  const code = await qualify(options('Row / A', 'process.exit(0)'), { cwd, recordDirectory: records, output: 'silent' });
  const [row] = readRows(records);

  assert.equal(code, 0);
  assert.equal(row?.status, 'PASS');
  assert.ok(row?.logPath?.startsWith(join(cwd, '.workspace', 'logs')));
});

void test('a failing required row stays red and names a test failure', async () => {
  const { cwd, records } = workspace();
  const code = await qualify(options('Row / B', 'process.exit(3)'), { cwd, recordDirectory: records, output: 'silent' });
  const [row] = readRows(records);

  assert.equal(code, 3);
  assert.equal(row?.status, 'FAIL');
  assert.equal(row?.failure, 'test');
  assert.ok(row?.logPath && existsSync(row.logPath));
});

void test('an informational failure is recorded but does not fail the job', async () => {
  const { cwd, records } = workspace();
  const code = await qualify(options('Row / C', 'process.exit(1)', { policy: 'informational' }), {
    cwd,
    recordDirectory: records,
    output: 'silent',
  });

  assert.equal(code, 0);
  assert.equal(readRows(records)[0]?.status, 'FAIL');
});

void test('the outer deadline stops a wedged command and classifies it as a timeout', async () => {
  const { cwd, records } = workspace();
  const started = Date.now();
  const code = await qualify(options('Row / D', 'setInterval(() => {}, 1000)', { timeoutMinutes: 0.03 }), {
    cwd,
    recordDirectory: records,
    output: 'silent',
  });
  const [row] = readRows(records);

  assert.equal(code, 124);
  assert.equal(row?.failure, 'timeout');
  assert.ok(Date.now() - started < 20_000, 'the deadline, not the fixture, ended the run');
});

void test('repeated runs of one row keep every record and every log', async () => {
  const { cwd, records } = workspace();

  await qualify(options('Row / E', 'process.exit(2)'), { cwd, recordDirectory: records, output: 'silent' });
  await qualify(options('Row / E', 'process.exit(0)'), { cwd, recordDirectory: records, output: 'silent' });

  assert.equal(readdirSync(records).length, 2);
  assert.equal(readdirSync(join(cwd, '.workspace', 'logs')).length, 2);
});

void test('a row after an unsupported parent is NOT RUN and never launches its command', async () => {
  const { cwd, records } = workspace();
  const marker = join(cwd, 'ran');

  const { recordRow } = await import('../../scripts/ci/qualify.ts');
  recordRow(
    {
      row: 'Parent',
      policy: 'informational',
      status: 'UNSUPPORTED HOST',
      detail: 'no adapter',
      durationMs: 1,
      finishedAt: new Date().toISOString(),
    },
    records,
  );

  const code = await qualify(
    options('Child', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`, { policy: 'informational', after: 'Parent' }),
    { cwd, recordDirectory: records, output: 'silent' },
  );
  const child = readRows(records).find(row => row.row === 'Child');

  assert.equal(code, 0);
  assert.equal(child?.status, 'NOT RUN');
  assert.match(child?.detail ?? '', /parent capability unavailable/);
  assert.equal(existsSync(marker), false);
});
