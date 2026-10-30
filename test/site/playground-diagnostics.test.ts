import { describe, expect, test } from 'vitest';

import { diagnosticUrl } from '../../site/scripts/playground-diagnostics';

describe('Playground failure URLs', () => {
  test('keeps preview generation while dropping credentials, storage keys and unrelated queries', () => {
    expect(
      diagnosticUrl('https://user:password@example.test/preview.html?token=secret&no-cache=7&v=current&modules-key=private#secret'),
    ).toBe('https://example.test/preview.html?no-cache=7&v=current');
  });

  test('does not expose local paths or embedded source payloads', () => {
    for (const value of ['file:///C:/Users/private/source.ts', 'data:text/plain,secret', 'blob:https://example.test/private', 'invalid']) {
      expect(diagnosticUrl(value)).toBe('[non-public URL]');
    }
  });
});
