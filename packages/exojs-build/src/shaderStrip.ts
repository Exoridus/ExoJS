// Comment/whitespace stripping for shader sources, kept free of any Node import
// so a browser test lane can compile the exact text a production build ships.
//
// Shader text is shipped verbatim inside the bundle: neither Terser nor
// esbuild descends into a string literal, so every explanatory comment in a
// shader is payload every consumer downloads.
//
// The stripping is deliberately non-destructive - it never renames an
// identifier, reorders a statement or joins two lines. What it removes cannot
// change program meaning:
//
//  - `//` line comments and block comments (the latter replaced by a space, so
//    `a/*x*/b` cannot become the single token `ab`),
//  - leading/trailing whitespace and runs of interior whitespace,
//  - lines left empty by the above.
//
// Line structure survives one-for-one for every line that has content, which
// is what keeps GLSL's preprocessor directives (`#version`, `#define`,
// `#ifdef`) valid - each must own its line, and `#version` must be the first
// of them.

/**
 * `//`-prefixed directives an engine expands at compile time rather than
 * comments, kept verbatim by {@link stripShaderSource}.
 */
const EXO_DIRECTIVE = /^\/\/\s*#exo-/;

/** File extensions {@link createShaderPlugin} loads as shader source text. */
export const SHADER_EXTENSIONS: readonly string[] = ['.vert', '.frag', '.wgsl'];

/** Whether a path carries one of {@link SHADER_EXTENSIONS}. */
export const isShaderId = (id: string): boolean => SHADER_EXTENSIONS.some(extension => id.endsWith(extension));

/**
 * Removes comments and layout whitespace from GLSL or WGSL source.
 *
 * The transform is semantics-preserving: no identifier is renamed, no
 * expression rewritten, no statement reordered, and every line that still has
 * content keeps its own line. Source built at runtime rather than imported
 * from a file can be put through this to ship on the same terms as
 * `createShaderPlugin({ minify: true })` output.
 *
 * `// #exo-` directive lines are preserved - they are instructions to a shader
 * composer, not commentary.
 *
 * Both languages share C-style comment syntax and neither has string literals
 * in any form a shader uses, so a comment scanner needs no lexer state beyond
 * "inside a block comment".
 */
export const stripShaderSource = (source: string): string => {
  const out: string[] = [];
  let inBlockComment = false;

  for (const rawLine of source.split('\n')) {
    let line = '';

    for (let i = 0; i < rawLine.length; i++) {
      if (inBlockComment) {
        if (rawLine[i] === '*' && rawLine[i + 1] === '/') {
          inBlockComment = false;
          // A comment separated two tokens; a space has to keep them apart.
          line += ' ';
          i++;
        }
        continue;
      }

      if (rawLine[i] === '/' && rawLine[i + 1] === '/') {
        if (EXO_DIRECTIVE.test(rawLine.slice(i))) line += rawLine.slice(i);
        break;
      }

      if (rawLine[i] === '/' && rawLine[i + 1] === '*') {
        inBlockComment = true;
        i++;
        continue;
      }

      line += rawLine[i];
    }

    const collapsed = line.replaceAll(/[ \t]+/g, ' ').trim();

    if (collapsed !== '') out.push(collapsed);
  }

  return out.join('\n');
};
