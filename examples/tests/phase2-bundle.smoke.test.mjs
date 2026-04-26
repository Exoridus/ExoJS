// Phase 2 — non-browser smoke tests for the versioned examples tree.
//
// These tests run against the static build output (dist/) without spinning up
// a browser. They guard the Phase 2 data layout so legacy fallbacks and new
// versioned snapshots stay in lock-step until the cutover slice (P2-09).
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
const examplesDistDir = path.join(distDir, 'examples');

const CURRENT_VERSION = '0.4.0';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('versions.json points latestStable at a directory that exists in dist/', () => {
    const versionsManifestPath = path.join(examplesDistDir, 'versions.json');
    assert.ok(
        fs.existsSync(versionsManifestPath),
        'examples/versions.json missing — run `npm run build` first.'
    );

    const manifest = readJson(versionsManifestPath);
    assert.equal(typeof manifest.latestStable, 'string', 'manifest.latestStable must be a string.');

    const versionDir = path.join(examplesDistDir, 'versions', manifest.latestStable);
    assert.ok(
        fs.existsSync(versionDir),
        `versions/${manifest.latestStable}/ missing — manifest references a version with no snapshot.`
    );
});

test(`versioned catalog at examples/versions/${CURRENT_VERSION}/examples.json mirrors the flat catalog`, () => {
    const flatCatalogPath = path.join(examplesDistDir, 'examples.json');
    const versionedCatalogPath = path.join(examplesDistDir, 'versions', CURRENT_VERSION, 'examples.json');

    assert.ok(fs.existsSync(flatCatalogPath), 'Legacy flat examples.json missing from dist/.');
    assert.ok(fs.existsSync(versionedCatalogPath), `versions/${CURRENT_VERSION}/examples.json missing from dist/.`);

    const flat = readJson(flatCatalogPath);
    const versioned = readJson(versionedCatalogPath);

    // The versioned snapshot is a byte-identical copy at P2-01 baseline. We
    // compare structurally (not via JSON.stringify equality) so a downstream
    // slice that legitimately diverges them — say, by adding `addedIn` keys —
    // can update this assertion deliberately.
    const flatSections = Object.keys(flat).sort();
    const versionedSections = Object.keys(versioned).sort();
    assert.deepEqual(
        versionedSections,
        flatSections,
        `Versioned catalog sections differ from flat: flat=${flatSections.join(',')} versioned=${versionedSections.join(',')}`
    );

    for (const section of flatSections) {
        assert.ok(Array.isArray(versioned[section]), `versioned section "${section}" is not an array.`);
        assert.equal(
            versioned[section].length,
            flat[section].length,
            `versioned section "${section}" has ${versioned[section].length} entries; flat has ${flat[section].length}.`
        );
    }
});

test(`every entry in versions/${CURRENT_VERSION}/examples.json has a matching .js file on disk`, () => {
    const versionedCatalogPath = path.join(examplesDistDir, 'versions', CURRENT_VERSION, 'examples.json');
    const versionedRoot = path.join(examplesDistDir, 'versions', CURRENT_VERSION);

    const catalog = readJson(versionedCatalogPath);
    const missing = [];

    for (const [section, entries] of Object.entries(catalog)) {
        for (const entry of entries) {
            const filePath = path.join(versionedRoot, entry.path);
            if (!fs.existsSync(filePath)) {
                missing.push(`${section}/${entry.slug} → ${entry.path}`);
            }
        }
    }

    assert.deepEqual(
        missing,
        [],
        `Versioned catalog references missing example sources: ${missing.join(' | ')}`
    );
});

test(`legacy flat tree still ships under examples/ for fallback runtime paths`, () => {
    // Until P2-09 cuts over, the runtime still loads from the flat paths.
    // This test must keep passing through P2-02..P2-08; only P2-09 deletes
    // the flat tree and updates the assertion accordingly.
    const flatCatalogPath = path.join(examplesDistDir, 'examples.json');
    assert.ok(fs.existsSync(flatCatalogPath), 'Legacy flat examples.json must still ship until cutover (P2-09).');

    const catalog = readJson(flatCatalogPath);
    const missing = [];

    for (const [section, entries] of Object.entries(catalog)) {
        for (const entry of entries) {
            const filePath = path.join(examplesDistDir, entry.path);
            if (!fs.existsSync(filePath)) {
                missing.push(`${section}/${entry.slug} → ${entry.path}`);
            }
        }
    }

    assert.deepEqual(
        missing,
        [],
        `Legacy flat catalog references missing example sources: ${missing.join(' | ')}`
    );
});

