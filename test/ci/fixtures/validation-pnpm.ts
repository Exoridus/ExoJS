import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

appendFileSync(resolve('pnpm-calls.jsonl'), `${JSON.stringify(process.argv.slice(2))}\n`);
const behaviour = JSON.parse(readFileSync(resolve('pnpm-behaviour.json'), 'utf8')) as { status: number };
process.stdout.write('fake-pnpm: validation runner contract fixture\n');
process.exitCode = behaviour.status;
