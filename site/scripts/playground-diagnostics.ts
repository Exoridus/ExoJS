import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Page } from 'playwright';

export const diagnosticUrl = (value: string): string => {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '[non-public URL]';
    }

    const query = new URLSearchParams();

    for (const key of ['no-cache', 'v']) {
      const value = url.searchParams.get(key);

      if (value !== null) {
        query.set(key, value);
      }
    }

    return `${url.origin}${url.pathname}${query.size ? `?${query}` : ''}`;
  } catch {
    return '[non-public URL]';
  }
};

/** Capture the browser state before teardown; source fingerprints identify edits without storing whole editor buffers. */
export const playgroundDiagnostics = (page: Page, directory: string) => {
  const started = performance.now();
  const events: Array<{ ms: number; kind: string; detail: unknown }> = [];
  const redact = (value: string): string => value.replace(/(?:https?|file|blob|data):[^\s"'<>]+/g, diagnosticUrl).slice(0, 1000);

  const mark = (kind: string, detail?: unknown): void => {
    events.push({ ms: Math.round(performance.now() - started), kind, detail });

    if (events.length > 120) {
      events.shift();
    }
  };

  page.on('framenavigated', frame => mark('navigation', diagnosticUrl(frame.url())));
  page.on('pageerror', error => mark('pageerror', redact(error.message)));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      mark(`console-${message.type()}`, redact(message.text()));
    }
  });
  page.on('requestfailed', request => mark('requestfailed', { url: diagnosticUrl(request.url()), error: request.failure()?.errorText }));
  page.on('response', response => {
    if (response.status() >= 400) {
      mark('http-error', { url: diagnosticUrl(response.url()), status: response.status() });
    }
  });

  return {
    mark,
    observeEditor: () =>
      page.evaluate(`(() => {
        const events = window.__playgroundDiagnosticEvents = [];
        const started = performance.now();
        for (const editor of window.monaco?.editor.getEditors() ?? []) {
          const record = kind => {
            const model = editor.getModel();
            events.push({ms:Math.round(performance.now()-started),kind,uri:model?.uri.path,version:model?.getVersionId(),focused:editor.hasTextFocus()});
            if (events.length > 160) events.shift();
          };
          editor.onDidChangeModel(() => record('model'));
          editor.onDidChangeModelContent(() => record('content'));
          editor.onDidFocusEditorText(() => record('focus'));
          editor.onDidBlurEditorText(() => record('blur'));
          record('ready');
        }
      })()`),
    capture: async (error: unknown): Promise<void> => {
      await mkdir(directory, { recursive: true });
      const prefix = join(directory, `failure-${Date.now()}-${randomUUID()}`);
      const state = await page
        .evaluate<{
          url: string;
          iframe?: string;
          models: Array<{ uri: string; version: number; source?: string; sourceHash?: string; probes?: string[]; markers: unknown[] }>;
          editors: unknown[];
          status: string[];
          transitions: unknown[];
        }>(
          `(() => ({
          url:location.href,
          iframe:document.querySelector('iframe')?.src,
          preview:(() => {
            try {
              const frame=document.querySelector('iframe');
              return {ready:frame?.contentDocument?.readyState,run:frame?.contentWindow?.__fileTabRun,helper:frame?.contentWindow?.__helperRun};
            } catch { return {ready:'unavailable'}; }
          })(),
          models:(window.monaco?.editor.getModels() ?? []).filter(m=>m.uri.path.startsWith('/examples/')).slice(0,12).map(m=>({
            uri:m.uri.path,version:m.getVersionId(),source:m.getValue(),
            markers:window.monaco.editor.getModelMarkers({resource:m.uri}).slice(0,8).map(d=>({severity:d.severity,line:d.startLineNumber,code:d.code}))
          })),
          editors:(window.monaco?.editor.getEditors() ?? []).map(e=>({uri:e.getModel()?.uri.path,version:e.getModel()?.getVersionId(),focused:e.hasTextFocus(),readOnly:e.getOption(window.monaco.editor.EditorOption.readOnly)})),
          status:[...document.querySelectorAll('[role="status"]')].map(e=>e.textContent?.slice(0,200)),
          transitions:window.__playgroundDiagnosticEvents ?? []
        }))()`,
        )
        .catch(cause => ({ snapshotError: redact(String(cause)) }));

      if ('models' in state) {
        for (const model of state.models) {
          model.sourceHash = createHash('sha256')
            .update(model.source ?? '')
            .digest('hex');
          model.probes = (model.source ?? '')
            .split('\n')
            .filter(line => /__(?:fileTabRun|helperRun)\s*=/.test(line))
            .slice(-4)
            .map(line => line.slice(0, 160));
          delete model.source;
        }

        state.url = diagnosticUrl(state.url);
        state.iframe = diagnosticUrl(state.iframe ?? '');
      }

      const artifacts = await Promise.allSettled([page.screenshot({ path: `${prefix}.png` })]);
      await writeFile(
        `${prefix}.json`,
        `${JSON.stringify({ error: redact(error instanceof Error ? error.message : String(error)), events, state, artifacts: artifacts.map(result => (result.status === 'fulfilled' ? 'saved' : redact(String(result.reason)))) }, null, 2)}\n`,
      );
      console.error(`[e2e] Failure diagnostics: ${prefix.replaceAll('\\', '/')}.{json,png}`);
    },
  };
};