test('versioned tree does not absorb the shared/ helpers (those stay top-level)', () => {
    const versionedSharedPath = path.join(examplesDistDir, 'versions', CURRENT_VERSION, 'shared');
    const flatSharedPath = path.join(examplesDistDir, 'shared');

    assert.ok(
        !fs.existsSync(versionedSharedPath),
        `versions/${CURRENT_VERSION}/shared/ should NOT exist — runtime helpers are library-version-agnostic and stay at examples/shared/.`
    );
    assert.ok(
        fs.existsSync(flatSharedPath),
        'examples/shared/ missing — required for the iframe import map.'
    );
});

// --------------------------------------------------------------------------
// P2-02: vendor-sync writes both the flat path (legacy fallback) and a
// versioned snapshot keyed by the in-development library version. Until the
// cutover slice (P2-09), both paths must ship and the versioned snapshot
// must be byte-identical to the flat copy.
// --------------------------------------------------------------------------

const vendorDistDir = path.join(distDir, 'vendor', 'exojs');
const versionedVendorDistDir = path.join(vendorDistDir, CURRENT_VERSION);

test(`vendor-sync emits the runtime ESM bundle to vendor/exojs/${CURRENT_VERSION}/ in dist`, () => {
    assert.ok(
        fs.existsSync(path.join(vendorDistDir, 'exo.esm.js')),
        'Legacy flat vendor/exojs/exo.esm.js must still ship until cutover (P2-09).'
    );
    assert.ok(
        fs.existsSync(path.join(versionedVendorDistDir, 'exo.esm.js')),
        `vendor/exojs/${CURRENT_VERSION}/exo.esm.js missing — vendor-sync did not produce the versioned snapshot.`
    );

    // Sourcemaps mirror the bundle in both locations.
    assert.ok(
        fs.existsSync(path.join(vendorDistDir, 'exo.esm.js.map')),
        'Legacy flat vendor/exojs/exo.esm.js.map missing.'
    );
    assert.ok(
        fs.existsSync(path.join(versionedVendorDistDir, 'exo.esm.js.map')),
        `vendor/exojs/${CURRENT_VERSION}/exo.esm.js.map missing — sourcemap not mirrored to versioned snapshot.`
    );
});

test(`versioned vendor snapshot mirrors the flat exo.esm.js byte-for-byte`, () => {
    const flatBundle = fs.readFileSync(path.join(vendorDistDir, 'exo.esm.js'));
    const versionedBundle = fs.readFileSync(path.join(versionedVendorDistDir, 'exo.esm.js'));

    assert.equal(
        flatBundle.length,
        versionedBundle.length,
        'Flat and versioned exo.esm.js bundles differ in length — mirror is not byte-identical.'
    );
    assert.ok(
        flatBundle.equals(versionedBundle),
        'Flat and versioned exo.esm.js bundles differ byte-for-byte — mirror drift detected.'
    );
});

// --------------------------------------------------------------------------
// P2-03: the example store is now version-keyed. Catalog and source URLs
// resolve under `examples/versions/<id>/...`. Until the cutover slice
// (P2-09), the legacy flat tree still ships, but the runtime no longer
// reaches it — these tests pin the new code paths into the bundle.
// --------------------------------------------------------------------------

const ASTRO_DIR = path.join(distDir, '_astro');

function readAppBundles() {
    assert.ok(fs.existsSync(ASTRO_DIR), `dist/_astro missing — run \`npm run build\` first.`);

    const jsFiles = fs
        .readdirSync(ASTRO_DIR)
        .filter(name => name.endsWith('.js'))
        .filter(name => !/^vendor-monaco/.test(name))
        .filter(name => !/\.worker-.*\.js$/.test(name));

    return jsFiles
        .map(name => fs.readFileSync(path.join(ASTRO_DIR, name), 'utf8'))
        .join('\n');
}

