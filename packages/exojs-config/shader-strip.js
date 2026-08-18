// Comment/whitespace stripping for shader sources, kept free of any Node import
// so browser test lanes can compile the exact text the production build ships.
//
// Shader text is shipped verbatim inside the bundle: neither Terser nor
// esbuild descends into a string literal, so every explanatory comment in a
// shader is payload every consumer downloads.
//
// The stripping is deliberately non-destructive - it never renames an
// identifier, reorders a statement or joins two lines. What it removes cannot
// change program meaning:
//
//  - `//` line comments and `/* … */` block comments (the latter replaced by a
//    space, so `a/*x*/b` cannot become the single token `ab`),
//  - leading/trailing whitespace and runs of interior whitespace,
//  - lines left empty by the above.
//
// Line structure survives one-for-one for every line that has content, which
// is what keeps GLSL's preprocessor directives (`#version`, `#define`,
// `#ifdef`) valid - each must own its line, and `#version` must be the first
// of them.

/** Engine-owned `//`-prefixed directives, kept verbatim by {@link stripShaderSource}. */
const EXO_DIRECTIVE = /^\/\/\s*#exo-/;

/** Extensions loaded as shader source text. */
export const SHADER_EXTENSIONS = ['.vert', '.frag', '.wgsl'];

/** @param {string} id */
export const isShaderId = id => SHADER_EXTENSIONS.some(extension => id.endsWith(extension));

/**
 * Removes comments and layout whitespace from GLSL/WGSL source.
 *
 * Both languages share C-style comment syntax and neither has string literals
 * in any form the engine's shaders use, so a comment scanner needs no lexer
 * state beyond "inside a block comment".
 *
 * @param {string} source
 * @returns {string}
 */
export function stripShaderSource(source) {
  const out = [];
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
        // `// #exo-include …` is a directive the engine expands at runtime, not
        // a comment: it has to survive into the shipped source.
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
}
