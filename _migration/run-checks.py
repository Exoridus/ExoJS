#!/usr/bin/env python3
"""Run explicit checks and preserve their real exit status; no baseline edits."""
import json
import os
import subprocess
import time
from pathlib import Path

checks = [
    ('scope-lifetime-probe', ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.json', '_migration/probe-loader-scope.ts']),
    ('guide-code-blocks', ['pnpm', 'typecheck:guides']),
    ('educational-sources', ['pnpm', 'typecheck:examples']),
    ('readme-code', ['python3', '_migration/check-readme-examples.py']),
    ('site-typecheck', ['pnpm', 'typecheck:site']),
    ('site-tests', ['pnpm', 'exec', 'vitest', 'run', 'test/site']),
    ('whitespace', ['git', 'diff', '--check']),
]
report = {'sourceCommit': json.loads(Path('_migration/source.json').read_text())['sourceCommit'], 'testedCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'runId': os.environ.get('GITHUB_RUN_ID'), 'checks': [], 'stage': 'site and source documentation integration'}
logs = Path('_migration/check-logs')
logs.mkdir(exist_ok=True)
for name, command in checks:
    print('::group::' + name, flush=True)
    started = time.monotonic()
    env = dict(os.environ)
    if name == 'scope-lifetime-probe':
        env['NODE_OPTIONS'] = '--conditions=@codexo/exojs-source'
    with (logs / f'{name}.log').open('w') as log:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
        for line in process.stdout:
            print(line, end='', flush=True)
            log.write(line)
        code = process.wait()
    report['checks'].append({'name': name, 'command': command, 'exitCode': code, 'status': 'PASS' if code == 0 else 'FAIL', 'seconds': round(time.monotonic() - started, 2)})
    print('::endgroup::', flush=True)
Path('_migration/validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
raise SystemExit(int(any(item['exitCode'] != 0 for item in report['checks'])))