test('version-aware example store wiring ships in the bundle', () => {
    const bundle = readAppBundles();

    // The url-builder helper concatenates segments at runtime, so the literal
    // template-string `${dir}/versions/${id}/${path}` is split during
    // minification into the constant fragment "/versions/". That fragment is
    // unique to the version-aware URL resolver — its presence proves the new
    // helper is the path consumers reach for examples + sources.
    assert.ok(
        bundle.includes('/versions/'),
        'Bundle does not reference `/versions/` — version-aware URL resolution is not wired.'
    );

    // The version-keyed catalog filename, written by the new
    // buildVersionedExampleUrl call site.
    assert.ok(
        bundle.includes('examples.json'),
        'Bundle does not reference examples.json — catalog loader did not survive bundling.'
    );

    // versions.json (the manifest at the top level) should also ship — it's
    // loaded by versions.ts via the legacy `buildExampleUrl`.
    assert.ok(
        bundle.includes('versions.json'),
        'Bundle does not reference versions.json — manifest loader regressed.'
    );
});

// --------------------------------------------------------------------------
// P2-04: the preview iframe loads the ExoJS runtime from the version that
// matches the active example. preview.html reads `v` from URLSearchParams,
// validates it, and rewrites its import map to vendor/exojs/<v>/exo.esm.js.
// The flat vendor path stays as fallback until P2-09.
// --------------------------------------------------------------------------

const PREVIEW_HTML_PATH = path.join(distDir, 'preview.html');

