import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

export const readBundleFiles = (directory: string, prefix = ''): Map<string, Buffer> => {
  const files = new Map<string, Buffer>();

  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    const name = `${prefix}${entry.name}`;

    if (entry.isDirectory()) {
      for (const [child, bytes] of readBundleFiles(path, `${name}/`)) {
        files.set(child, bytes);
      }
    } else {
      files.set(name, readFileSync(path));
    }
  }

  return files;
};

export const assertSameFiles = (first: ReadonlyMap<string, Buffer>, second: ReadonlyMap<string, Buffer>): void => {
  for (const name of [...new Set([...first.keys(), ...second.keys()])].sort()) {
    const left = first.get(name);
    const right = second.get(name);

    if (!left || !right || !left.equals(right)) {
      throw new Error(`Nondeterministic Pixelbolt export: ${name}`);
    }
  }
};

export const checkGeneratedFiles = (expected: ReadonlyMap<string, Buffer>, directory: string): string[] => {
  const differences: string[] = [];

  for (const [name, bytes] of [...expected].sort(([left], [right]) => left.localeCompare(right))) {
    const file = join(directory, name);

    if (!existsSync(file)) {
      differences.push(`${name}: missing`);
    } else if (!readFileSync(file).equals(bytes)) {
      differences.push(`${name}: differs`);
    }
  }

  return differences;
};
