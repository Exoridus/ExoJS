import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../examples/assets');
const extensions = new Set(['.json', '.tmj', '.tsj', '.world', '.ldtk', '.ldtkl', '.tj']);
const write = process.argv.includes('--write');
let count = 0;
let changed = 0;

const visit = (directory: string): void => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      visit(path);
    } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
      count++;
      const source = readFileSync(path, 'utf8');
      const compact = `${JSON.stringify(JSON.parse(source))}\n`;

      if (source.replace(/\r\n/g, '\n') === compact) {
        continue;
      }

      changed++;

      if (write) {
        writeFileSync(path, compact, 'utf8');
      } else {
        console.error(`Not compact: examples/assets/${relative(root, path).replaceAll('\\', '/')}`);
      }
    }
  }
};

visit(root);
console.log(`Example assets: ${count} JSON documents checked, ${changed} ${write ? 'compacted' : 'need compacting'}.`);

if (!write && changed > 0) {
  console.error('Run pnpm assets:compact after exporting or editing asset data.');
  process.exitCode = 1;
}
