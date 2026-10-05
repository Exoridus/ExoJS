const withExtension = (path: string): string => (/\.[a-z]+$/.test(path) ? path : `${path}.ts`);

/**
 * Source files an example imports besides its own entry file, as paths below
 * `examples/`. The playground runs and exports only the entry file; these are
 * the files a copy of it needs next to it: sibling modules (a worker entry
 * included, whatever bundler suffix it carries) and the shared `@examples/*`
 * helpers.
 */
export const findExampleCompanions = (source: string, entryPath: string): string[] => {
  const slash = entryPath.lastIndexOf('/');
  const directory = slash === -1 ? '' : entryPath.slice(0, slash + 1);
  const companions = new Set<string>();

  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1].replace(/\?.*$/, '');

    if (specifier.startsWith('./')) {
      companions.add(directory + withExtension(specifier.slice(2)));
    } else if (specifier.startsWith('@examples/')) {
      companions.add(`shared/${withExtension(specifier.slice('@examples/'.length))}`);
    }
  }

  return [...companions];
};
