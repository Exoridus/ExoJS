import { isClassDeclaration, withNativeSourceFile } from '@codexo/exojs-config/typescript/ast';
import { describe, expect, it } from 'vitest';

describe('TypeScript 7.1 leased syntax trees', () => {
  it('visits class declarations and preserves source ranges', () => {
    const source = 'export class Example extends Scene { update() {} }';

    const result = withNativeSourceFile('source.ts', source, file => {
      const clazz = file.statements.find(isClassDeclaration);

      expect(clazz?.heritageClauses?.length).toBe(1);

      return clazz ? source.slice(clazz.getStart(file), clazz.end) : '';
    });

    expect(result).toContain('class Example extends Scene');
  });
});
