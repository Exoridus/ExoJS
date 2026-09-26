#!/usr/bin/env python3
"""Read-only acceptance checks for the requested entry-point polish."""
import json
import re
import subprocess
import sys
from pathlib import Path

baseline = '--baseline' in sys.argv
text = subprocess.check_output(['git', 'show', 'bc97d3200540ee9429f7df32992f38048625897b:README.md'], text=True) if baseline else Path('README.md').read_text()
checks = {
    'five consistent large Shields': len(re.findall(r'img\.shields\.io/[^)\s]*style=for-the-badge[^)\s]*', text)) == 5,
    'dynamic coverage explicitly tracks main': 'img.shields.io/codecov/c/github/Exoridus/ExoJS/main?' in text,
    'release navigation is present': 'releases/latest/download/exojs-full.zip' in text,
    'companion is preserved': 'companion-hero.webp' in text,
    'one package per table row': all(len(re.findall(r'\[`(?:@codexo/[^`]+|create-exo-app)`\]', line)) <= 1 for line in text.splitlines() if line.startswith('|')),
    'tooling has its own table': '### Project tooling\n\n| Package |' in text or bool(re.search(r'### Project tooling\s+\| Package\s+\|', text)),
    'no unresolved npm-relative documentation links': not bool(re.search(r'\]\((?:\./)?packages/', text)),
    'both adapters remain individually discoverable': all(re.search(r'^\| \[`' + re.escape(name) + r'`\]', text, re.M) for name in ['@codexo/exojs-tiled', '@codexo/exojs-ldtk']),
}
print(json.dumps({'baseline': baseline, 'checks': checks}, indent=2))
if baseline:
    if all(checks.values()):
        raise SystemExit('Baseline unexpectedly passed every regression check')
    print('Expected baseline regressions reproduced.')
else:
    if not all(checks.values()):
        raise SystemExit('Polish regression check failed')
    print('Entry-point acceptance checks passed.')