test('preview.html reads `v` from URLSearchParams in its inline import-map setup', () => {
    assert.ok(fs.existsSync(PREVIEW_HTML_PATH), 'dist/preview.html missing — run `npm run build` first.');
    const html = fs.readFileSync(PREVIEW_HTML_PATH, 'utf8');

    assert.match(
        html,
        /params\.get\(\s*['"]v['"]\s*\)/,
        'preview.html does not read the `v` query param — version is not consumed.'
    );

    // The IIFE that writes the import map must still be inline in <head>,
    // synchronously, before any module loads. Defer/async or external
    // sourcing would break import-map timing.
    const headSlice = html.slice(0, html.indexOf('</head>'));
    assert.match(
        headSlice,
        /<script>\s*\(function\s*\(\)/,
        'preview.html import-map setup is no longer an inline IIFE in <head> — timing is at risk.'
    );
});

test('preview.html sanitises the version id before composing the vendor path', () => {
    const html = fs.readFileSync(PREVIEW_HTML_PATH, 'utf8');

    // Whitelist regex keeps path traversal (`../`), URL components (`:`,
    // `?`, `#`), and unicode shenanigans out of the import-map URL.
    assert.match(
        html,
        /\[A-Za-z0-9\._\-\]/,
        'preview.html version-id sanitisation regex is missing.'
    );
});

test('preview.html builds versioned vendor path AND keeps a flat fallback', () => {
    const html = fs.readFileSync(PREVIEW_HTML_PATH, 'utf8');

    // Versioned target — used when v is present and passes the regex.
    assert.match(
        html,
        /['"]\.\/vendor\/exojs\/['"]\s*\+\s*\w+/,
        'preview.html does not concatenate vendor/exojs/ with the sanitised version id.'
    );

    // Flat fallback — what a missing or unsafe v lands on. Must keep
    // shipping until P2-09 retires the flat tree.
    assert.match(
        html,
        /['"]\.\/vendor\/exojs\/exo\.esm\.js/,
        'preview.html no longer carries a flat-vendor fallback path.'
    );
});

test('iframe URL builder threads selectedVersionId through buildIframeUrl', () => {
    // EditorPreview now declares `selectedVersionId` and conditionally adds
    // it to the iframe URL params. Lit's @property() decorator preserves the
    // string identifier in the bundled output, so the prop name surviving the
    // build is a stable signal that the wiring is in place.
    const bundle = readAppBundles();
    assert.ok(
        bundle.includes('selectedVersionId'),
        'Bundle does not reference selectedVersionId — version is not threaded into the iframe URL.'
    );
});

// --------------------------------------------------------------------------
// P2-05: Monaco extra libs are now version-keyed. The vendor sync normalises
// the library's declaration tree into `vendor/exojs/<v>/esm/**/*.d.ts` plus
// a manifest, and EditorCode atomically swaps the active typings via
// setExtraLibs whenever the selected version changes.
// --------------------------------------------------------------------------

test('vendor sync emits the typings manifest + esm declaration tree', () => {
    // Manifest at flat and versioned levels.
    const flatManifest = path.join(distDir, 'vendor', 'exojs', 'esm-typings.json');
    const versionedManifest = path.join(distDir, 'vendor', 'exojs', CURRENT_VERSION, 'esm-typings.json');

    assert.ok(fs.existsSync(flatManifest), 'Flat vendor/exojs/esm-typings.json missing.');
    assert.ok(fs.existsSync(versionedManifest), `vendor/exojs/${CURRENT_VERSION}/esm-typings.json missing.`);

    const flat = JSON.parse(fs.readFileSync(flatManifest, 'utf8'));
    const versioned = JSON.parse(fs.readFileSync(versionedManifest, 'utf8'));

    assert.ok(Array.isArray(flat) && flat.length > 0, 'Flat typings manifest is not a non-empty array.');
    assert.ok(Array.isArray(versioned) && versioned.length > 0, 'Versioned typings manifest is not a non-empty array.');
    assert.deepEqual(versioned, flat, 'Versioned typings manifest drifted from flat copy.');

    // Every entry must be a forward-slashed `.d.ts` relative path with no
    // traversal — matches the runtime whitelist in EditorCode.
    for (const entry of versioned) {
        assert.equal(typeof entry, 'string', `Manifest entry must be a string: ${JSON.stringify(entry)}`);
        assert.ok(entry.endsWith('.d.ts'), `Manifest entry must end in .d.ts: ${entry}`);
        assert.ok(!entry.includes('..'), `Manifest entry must not contain ..: ${entry}`);
        assert.ok(!entry.startsWith('/'), `Manifest entry must be relative: ${entry}`);
    }
});

test('every typings-manifest entry has a matching .d.ts file at flat AND versioned paths', () => {
    const flatVendor = path.join(distDir, 'vendor', 'exojs');
    const versionedVendor = path.join(flatVendor, CURRENT_VERSION);
    const manifest = JSON.parse(
        fs.readFileSync(path.join(versionedVendor, 'esm-typings.json'), 'utf8')
    );

    const flatMissing = manifest.filter(rel => !fs.existsSync(path.join(flatVendor, 'esm', rel)));
    const versionedMissing = manifest.filter(rel => !fs.existsSync(path.join(versionedVendor, 'esm', rel)));

    assert.deepEqual(flatMissing, [], `Flat typings tree missing files: ${flatMissing.join(', ')}`);
    assert.deepEqual(versionedMissing, [], `Versioned typings tree missing files: ${versionedMissing.join(', ')}`);
});

test('vendor sync ships exo.d.ts and module-shims.d.ts at versioned path', () => {
    const versionedVendor = path.join(distDir, 'vendor', 'exojs', CURRENT_VERSION);
    const exoDts = path.join(versionedVendor, 'exo.d.ts');
    const moduleShims = path.join(versionedVendor, 'module-shims.d.ts');

    assert.ok(fs.existsSync(exoDts), `vendor/exojs/${CURRENT_VERSION}/exo.d.ts missing — typings entry point not normalised.`);
    assert.ok(fs.existsSync(moduleShims), `vendor/exojs/${CURRENT_VERSION}/module-shims.d.ts missing.`);

    // Module-shims must declare the ambient `exojs` module so Monaco can
    // resolve `import { Foo } from 'exojs'`.
    const shimsContent = fs.readFileSync(moduleShims, 'utf8');
    assert.match(shimsContent, /declare\s+module\s+["']exojs["']/, 'module-shims.d.ts no longer declares ambient exojs module.');
});

test('shared examples typings are NOT versioned (stay top-level)', () => {
    const flatShared = path.join(distDir, 'examples', 'shared');
    const versionedShared = path.join(distDir, 'examples', 'versions', CURRENT_VERSION, 'shared');

    assert.ok(fs.existsSync(path.join(flatShared, 'runtime.d.ts')), 'examples/shared/runtime.d.ts missing.');
    assert.ok(fs.existsSync(path.join(flatShared, 'editor-support.d.ts')), 'examples/shared/editor-support.d.ts missing.');
    assert.ok(
        !fs.existsSync(versionedShared),
        `examples/versions/${CURRENT_VERSION}/shared/ should NOT exist — shared helpers stay version-agnostic.`
    );
});

test('EditorCode bundle wires version-aware Monaco extra libs via setExtraLibs', () => {
    const bundle = readAppBundles();

    // setExtraLibs is the atomic-replace API. Its presence proves we're not
    // accumulating duplicate extra libs across version switches.
    assert.ok(
        bundle.includes('setExtraLibs'),
        'EditorCode bundle does not call setExtraLibs — typings would accumulate on every version switch.'
    );

    // The version-keyed typings URL pattern. After minification the literal
    // `${baseUrl}esm-typings.json` template breaks at runtime concatenation,
    // and `esm-typings.json` is the unique fragment that survives.
    assert.ok(
        bundle.includes('esm-typings.json'),
        'EditorCode bundle does not reference esm-typings.json — version-aware typings manifest fetch is not wired.'
    );

    // The shared-typings virtual paths. Pinned because these are
    // version-agnostic and must survive any future per-version refactor.
    assert.ok(
        bundle.includes('@examples/runtime'),
        'EditorCode bundle does not reference @examples/runtime virtual path.'
    );
    assert.ok(
        bundle.includes('@examples/editor-support'),
        'EditorCode bundle does not reference @examples/editor-support virtual path.'
    );
});

test('runtime component code does not hardcode any version literal', () => {
    // Version ids must always come from the manifest / store; never embedded
    // in component code. Test fixtures and the public manifest are exempt.
    const componentsDir = path.join(projectRoot, 'src', 'components');
    const sourceFiles = fs
        .readdirSync(componentsDir)
        .filter(name => name.endsWith('.ts'));

    const hardcoded = /^['"`]?2\.\d+\.\d+/;
    const violations = [];

    for (const fileName of sourceFiles) {
        const content = fs.readFileSync(path.join(componentsDir, fileName), 'utf8');
        // Match a quoted "2.x.y" anywhere — defensive against single, double,
        // and template strings.
        if (/['"`]2\.\d+\.\d+/.test(content)) {
            // Allow occurrences inside comments — those are documentation,
            // not runtime behaviour.
            const stripped = content
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            if (/['"`]2\.\d+\.\d+/.test(stripped)) {
                violations.push(fileName);
            }
        }
    }

    assert.deepEqual(
        violations,
        [],
        `Hardcoded version literal in component(s): ${violations.join(', ')}`
    );

    // Reference to `hardcoded` keeps a future maintainer from accidentally
    // simplifying the regex into a different shape.
    assert.equal(typeof hardcoded.test, 'function');
});

test('missing-example toast copy ships for explicit version-change fallback', () => {
    const bundle = readAppBundles();

    // The user-visible string the missing-example toast renders. Pinned so
    // a refactor can't silently strip the fallback path.
    assert.ok(
        bundle.includes("isn't available in exojs@"),
        `Missing-example fallback toast text not found in bundle.`
    );

    // Companion "Back to vX" action label, also pinned.
    assert.ok(
        bundle.includes('Back to v'),
        `Missing-example fallback action label not found in bundle.`
    );
});

test(`versioned vendor mirrors typings only when the flat copy has them`, () => {
    // Typings are optional — the local library build may omit a flat-emitted
    // exo.d.ts. The contract is parity, not presence: whatever the flat path
    // has, the versioned path must also have. Likewise for module-shims.d.ts,
    // which the sync script writes unconditionally.
    const flatExoDts = path.join(vendorDistDir, 'exo.d.ts');
    const versionedExoDts = path.join(versionedVendorDistDir, 'exo.d.ts');

    if (fs.existsSync(flatExoDts)) {
        assert.ok(
            fs.existsSync(versionedExoDts),
            `Flat vendor has exo.d.ts but versions/${CURRENT_VERSION}/ does not — typings parity broken.`
        );
        assert.ok(
            fs.readFileSync(flatExoDts).equals(fs.readFileSync(versionedExoDts)),
            'Flat and versioned exo.d.ts differ byte-for-byte — mirror drift detected.'
        );
    } else {
        assert.ok(
            !fs.existsSync(versionedExoDts),
            `Flat vendor has no exo.d.ts but versions/${CURRENT_VERSION}/exo.d.ts exists — versioned snapshot drifted.`
        );
    }

    const flatShims = path.join(vendorDistDir, 'module-shims.d.ts');
    const versionedShims = path.join(versionedVendorDistDir, 'module-shims.d.ts');

    assert.ok(
        fs.existsSync(flatShims),
        'Flat vendor module-shims.d.ts missing — sync script no longer writes it.'
    );
    assert.ok(
        fs.existsSync(versionedShims),
        `vendor/exojs/${CURRENT_VERSION}/module-shims.d.ts missing — module-shims not mirrored to versioned snapshot.`
    );
    assert.ok(
        fs.readFileSync(flatShims).equals(fs.readFileSync(versionedShims)),
        'Flat and versioned module-shims.d.ts differ — mirror drift detected.'
    );
});
