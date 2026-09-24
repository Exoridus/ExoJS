#!/usr/bin/env python3
"""Compile complete TypeScript examples in rewritten entry-point READMEs."""
import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
folder = root / '_migration' / '.readme-snippets'
folder.mkdir(exist_ok=True)
for old in folder.glob('*.ts'):
    old.unlink()
paths = ['README.md'] + [f'packages/{name}/README.md' for name in ['create-exo-app', 'exojs-physics', 'exojs-particles', 'exojs-lighting', 'exojs-tiled', 'exojs-ldtk', 'exojs-aseprite', 'exojs-audio-fx', 'exojs-pathfinding']]
records = []
for name in paths:
    text = (root / name).read_text()
    for index, block in enumerate(re.findall(r'^```ts\s*\n([\s\S]*?)^```', text, re.M)):
        file = folder / f'{len(records):03}.ts'
        file.write_text(block + '\nexport {};\n')
        records.append({'source': name, 'block': index, 'file': str(file.relative_to(root))})
config = folder / 'tsconfig.json'
config.write_text(json.dumps({'extends': '../../tsconfig.examples.json', 'compilerOptions': {'noEmit': True}, 'include': ['*.ts'], 'exclude': []}, indent=2))
print(json.dumps(records, indent=2))
result = subprocess.run(['pnpm', 'exec', 'tsc', '--noEmit', '--pretty', 'false', '-p', str(config)], cwd=root)
(root / '_migration' / 'readme-examples.json').write_text(json.dumps({'sourceCommit': json.loads((root / '_migration/source.json').read_text())['sourceCommit'], 'examples': records, 'exitCode': result.returncode}, indent=2) + '\n')
raise SystemExit(result.returncode)
