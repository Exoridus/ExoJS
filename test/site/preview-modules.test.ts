// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { expect, it, vi } from 'vitest';

import { isEditableSharedFile, serializePreviewModules } from '../../site/src/lib/preview-modules';

const headScript = /<script>([\s\S]*?)<\/script>/.exec(readFileSync('site/public/preview.html', 'utf8'))![1]!;

it('snapshots only supported editable helpers without retaining the caller record', () => {
  const modules = { 'shared/runtime.ts': 'export const value = 1;', 'other.ts': 'throw new Error();' };
  const snapshot = serializePreviewModules(modules);
  modules['shared/runtime.ts'] = 'export const value = 2;';
  expect(JSON.parse(snapshot!)).toEqual({ 'shared/runtime.ts': 'export const value = 1;' });
  expect(serializePreviewModules({})).toBeNull();
  expect(serializePreviewModules({ 'shared/terrain-noise.ts': 'export const value = 1;' })).toBeNull();
  expect(isEditableSharedFile('shared/runtime.js')).toBe(false);
  expect(isEditableSharedFile(null)).toBe(false);
});

const loadPreview = (snapshot: string | null) => {
  const blobs = new Map<string, Blob>();
  const events = new Map<string, () => void>();
  const dataset: Record<string, string> = {};
  const storage = { getItem: vi.fn(() => snapshot), removeItem: vi.fn() };
  let imports: Record<string, string> = {};
  class PreviewURL extends URL {
    static override createObjectURL(blob: Blob): string {
      const url = `blob:preview-${blobs.size}`;
      blobs.set(url, blob);

      return url;
    }

    static override revokeObjectURL(url: string): void {
      blobs.delete(url);
    }
  }

  runInNewContext(headScript, {
    URLSearchParams,
    URL: PreviewURL,
    Blob,
    window: {
      location: new URL('https://example.test/ExoJS/preview.html?modules-key=edited&no-cache=1'),
      sessionStorage: storage,
      addEventListener: (name: string, listener: () => void) => events.set(name, listener),
    },
    document: {
      documentElement: { dataset },
      createElement: () => ({}),
      currentScript: { after: (script: { textContent: string }) => (imports = JSON.parse(script.textContent).imports) },
    },
  });

  return { blobs, events, dataset, storage, imports };
};

it('maps edited shared helpers to preview-owned modules and releases their URLs on pagehide', async () => {
  const preview = loadPreview(
    JSON.stringify({
      'shared/runtime.ts': 'export const edited = true;',
      'shared/terrain-noise.ts': 'export const noise = 7;',
      'shared/gallery-transitions.ts': 'export const transition = "edited";',
      'tilemap/worker-streamed-terrain.worker.ts': 'throw new Error("read only");',
    }),
  );

  expect(preview.imports['@examples/runtime']).toMatch(/^blob:/);
  expect(preview.imports['@examples/terrain-noise']).toContain('./examples/shared/terrain-noise.js');
  expect(preview.imports['@examples/gallery-transitions']).toMatch(/^blob:/);
  expect(preview.blobs.size).toBe(2);
  const runtime = await preview.blobs.get(preview.imports['@examples/runtime']!)!.text();
  expect(runtime).toContain('import.meta.url = "https://example.test/ExoJS/examples/shared/runtime.js?no-cache=1";');
  expect(runtime).toContain('export const edited = true;');
  expect(preview.imports['./worker-streamed-terrain.worker.ts?worker']).toContain('./examples/tilemap/worker-streamed-terrain.worker.js');
  expect(preview.storage.removeItem).toHaveBeenCalledExactlyOnceWith('edited');
  preview.events.get('pagehide')!();
  expect(preview.blobs.size).toBe(0);
});

it.each([null, '{bad json', '[]'])('reports an unavailable or malformed edited-helper snapshot: %s', snapshot => {
  const preview = loadPreview(snapshot);
  expect(preview.dataset.previewModulesError).toContain('Could not load edited helper modules');
  expect(preview.blobs.size).toBe(0);
});
