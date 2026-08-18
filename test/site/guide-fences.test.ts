/**
 * Tests for scripts/guide-fences.ts - the fenced-code-block scanner the guide
 * extractor and the `no-check` budget both count through.
 *
 * The property that matters here is that a fence is recognized wherever
 * CommonMark puts one, not only in column 0: a block nested in a list item is
 * indented, and a scanner anchored to column 0 reports such a guide as having
 * fewer code blocks than it has. That undercount is invisible in both
 * directions - the block never reaches `typecheck:guides`, and it never
 * appears in the budget that claims to bound what is unchecked.
 */

import { parseFences } from '../../scripts/guide-fences';

describe('parseFences', () => {
  test('reads a fence in column 0', () => {
    const fences = parseFences(['```ts', 'const a = 1;', '```'].join('\n'));

    expect(fences).toEqual([{ lang: 'ts', meta: '', body: 'const a = 1;\n', indent: '' }]);
  });

  test('reads a fence indented inside a list item', () => {
    const content = ['- a list item:', '', '  ```js no-check', '  const a = 1;', '  ```'].join('\n');

    expect(parseFences(content)).toEqual([{ lang: 'js', meta: ' no-check', body: 'const a = 1;\n', indent: '  ' }]);
  });

  test('strips the fence indentation from every body line', () => {
    const content = ['  ```ts', '  if (a) {', '    b();', '  }', '  ```'].join('\n');

    expect(parseFences(content)[0]?.body).toBe('if (a) {\n  b();\n}\n');
  });

  test('leaves a body line that is shorter than the indentation alone', () => {
    const content = ['  ```ts', '  const a = 1;', '', '  const b = 2;', '  ```'].join('\n');

    expect(parseFences(content)[0]?.body).toBe('const a = 1;\n\nconst b = 2;\n');
  });

  test('a closing fence must carry the indentation of its opening fence', () => {
    // An outer column-0 block whose body contains an indented fence pair: the
    // inner fences must not terminate the outer block, or one block is read as
    // two and the second one's body is prose.
    const content = ['```md', 'prose', '  ```ts', '  const a = 1;', '  ```', 'more prose', '```'].join('\n');

    const fences = parseFences(content);

    expect(fences).toHaveLength(1);
    expect(fences[0]?.lang).toBe('md');
  });

  test('reads consecutive blocks at different indentations', () => {
    const content = ['```ts', 'const a = 1;', '```', '', '- item:', '', '  ```tsx', '  const b = 2;', '  ```'].join('\n');

    expect(parseFences(content).map(fence => fence.lang)).toEqual(['ts', 'tsx']);
  });

  test('carries the meta of an indented fence, so `no-check` still counts', () => {
    const content = ['  ```ts no-check', '  partial();', '  ```'].join('\n');

    expect(parseFences(content)[0]?.meta).toContain('no-check');
  });

  test('reads a fence with no language tag', () => {
    const fences = parseFences(['```', 'plain', '```'].join('\n'));

    expect(fences).toEqual([{ lang: '', meta: '', body: 'plain\n', indent: '' }]);
  });

  test('ignores an unterminated fence', () => {
    expect(parseFences(['```ts', 'const a = 1;'].join('\n'))).toEqual([]);
  });
});
