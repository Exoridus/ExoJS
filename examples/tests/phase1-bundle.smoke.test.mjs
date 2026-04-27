// Phase 1 closeout — non-browser bundle/content smoke tests.
//
// These tests run against the static build output (dist/) without spinning up
// a browser. They guard against accidental removal of the Phase 1 component
// surface (custom-element tags, typed CustomEvent wiring, the versions.json
// stub) and are the reliable counterpart to the Playwright suite when WebGL
// is unavailable in the sandbox.
//
// Run after `npm run build` (or `npx astro build`).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const astroDir = path.join(distDir, '_astro');

function readBrowserBundles() {
    assert.ok(
        fs.existsSync(astroDir),
        `dist/_astro missing — run \`npm run build\` first.`
    );

    // Read every app chunk (ExampleBrowser shell + dynamically-imported
    // EditorCode chunk). Skip the Monaco vendor blob and the Monaco workers —
    // they're enormous and don't contain our app code, but they would
    // dominate scan time and could create false positives if a token name
    // happens to appear inside Monaco source.
    const jsFiles = fs
        .readdirSync(astroDir)
        .filter(name => name.endsWith('.js'))
        .filter(name => !/^vendor-monaco/.test(name))
        .filter(name => !/\.worker-.*\.js$/.test(name));

    assert.ok(
        jsFiles.length > 0,
        'No app JS bundles found in dist/_astro/.'
    );

    return jsFiles
        .map(name => fs.readFileSync(path.join(astroDir, name), 'utf8'))
        .join('\n');
}

test('phase 1 custom element tags are present in the built bundle', () => {
    const bundle = readBrowserBundles();

    const expectedTags = [
        // Pre-existing shell.
        'example-browser',
        'exo-app-header',
        'exo-navigation',
        'exo-nav-link',
        'exo-nav-section',
        'exo-editor',
        'exo-preview',
        'exo-code-editor',
        'exo-toolbar',
        'exo-spinner',
        // Phase 1 additions.
        'exo-version-pill',
        'exo-about-drawer',
        'exo-toast-stack',
        'exo-preview-toolbar',
        'exo-diagnostics-strip',
        'exo-editor-status-bar',
    ];

    const missing = expectedTags.filter(tag => !bundle.includes(tag));
    assert.deepEqual(
        missing,
        [],
        `Phase 1 components missing from bundle: ${missing.join(', ')}`
    );
});

test('phase 1 typed events are wired in the built bundle', () => {
    const bundle = readBrowserBundles();

    const expectedEvents = [
        // Routing + navigation.
        'select-example',
        'select-version',
        'toggle-section',
        'toggle-sidebar',
        // Editor + preview reload pipeline.
        'update-code',
        'reset-code',
        'request-reload',
        'preview-canvas-size',
        'preview-errors',
        // Editor instrumentation surfaced for the strip + status bar.
        'editor-cursor',
        'editor-diagnostic',
        'editor-dirty',
        'diagnostic-jump',
    ];

    const missing = expectedEvents.filter(event => !bundle.includes(event));
    assert.deepEqual(
        missing,
        [],
        `Phase 1 event names missing from bundle: ${missing.join(', ')}`
    );
});

test('phase 1 hooks ship as bundle text — toast, jump, refresh, persistence', () => {
    const bundle = readBrowserBundles();

    const expectedSymbols = [
        // Toast feedback for explicit version switches.
        'Switched to @codexo/exojs',
        // Editor public API used by the diagnostics strip + preview toolbar.
        'jumpToLine',
        'triggerRefresh',
        // Persistence key for the user's last-picked version.
        'exojs-examples:selected-version',
    ];

    const missing = expectedSymbols.filter(symbol => !bundle.includes(symbol));
    assert.deepEqual(
        missing,
        [],
        `Phase 1 hooks missing from bundle: ${missing.join(', ')}`
    );
});

test('versions.json deploys at examples/versions.json with valid shape', () => {
    const versionsPath = path.join(distDir, 'examples', 'versions.json');
    assert.ok(
        fs.existsSync(versionsPath),
        'examples/versions.json was not copied into dist/.'
    );

    const data = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));

    assert.equal(typeof data.latestStable, 'string', 'latestStable must be a string.');
    assert.ok(Array.isArray(data.versions), 'versions must be an array.');
    assert.ok(data.versions.length >= 1, 'versions must contain at least one entry.');

    const validTracks = new Set(['stable', 'beta', 'legacy']);
    for (const version of data.versions) {
        assert.equal(typeof version.id, 'string', `version entry missing id: ${JSON.stringify(version)}`);
        assert.ok(
            validTracks.has(version.track),
            `version entry has invalid track "${version.track}" — expected stable | beta | legacy`
        );
        if ('summary' in version) {
            assert.equal(typeof version.summary, 'string', `summary must be a string when present: ${JSON.stringify(version)}`);
        }
        if ('latest' in version) {
            assert.equal(typeof version.latest, 'boolean', `latest must be a boolean when present: ${JSON.stringify(version)}`);
        }
    }

    const latestStableEntry = data.versions.find(version => version.id === data.latestStable);
    assert.ok(
        latestStableEntry,
        `latestStable "${data.latestStable}" is not present in the versions list.`
    );
});

test('phase 1 a11y hooks ship: skip-link target, banner role, dialog wiring', () => {
    const indexHtmlPath = path.join(distDir, 'index.html');
    assert.ok(
        fs.existsSync(indexHtmlPath),
        'dist/index.html missing — run `npm run build` first.'
    );
    const html = fs.readFileSync(indexHtmlPath, 'utf8');

    assert.match(
        html,
        /<a[^>]*class="skip-link"[^>]*href="#main-content"/,
        'Skip-to-main-content link is not present in the rendered HTML.'
    );
    assert.match(
        html,
        /id="main-content"[^>]*tabindex="-1"/,
        'Skip-link target div with id="main-content" tabindex="-1" is missing.'
    );

    const bundle = readBrowserBundles();

    assert.ok(
        bundle.includes('role="banner"') || bundle.includes("role='banner'") || bundle.includes('role:"banner"'),
        'AppHeader landmark role="banner" is not present in the bundle.'
    );
    assert.ok(
        bundle.includes('aria-modal'),
        'About drawer aria-modal hookup is not present in the bundle.'
    );
    assert.ok(
        bundle.includes('aria-haspopup'),
        'VersionPill aria-haspopup hookup is not present in the bundle.'
    );
});
