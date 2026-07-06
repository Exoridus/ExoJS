// Auto-generated from asset-browser.ts — edit the .ts source, not this file.
import { Application, AudioStream, Color, FontAsset, Graphics, Json, Scene, Sprite, Spritesheet, SvgAsset, Text, Texture, } from '@codexo/exojs';
// Dynamic category accessor: maps a category key to the correct sub-object
// in the hierarchical assets catalog. Technical assets live under
// assets.technical; everything else is under assets.demo.
function getCategoryData(catKey) {
    if (catKey === 'technical')
        return assets.technical;
    return assets.demo[catKey] ?? {};
}
const W = 1280;
const H = 720;
const TOOLBAR_H = 110;
const SIDEBAR_W = 220;
const ITEM_H = 36;
const LIST_Y = TOOLBAR_H + 4;
const PREVIEW_X = SIDEBAR_W;
const PREVIEW_Y = TOOLBAR_H;
const PREVIEW_W = W - SIDEBAR_W;
const PREVIEW_H = H - TOOLBAR_H;
const CAT_BTN_W = 82;
const CAT_BTN_H = 38;
const CAT_BTN_Y1 = 6;
const CAT_BTN_Y2 = 58;
const CAT_BTN_X0 = 6;
const BG_BTN_SIZE = 26;
const BG_BTN_Y = 16;
const BG_BTN_X0 = W - 3 * (BG_BTN_SIZE + 5) - 6;
const CATEGORIES_ROW1 = [
    { id: 'textures', label: 'IMG', catKey: 'textures' },
    { id: 'sprites', label: 'SPR', catKey: 'sprites' },
    { id: 'audio', label: 'AUD', catKey: 'audio' },
    { id: 'svg', label: 'SVG', catKey: 'svg' },
    { id: 'fonts', label: 'FNT', catKey: 'fonts' },
    { id: 'video', label: 'VID', catKey: 'video' },
    { id: 'inputPrompts', label: 'INP', catKey: 'inputPrompts' },
    { id: 'technical', label: 'TECH', catKey: 'technical' },
];
const CATEGORIES_ROW2 = [
    { id: 'sound', label: 'SND', catKey: 'sound' },
    { id: 'music', label: 'MUS', catKey: 'music' },
    { id: 'soundSprites', label: 'SDS', catKey: 'soundSprites' },
    { id: 'spritesheets', label: 'SSH', catKey: 'spritesheets' },
    { id: 'tilesets', label: 'TLS', catKey: 'tilesets' },
    { id: 'backgrounds', label: 'BGS', catKey: 'backgrounds' },
    { id: 'cursors', label: 'CSR', catKey: 'cursors' },
    { id: 'vendor', label: 'VND', catKey: 'vendor' },
];
const CATEGORIES = [...CATEGORIES_ROW1, ...CATEGORIES_ROW2];
const TECH_PURPOSE = {
    alpha: 'alpha / premultiplied / halo checks',
    filtering: 'nearest / linear / sampler checks',
    color: 'ramp / gamma / color-shift checks',
};
const BG_OPTIONS = [
    { label: 'W', r: 255, g: 255, b: 255 },
    { label: 'G', r: 45, g: 50, b: 65 },
    { label: 'K', r: 0, g: 0, b: 0 },
];
const C = {
    bg: new Color(26, 28, 38),
    toolbar: new Color(30, 34, 46),
    panel: new Color(32, 36, 48),
    active: new Color(58, 120, 218),
    hover: new Color(44, 50, 66),
    border: new Color(52, 58, 76),
    infoBar: new Color(18, 22, 32),
    btnDark: new Color(44, 52, 72),
    btnGreen: new Color(55, 150, 75),
    white: new Color(255, 255, 255),
    dim: new Color(140, 150, 170),
    dimDark: new Color(90, 98, 120),
    accent: new Color(100, 180, 255),
    black: new Color(0, 0, 0),
};
const app = new Application({
    canvas: { width: W, height: H, mount: document.body, sizingMode: 'fit' },
    clearColor: C.bg,
});
class AssetBrowserScene extends Scene {
    cat = 'textures';
    key = null;
    bgIdx = 1;
    scrollOff = 0;
    hoverIdx = null;
    audioMusics = new Map();
    soundMusics = new Map();
    musicMusics = new Map();
    soundSpriteAudio = new Map();
    // Single-asset preview playback: one Voice at a time, tied to `previewKey`.
    previewVoice = null;
    previewKey = null;
    frameIdx = 0;
    frameTimer = 0;
    animPlaying = true;
    texSprites = new Map();
    sprSheets = new Map();
    sshSheets = new Map();
    svgSprites = new Map();
    inpSheets = new Map();
    fontFamilies = new Map();
    techSprites = new Map();
    bgSprites = new Map();
    cursorSprites = new Map();
    tilesetSprites = new Map();
    soundSpriteData = new Map();
    vendorData = new Map();
    animG = null;
    audioG = null;
    copyBtnBg = null;
    fontSampleTexts = new Map();
    gToolbar = new Graphics();
    gSidebar = new Graphics();
    gPreview = new Graphics();
    gInfoBar = new Graphics();
    catBtnTexts = CATEGORIES.map(() => new Text('', { fillColor: C.white, fontSize: 11, fontWeight: 'bold' }));
    bgBtnTexts = BG_OPTIONS.map(() => new Text('', { fillColor: C.dim, fontSize: 11, fontWeight: 'bold' }));
    txtKey = new Text('', { fillColor: C.white, fontSize: 12, fontWeight: 'bold' });
    txtPath = new Text('', { fillColor: C.dim, fontSize: 11 });
    txtType = new Text('', { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' });
    txtCopy = new Text('COPY KEY', { fillColor: C.white, fontSize: 10 });
    itemTexts = Array.from({ length: 22 }, () => new Text('', { fillColor: C.white, fontSize: 13 }));
    techHeaderTexts = new Map([
        ['alpha', new Text('ALPHA', { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' })],
        ['filtering', new Text('FILTERING', { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' })],
        ['color', new Text('COLOR', { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' })],
    ]);
    txtTechPurpose = new Text('', { fillColor: C.dim, fontSize: 11 });
    txtNoAssets = new Text('globalThis.assets is not available.\nRun this example in the ExoJS playground.', { fillColor: C.dim, fontSize: 16 });
    txtEmptyCat = new Text('(empty)', { fillColor: C.dimDark, fontSize: 13 });
    txtNoSel = new Text('Select an asset from the list.', { fillColor: C.dimDark, fontSize: 14 });
    txtLoading = new Text('Loading assets…', { fillColor: C.dim, fontSize: 14 });
    txtMeta = new Text('', { fillColor: C.white, fontSize: 13, maxWidth: PREVIEW_W - 80 });
    txtAudioIcon = new Text('', { fillColor: C.white, fontSize: 28 });
    txtAnimPlay = new Text('', { fillColor: C.white, fontSize: 12 });
    txtAnimFrame = new Text('', { fillColor: C.dim, fontSize: 11 });
    // Lazy per-category loading: only the initial category is fetched up
    // front; every other one loads on first visit (see ensureCategory), so
    // the browser becomes interactive quickly instead of downloading the
    // whole catalog before the first frame.
    assetLoader = null;
    loadedCats = new Set();
    loadingCats = new Set();
    async load(loader) {
        this.assetLoader = loader;
        await this.ensureCategory(this.cat);
    }
    init(loader) {
        this.assetLoader = loader;
        this.app.input.onPointerTap.add(p => this.onTap(p.x, p.y));
        this.app.input.onPointerMove.add(p => this.onMove(p.x, p.y));
        this.app.input.onMouseWheel.add(v => this.onWheel(v.y));
        this.selectFirstInCategory();
    }
    /** Load a category's assets (and build its preview objects) exactly once. */
    async ensureCategory(catId) {
        if (this.loadedCats.has(catId) || this.loadingCats.has(catId))
            return;
        this.loadingCats.add(catId);
        try {
            await this.loadCategory(catId);
            this.loadedCats.add(catId);
        }
        finally {
            this.loadingCats.delete(catId);
        }
    }
    async loadCategory(catId) {
        const loader = this.assetLoader;
        switch (catId) {
            case 'textures': {
                const batch = {};
                for (const [k, url] of Object.entries(assets.demo.textures ?? {})) {
                    batch[`tex_${k}`] = url;
                }
                if (Object.keys(batch).length)
                    await loader.load(Texture, batch);
                for (const k of Object.keys(assets.demo.textures ?? {})) {
                    const s = new Sprite(loader.get(Texture, `tex_${k}`));
                    s.setAnchor(0.5);
                    this.texSprites.set(k, s);
                }
                break;
            }
            case 'sprites': {
                const imgBatch = {};
                const jsonBatch = {};
                for (const [k, entry] of Object.entries(assets.demo.sprites ?? {})) {
                    imgBatch[`spr_${k}`] = entry.image;
                    jsonBatch[`spr_${k}`] = entry.data;
                }
                if (Object.keys(imgBatch).length) {
                    await loader.load(Texture, imgBatch);
                    await loader.load(Json, jsonBatch);
                }
                for (const k of Object.keys(assets.demo.sprites ?? {})) {
                    const ss = new Spritesheet(loader.get(Texture, `spr_${k}`), loader.get(Json, `spr_${k}`).value);
                    this.sprSheets.set(k, ss);
                    for (const s of ss.sprites.values())
                        s.setAnchor(0.5);
                }
                break;
            }
            case 'spritesheets': {
                const imgBatch = {};
                const jsonBatch = {};
                for (const [k, entry] of Object.entries(assets.demo.spritesheets ?? {})) {
                    imgBatch[`ssh_${k}`] = entry.image;
                    jsonBatch[`ssh_${k}`] = entry.data;
                }
                if (Object.keys(imgBatch).length) {
                    await loader.load(Texture, imgBatch);
                    await loader.load(Json, jsonBatch);
                }
                for (const k of Object.keys(assets.demo.spritesheets ?? {})) {
                    const ss = new Spritesheet(loader.get(Texture, `ssh_${k}`), loader.get(Json, `ssh_${k}`).value);
                    this.sshSheets.set(k, ss);
                    for (const s of ss.sprites.values())
                        s.setAnchor(0.5);
                }
                break;
            }
            case 'svg': {
                const batch = {};
                for (const [k, url] of Object.entries(assets.demo.svg ?? {})) {
                    batch[`svg_${k}`] = url;
                }
                if (Object.keys(batch).length)
                    await loader.load(SvgAsset, batch);
                for (const k of Object.keys(assets.demo.svg ?? {})) {
                    const s = new Sprite(new Texture(loader.get(SvgAsset, `svg_${k}`)));
                    s.setAnchor(0.5);
                    this.svgSprites.set(k, s);
                }
                break;
            }
            case 'inputPrompts': {
                const imgBatch = {};
                const jsonBatch = {};
                for (const [k, entry] of Object.entries(assets.demo.inputPrompts ?? {})) {
                    imgBatch[`inp_${k}`] = entry.image;
                    jsonBatch[`inp_${k}`] = entry.data;
                }
                if (Object.keys(imgBatch).length) {
                    await loader.load(Texture, imgBatch);
                    await loader.load(Json, jsonBatch);
                }
                for (const k of Object.keys(assets.demo.inputPrompts ?? {})) {
                    const ss = new Spritesheet(loader.get(Texture, `inp_${k}`), loader.get(Json, `inp_${k}`).value);
                    this.inpSheets.set(k, ss);
                    for (const s of ss.sprites.values())
                        s.setAnchor(0.5);
                }
                break;
            }
            case 'audio': {
                const batch = {};
                for (const [k, url] of Object.entries(assets.demo.audio ?? {})) {
                    batch[`aud_${k}`] = url;
                }
                if (Object.keys(batch).length)
                    await loader.load(AudioStream, batch);
                for (const k of Object.keys(assets.demo.audio ?? {})) {
                    this.audioMusics.set(k, loader.get(AudioStream, `aud_${k}`));
                }
                break;
            }
            case 'sound': {
                const batch = {};
                for (const [k, url] of Object.entries(assets.demo.sound ?? {})) {
                    batch[`snd_${k}`] = url;
                }
                if (Object.keys(batch).length)
                    await loader.load(AudioStream, batch);
                for (const k of Object.keys(assets.demo.sound ?? {})) {
                    this.soundMusics.set(k, loader.get(AudioStream, `snd_${k}`));
                }
                break;
            }
            case 'music': {
                const batch = {};
                for (const [k, url] of Object.entries(assets.demo.music ?? {})) {
                    batch[`mus_${k}`] = url;
                }
                if (Object.keys(batch).length)
                    await loader.load(AudioStream, batch);
                for (const k of Object.keys(assets.demo.music ?? {})) {
                    this.musicMusics.set(k, loader.get(AudioStream, `mus_${k}`));
                }
                break;
            }
            case 'soundSprites': {
                const audioBatch = {};
                const jsonBatch = {};
                for (const [k, entry] of Object.entries(assets.demo.soundSprites ?? {})) {
                    audioBatch[`sds_${k}`] = entry.audio;
                    jsonBatch[`sds_${k}`] = entry.data;
                }
                if (Object.keys(audioBatch).length) {
                    await loader.load(AudioStream, audioBatch);
                    await loader.load(Json, jsonBatch);
                }
                for (const k of Object.keys(assets.demo.soundSprites ?? {})) {
                    this.soundSpriteAudio.set(k, loader.get(AudioStream, `sds_${k}`));
                    this.soundSpriteData.set(k, loader.get(Json, `sds_${k}`).value);
                }
                break;
            }
            case 'fonts': {
                for (const [k, url] of Object.entries(assets.demo.fonts ?? {})) {
                    // The fonts category mixes vector fonts (.ttf/.otf) with
                    // bitmap-font sidecars (.fnt/.png) that FontFace cannot
                    // parse. Load only the vector entries — the bitmap ones
                    // fall back to a path readout.
                    if (!/\.(ttf|otf|woff2?)$/i.test(url))
                        continue;
                    const family = `assetbrowser_${k}`;
                    await loader.load(FontAsset, { [`fnt_${k}`]: url }, { family });
                    this.fontFamilies.set(k, family);
                }
                break;
            }
            case 'technical': {
                const batch = {};
                for (const [subcat, items] of Object.entries(assets.technical ?? {})) {
                    for (const [k, u] of Object.entries(items)) {
                        batch[`tech_${subcat}_${k}`] = u;
                    }
                }
                if (Object.keys(batch).length)
                    await loader.load(Texture, batch);
                for (const [subcat, items] of Object.entries(assets.technical ?? {})) {
                    for (const k of Object.keys(items)) {
                        const s = new Sprite(loader.get(Texture, `tech_${subcat}_${k}`));
                        s.setAnchor(0.5);
                        this.techSprites.set(`${subcat}.${k}`, s);
                    }
                }
                break;
            }
            case 'backgrounds': {
                const batch = {};
                for (const [k, url] of Object.entries(assets.demo.backgrounds ?? {})) {
                    batch[`bg_${k}`] = url;
                }
                if (Object.keys(batch).length)
                    await loader.load(Texture, batch);
                for (const k of Object.keys(assets.demo.backgrounds ?? {})) {
                    const s = new Sprite(loader.get(Texture, `bg_${k}`));
                    s.setAnchor(0.5);
                    this.bgSprites.set(k, s);
                }
                break;
            }
            case 'cursors': {
                const batch = {};
                for (const [k, url] of Object.entries(assets.demo.cursors ?? {})) {
                    batch[`cur_${k}`] = url;
                }
                if (Object.keys(batch).length)
                    await loader.load(SvgAsset, batch);
                for (const k of Object.keys(assets.demo.cursors ?? {})) {
                    const s = new Sprite(new Texture(loader.get(SvgAsset, `cur_${k}`)));
                    s.setAnchor(0.5);
                    this.cursorSprites.set(k, s);
                }
                break;
            }
            case 'tilesets': {
                const batch = {};
                for (const [k, entry] of Object.entries(assets.demo.tilesets ?? {})) {
                    batch[`tls_${k}`] = entry.image;
                }
                if (Object.keys(batch).length)
                    await loader.load(Texture, batch);
                for (const k of Object.keys(assets.demo.tilesets ?? {})) {
                    const s = new Sprite(loader.get(Texture, `tls_${k}`));
                    s.setAnchor(0.5);
                    this.tilesetSprites.set(k, s);
                }
                break;
            }
            case 'vendor': {
                const batch = {};
                for (const [k, url] of Object.entries(assets.demo.vendor ?? {})) {
                    batch[`vnd_${k}`] = url;
                }
                if (Object.keys(batch).length)
                    await loader.load(Json, batch);
                for (const k of Object.keys(assets.demo.vendor ?? {})) {
                    this.vendorData.set(k, loader.get(Json, `vnd_${k}`).value);
                }
                break;
            }
            default:
                // 'video' previews only show the asset URL — nothing to load.
                break;
        }
    }
    techFlatKeys() {
        const out = [];
        for (const subcat of ['alpha', 'filtering', 'color']) {
            const items = assets.technical[subcat];
            if (!items)
                continue;
            out.push(subcat);
            for (const k of Object.keys(items))
                out.push(`${subcat}.${k}`);
        }
        return out;
    }
    keys() {
        if (this.cat === 'technical')
            return this.techFlatKeys();
        const cat = CATEGORIES.find(c => c.id === this.cat);
        const obj = getCategoryData(cat?.catKey ?? '');
        return obj ? Object.keys(obj) : [];
    }
    assetPath() {
        if (!this.key)
            return '';
        if (this.cat === 'technical') {
            if (!this.key.includes('.'))
                return '';
            const [subcat, itemKey] = this.key.split('.');
            return assets.technical[subcat]?.[itemKey] ?? '';
        }
        const cat = CATEGORIES.find(c => c.id === this.cat);
        const v = getCategoryData(cat?.catKey ?? '')[this.key];
        if (typeof v === 'string')
            return v;
        if (v && typeof v.image === 'string')
            return v.image;
        if (v && typeof v.audio === 'string')
            return v.audio;
        return '';
    }
    typeLabel() {
        return this.assetPath().split('.').pop()?.toUpperCase() ?? '';
    }
    selectFirstInCategory() {
        const keys = this.keys();
        this.key = this.cat === 'technical'
            ? (keys.find(k => k.includes('.')) ?? null)
            : (keys[0] ?? null);
        this.scrollOff = 0;
        this.resetPreviewState();
    }
    resetPreviewState() {
        this.stopAllAudio();
        this.frameIdx = 0;
        this.frameTimer = 0;
        this.animPlaying = true;
    }
    stopAllAudio() {
        if (this.previewVoice) {
            this.previewVoice.stop();
            this.previewVoice = null;
            this.previewKey = null;
        }
    }
    /** True when the selected key's preview voice is live and not paused. */
    previewIsPlaying() {
        return this.previewVoice !== null && !this.previewVoice.ended && !this.previewVoice.paused && this.previewKey === this.key;
    }
    currentPlayingMap() {
        if (this.cat === 'audio')
            return this.audioMusics;
        if (this.cat === 'sound')
            return this.soundMusics;
        if (this.cat === 'music')
            return this.musicMusics;
        if (this.cat === 'soundSprites')
            return this.soundSpriteAudio;
        return null;
    }
    toggleAudio() {
        if (!this.key)
            return;
        const map = this.currentPlayingMap();
        if (!map)
            return;
        const stream = map.get(this.key);
        if (!stream)
            return;
        if (this.previewKey === this.key && this.previewVoice && !this.previewVoice.ended) {
            // Same asset selected: pause / resume the live voice.
            if (this.previewVoice.paused)
                this.previewVoice.resume();
            else
                this.previewVoice.pause();
        }
        else {
            // New asset: stop the previous preview and start this one.
            this.previewVoice?.stop();
            this.previewVoice = this.app.audio.play(stream);
            this.previewKey = this.key;
        }
    }
    currentFrameKeys() {
        if (this.cat === 'sprites')
            return [...(this.sprSheets.get(this.key ?? '')?.sprites.keys() ?? [])];
        if (this.cat === 'spritesheets')
            return [...(this.sshSheets.get(this.key ?? '')?.sprites.keys() ?? [])];
        if (this.cat === 'inputPrompts')
            return [...(this.inpSheets.get(this.key ?? '')?.sprites.keys() ?? [])];
        return [];
    }
    maxScroll() {
        const visibleItems = Math.floor((H - LIST_Y) / ITEM_H);
        return Math.max(0, this.keys().length - visibleItems);
    }
    isAudioLikeCategory() {
        return this.cat === 'audio' || this.cat === 'sound'
            || this.cat === 'music' || this.cat === 'soundSprites';
    }
    onTap(x, y) {
        for (let i = 0; i < CATEGORIES_ROW1.length; i++) {
            const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
            if (x >= bx && x < bx + CAT_BTN_W && y >= CAT_BTN_Y1 && y < CAT_BTN_Y1 + CAT_BTN_H) {
                if (this.cat !== CATEGORIES_ROW1[i].id) {
                    this.cat = CATEGORIES_ROW1[i].id;
                    this.selectFirstInCategory();
                    void this.ensureCategory(this.cat);
                }
                return;
            }
        }
        for (let i = 0; i < CATEGORIES_ROW2.length; i++) {
            const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
            if (x >= bx && x < bx + CAT_BTN_W && y >= CAT_BTN_Y2 && y < CAT_BTN_Y2 + CAT_BTN_H) {
                if (this.cat !== CATEGORIES_ROW2[i].id) {
                    this.cat = CATEGORIES_ROW2[i].id;
                    this.selectFirstInCategory();
                    void this.ensureCategory(this.cat);
                }
                return;
            }
        }
        for (let i = 0; i < BG_OPTIONS.length; i++) {
            const bx = BG_BTN_X0 + i * (BG_BTN_SIZE + 5);
            if (x >= bx && x < bx + BG_BTN_SIZE && y >= BG_BTN_Y && y < BG_BTN_Y + BG_BTN_SIZE) {
                this.bgIdx = i;
                return;
            }
        }
        if (x >= 0 && x < SIDEBAR_W && y >= TOOLBAR_H) {
            const keys = this.keys();
            const idx = Math.floor((y - LIST_Y) / ITEM_H) + this.scrollOff;
            if (idx >= 0 && idx < keys.length) {
                const newKey = keys[idx];
                const isHeader = this.cat === 'technical' && !newKey.includes('.');
                if (!isHeader && newKey !== this.key) {
                    this.key = newKey;
                    this.resetPreviewState();
                }
            }
            return;
        }
        if (this.key && x >= PREVIEW_X + PREVIEW_W - 84 && x < PREVIEW_X + PREVIEW_W - 10
            && y >= PREVIEW_Y + 8 && y < PREVIEW_Y + 8 + 26) {
            const fullKey = `assets.${this.cat}.${this.key}`;
            navigator.clipboard?.writeText(fullKey).catch(() => undefined);
            return;
        }
        if (this.isAudioLikeCategory() && this.key) {
            const bx = PREVIEW_X + (PREVIEW_W - 100) / 2;
            const by = PREVIEW_Y + PREVIEW_H / 2 - 30;
            if (x >= bx && x < bx + 100 && y >= by && y < by + 56) {
                this.toggleAudio();
                return;
            }
        }
        if ((this.cat === 'sprites' || this.cat === 'spritesheets' || this.cat === 'inputPrompts') && this.key) {
            const bx = PREVIEW_X + 16;
            const by = H - 48;
            if (x >= bx && x < bx + 90 && y >= by && y < by + 30) {
                this.animPlaying = !this.animPlaying;
                return;
            }
        }
    }
    onMove(x, y) {
        this.hoverIdx = null;
        if (x >= 0 && x < SIDEBAR_W && y >= TOOLBAR_H) {
            const keys = this.keys();
            const idx = Math.floor((y - LIST_Y) / ITEM_H) + this.scrollOff;
            if (idx >= 0 && idx < keys.length) {
                const isHeader = this.cat === 'technical' && !keys[idx].includes('.');
                if (!isHeader)
                    this.hoverIdx = idx;
            }
        }
    }
    onWheel(dy) {
        const maxScroll = this.maxScroll();
        const delta = dy > 0 ? 1 : -1;
        this.scrollOff = Math.max(0, Math.min(maxScroll, this.scrollOff + delta));
    }
    update(delta) {
        if (!this.animPlaying)
            return;
        if (this.cat !== 'sprites' && this.cat !== 'spritesheets' && this.cat !== 'inputPrompts')
            return;
        const frames = this.currentFrameKeys();
        if (!frames.length)
            return;
        this.frameTimer += delta.seconds;
        if (this.frameTimer >= 0.07) {
            this.frameTimer = 0;
            this.frameIdx = (this.frameIdx + 1) % frames.length;
        }
    }
    draw(context) {
        context.backend.clear(C.bg);
        this.drawPreviewBg(context);
        this.drawPreviewContent(context);
        this.drawSidebar(context);
        this.drawToolbar(context);
    }
    drawNoAssets(context) {
        const g = this.gPreview;
        g.clear();
        g.fillColor = C.panel;
        g.drawRectangle(0, 0, W, H);
        context.render(g);
        context.render(this.txtNoAssets);
    }
    drawToolbar(context) {
        const g = this.gToolbar;
        g.clear();
        g.fillColor = C.toolbar;
        g.drawRectangle(0, 0, W, TOOLBAR_H);
        g.lineWidth = 1;
        g.lineColor = C.border;
        g.drawLine(0, TOOLBAR_H - 1, W, TOOLBAR_H - 1);
        g.drawLine(0, CAT_BTN_Y2 - 4, W, CAT_BTN_Y2 - 4);
        for (let i = 0; i < CATEGORIES_ROW1.length; i++) {
            const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
            g.fillColor = this.cat === CATEGORIES_ROW1[i].id ? C.active : C.btnDark;
            g.lineWidth = 0;
            g.drawRectangle(bx, CAT_BTN_Y1, CAT_BTN_W, CAT_BTN_H);
        }
        for (let i = 0; i < CATEGORIES_ROW2.length; i++) {
            const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
            g.fillColor = this.cat === CATEGORIES_ROW2[i].id ? C.active : C.btnDark;
            g.lineWidth = 0;
            g.drawRectangle(bx, CAT_BTN_Y2, CAT_BTN_W, CAT_BTN_H);
        }
        for (let i = 0; i < BG_OPTIONS.length; i++) {
            const { r, g: gv, b } = BG_OPTIONS[i];
            const bx = BG_BTN_X0 + i * (BG_BTN_SIZE + 5);
            g.fillColor = new Color(r, gv, b);
            g.lineWidth = this.bgIdx === i ? 2 : 1;
            g.lineColor = this.bgIdx === i ? C.accent : C.border;
            g.drawRectangle(bx, BG_BTN_Y, BG_BTN_SIZE, BG_BTN_SIZE);
        }
        context.render(g);
        for (let i = 0; i < CATEGORIES_ROW1.length; i++) {
            const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
            const t = this.catBtnTexts[i];
            t.text = CATEGORIES_ROW1[i].label;
            t.setPosition(bx + (CAT_BTN_W - 22) / 2, CAT_BTN_Y1 + 12);
            context.render(t);
        }
        for (let i = 0; i < CATEGORIES_ROW2.length; i++) {
            const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
            const t = this.catBtnTexts[CATEGORIES_ROW1.length + i];
            t.text = CATEGORIES_ROW2[i].label;
            t.setPosition(bx + (CAT_BTN_W - 22) / 2, CAT_BTN_Y2 + 12);
            context.render(t);
        }
        for (let i = 0; i < BG_OPTIONS.length; i++) {
            const bx = BG_BTN_X0 + i * (BG_BTN_SIZE + 5);
            const t = this.bgBtnTexts[i];
            t.text = BG_OPTIONS[i].label;
            t.style.fillColor = i === 1 ? C.white : C.dim;
            t.setPosition(bx + 7, BG_BTN_Y + 7);
            context.render(t);
        }
    }
    drawSidebar(context) {
        const g = this.gSidebar;
        g.clear();
        g.fillColor = C.panel;
        g.drawRectangle(0, TOOLBAR_H, SIDEBAR_W, H - TOOLBAR_H);
        g.lineWidth = 1;
        g.lineColor = C.border;
        g.drawLine(SIDEBAR_W, TOOLBAR_H, SIDEBAR_W, H);
        const keys = this.keys();
        for (let i = 0; i < keys.length; i++) {
            const iy = LIST_Y + (i - this.scrollOff) * ITEM_H;
            if (iy + ITEM_H <= TOOLBAR_H || iy >= H)
                continue;
            const isHeader = this.cat === 'technical' && !keys[i].includes('.');
            const isSelected = !isHeader && keys[i] === this.key;
            const isHover = !isHeader && this.hoverIdx === i && !isSelected;
            if (isHeader) {
                g.fillColor = C.infoBar;
                g.lineWidth = 0;
                g.drawRectangle(0, iy, SIDEBAR_W - 1, ITEM_H);
            }
            else if (isSelected) {
                g.fillColor = C.active;
                g.lineWidth = 0;
                g.drawRectangle(0, iy, SIDEBAR_W - 1, ITEM_H);
            }
            else if (isHover) {
                g.fillColor = C.hover;
                g.lineWidth = 0;
                g.drawRectangle(0, iy, SIDEBAR_W - 1, ITEM_H);
            }
        }
        context.render(g);
        for (let i = 0; i < keys.length && (i - this.scrollOff) < this.itemTexts.length; i++) {
            const iy = LIST_Y + (i - this.scrollOff) * ITEM_H;
            if (iy + ITEM_H <= TOOLBAR_H || iy >= H)
                continue;
            if (this.cat === 'technical' && !keys[i].includes('.')) {
                const ht = this.techHeaderTexts.get(keys[i]);
                if (ht) {
                    ht.setPosition(10, iy + 12);
                    context.render(ht);
                }
                continue;
            }
            const t = this.itemTexts[i - this.scrollOff];
            if (!t)
                continue;
            t.text = this.cat === 'technical' ? (keys[i].split('.')[1] ?? keys[i]) : keys[i];
            t.style.fillColor = keys[i] === this.key ? C.white : C.dim;
            t.setPosition(this.cat === 'technical' ? 18 : 10, iy + 10);
            context.render(t);
        }
        if (keys.length === 0) {
            this.txtEmptyCat.setPosition(60, LIST_Y + 14);
            context.render(this.txtEmptyCat);
        }
    }
    drawPreviewBg(context) {
        const { r, g, b } = BG_OPTIONS[this.bgIdx];
        const bg = this.gPreview;
        bg.clear();
        bg.fillColor = new Color(r, g, b);
        bg.drawRectangle(PREVIEW_X, PREVIEW_Y, PREVIEW_W, PREVIEW_H);
        context.render(bg);
    }
    drawPreviewContent(context) {
        if (!this.key) {
            this.txtNoSel.setPosition(PREVIEW_X + (PREVIEW_W / 2) - 130, H / 2 - 10);
            context.render(this.txtNoSel);
            this.drawInfoBar(context);
            return;
        }
        // Category still fetching (lazy-load): keep the sidebar interactive
        // and show a placeholder instead of an empty preview.
        if (!this.loadedCats.has(this.cat)) {
            this.txtLoading.setPosition(PREVIEW_X + (PREVIEW_W / 2) - 70, H / 2 - 10);
            context.render(this.txtLoading);
            this.drawInfoBar(context);
            return;
        }
        switch (this.cat) {
            case 'textures':
                this.drawTexPreview(context);
                break;
            case 'sprites':
                this.drawSprPreview(context);
                break;
            case 'spritesheets':
                this.drawSshPreview(context);
                break;
            case 'svg':
                this.drawSvgPreview(context);
                break;
            case 'audio':
                this.drawAudioPreview(context, this.audioMusics);
                break;
            case 'sound':
                this.drawAudioPreview(context, this.soundMusics);
                break;
            case 'music':
                this.drawAudioPreview(context, this.musicMusics);
                break;
            case 'soundSprites':
                this.drawSoundSpritePreview(context);
                break;
            case 'fonts':
                this.drawFontPreview(context);
                break;
            case 'video':
                this.drawVideoPreview(context);
                break;
            case 'inputPrompts':
                this.drawInpPreview(context);
                break;
            case 'technical':
                this.drawTechPreview(context);
                break;
            case 'backgrounds':
                this.drawBgPreview(context);
                break;
            case 'cursors':
                this.drawCursorPreview(context);
                break;
            case 'tilesets':
                this.drawTilesetPreview(context);
                break;
            case 'vendor':
                this.drawVendorPreview(context);
                break;
        }
        this.drawInfoBar(context);
    }
    drawInfoBar(context) {
        const g = this.gInfoBar;
        g.clear();
        g.fillColor = C.infoBar;
        g.drawRectangle(PREVIEW_X, PREVIEW_Y, PREVIEW_W, 44);
        g.lineWidth = 1;
        g.lineColor = C.border;
        g.drawLine(PREVIEW_X, PREVIEW_Y + 44, W, PREVIEW_Y + 44);
        context.render(g);
        if (!this.key)
            return;
        this.txtKey.text = `assets.${this.cat}.${this.key}`;
        this.txtKey.setPosition(PREVIEW_X + 10, PREVIEW_Y + 5);
        context.render(this.txtKey);
        this.txtPath.text = this.assetPath();
        this.txtPath.setPosition(PREVIEW_X + 10, PREVIEW_Y + 24);
        context.render(this.txtPath);
        const ext = this.typeLabel();
        if (ext) {
            this.txtType.text = ext;
            this.txtType.setPosition(PREVIEW_X + PREVIEW_W - 160, PREVIEW_Y + 15);
            context.render(this.txtType);
        }
        if (!this.copyBtnBg)
            this.copyBtnBg = new Graphics();
        const copyX = PREVIEW_X + PREVIEW_W - 84;
        const copyY = PREVIEW_Y + 9;
        this.copyBtnBg.clear();
        this.copyBtnBg.fillColor = C.btnDark;
        this.copyBtnBg.lineWidth = 1;
        this.copyBtnBg.lineColor = C.border;
        this.copyBtnBg.drawRectangle(copyX, copyY, 72, 26);
        context.render(this.copyBtnBg);
        this.txtCopy.setPosition(copyX + 10, copyY + 7);
        context.render(this.txtCopy);
    }
    previewCenter() {
        return {
            cx: PREVIEW_X + PREVIEW_W / 2,
            cy: PREVIEW_Y + 44 + (PREVIEW_H - 44) / 2,
            maxW: PREVIEW_W - 80,
            maxH: PREVIEW_H - 80,
        };
    }
    fitSprite(sprite, maxW, maxH, cx, cy) {
        const tex = sprite.texture;
        if (!tex)
            return;
        const tw = tex.width || 128;
        const th = tex.height || 128;
        const scale = Math.min(maxW / tw, maxH / th, 3);
        sprite.setScale(scale);
        sprite.setPosition(cx, cy);
    }
    drawTexPreview(context) {
        const sprite = this.texSprites.get(this.key ?? '');
        if (!sprite)
            return;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH, cx, cy);
        context.render(sprite);
    }
    drawSprPreview(context) {
        const ss = this.sprSheets.get(this.key ?? '');
        if (!ss)
            return;
        const frames = [...ss.sprites.keys()];
        if (!frames.length)
            return;
        const sprite = ss.getFrameSprite(frames[this.frameIdx % frames.length]);
        sprite.setAnchor(0.5);
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH - 50, cx, cy);
        context.render(sprite);
        this.drawAnimControls(context, frames.length);
    }
    drawSshPreview(context) {
        const ss = this.sshSheets.get(this.key ?? '');
        if (!ss)
            return;
        const frames = [...ss.sprites.keys()];
        if (!frames.length)
            return;
        const sprite = ss.getFrameSprite(frames[this.frameIdx % frames.length]);
        sprite.setAnchor(0.5);
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH - 50, cx, cy);
        context.render(sprite);
        this.drawAnimControls(context, frames.length);
    }
    drawInpPreview(context) {
        const ss = this.inpSheets.get(this.key ?? '');
        if (ss) {
            const frames = [...ss.sprites.keys()];
            if (frames.length > 0) {
                const sprite = ss.getFrameSprite(frames[this.frameIdx % frames.length]);
                sprite.setAnchor(0.5);
                const { cx, cy, maxW, maxH } = this.previewCenter();
                this.fitSprite(sprite, maxW, maxH - 50, cx, cy);
                context.render(sprite);
                this.drawAnimControls(context, frames.length);
                return;
            }
        }
    }
    drawSvgPreview(context) {
        const sprite = this.svgSprites.get(this.key ?? '');
        if (!sprite)
            return;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH, cx, cy);
        context.render(sprite);
    }
    drawAudioPreview(context, musicMap) {
        if (!this.audioG)
            this.audioG = new Graphics();
        const music = musicMap.get(this.key ?? '');
        const isPlaying = music ? this.previewIsPlaying() : false;
        const g = this.audioG;
        const { cx, cy } = this.previewCenter();
        const bx = cx - 50;
        const by = cy - 28;
        g.clear();
        g.fillColor = isPlaying ? C.btnGreen : C.btnDark;
        g.lineWidth = 1;
        g.lineColor = C.border;
        g.drawRectangle(bx, by, 100, 56);
        context.render(g);
        this.txtAudioIcon.text = isPlaying ? '⏸' : '▶';
        this.txtAudioIcon.setPosition(bx + (isPlaying ? 30 : 34), by + 10);
        context.render(this.txtAudioIcon);
        this.txtMeta.text = this.typeLabel();
        this.txtMeta.setPosition(cx - 15, by + 68);
        context.render(this.txtMeta);
    }
    drawSoundSpritePreview(context) {
        if (!this.audioG)
            this.audioG = new Graphics();
        const music = this.soundSpriteAudio.get(this.key ?? '');
        const data = this.soundSpriteData.get(this.key ?? '');
        const isPlaying = music ? this.previewIsPlaying() : false;
        const sprites = data?.sprites ?? {};
        const g = this.audioG;
        const { cx } = this.previewCenter();
        const bx = cx - 50;
        const by = PREVIEW_Y + 56;
        g.clear();
        g.fillColor = isPlaying ? C.btnGreen : C.btnDark;
        g.lineWidth = 1;
        g.lineColor = C.border;
        g.drawRectangle(bx, by, 100, 44);
        context.render(g);
        this.txtAudioIcon.text = isPlaying ? '⏸' : '▶';
        this.txtAudioIcon.setPosition(bx + (isPlaying ? 30 : 34), by + 6);
        context.render(this.txtAudioIcon);
        let y = by + 64;
        for (const [name, info] of Object.entries(sprites)) {
            this.txtMeta.text = `${name}  start:${info.start.toFixed(3)}s  dur:${info.duration.toFixed(3)}s`;
            this.txtMeta.setPosition(PREVIEW_X + 30, y);
            context.render(this.txtMeta);
            y += 20;
            if (y > H - 20)
                break;
        }
    }
    drawFontPreview(context) {
        const family = this.fontFamilies.get(this.key ?? '');
        if (!family) {
            this.txtMeta.text = `Font: ${this.key}\n${this.assetPath()}`;
            this.txtMeta.setPosition(PREVIEW_X + 40, PREVIEW_Y + 80);
            context.render(this.txtMeta);
            return;
        }
        let t = this.fontSampleTexts.get(this.key ?? '');
        if (!t) {
            t = new Text('AaBbCc 123 !?', { fontFamily: family, fontSize: 48, fillColor: C.white });
            this.fontSampleTexts.set(this.key ?? '', t);
        }
        t.style.fillColor = this.bgIdx === 0 ? C.black : C.white;
        t.setPosition(PREVIEW_X + 40, PREVIEW_Y + 120);
        context.render(t);
        let t2 = this.fontSampleTexts.get(`${this.key}_sm`);
        if (!t2) {
            t2 = new Text('The quick brown fox jumps over the lazy dog', { fontFamily: family, fontSize: 20, fillColor: C.dim });
            this.fontSampleTexts.set(`${this.key}_sm`, t2);
        }
        t2.style.fillColor = this.bgIdx === 0 ? C.dimDark : C.dim;
        t2.setPosition(PREVIEW_X + 40, PREVIEW_Y + 190);
        context.render(t2);
    }
    drawVideoPreview(context) {
        this.txtMeta.text =
            `VIDEO\n\nKey: assets.video.${this.key}\nURL: ${this.assetPath()}\n\nOpen the URL in your browser to preview.`;
        this.txtMeta.setPosition(PREVIEW_X + 40, PREVIEW_Y + 80);
        context.render(this.txtMeta);
    }
    drawTechPreview(context) {
        if (!this.key?.includes('.'))
            return;
        const sprite = this.techSprites.get(this.key);
        if (!sprite)
            return;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH - 28, cx, cy - 14);
        context.render(sprite);
        const subcat = this.key.split('.')[0];
        const purpose = TECH_PURPOSE[subcat] ?? '';
        if (purpose) {
            this.txtTechPurpose.text = purpose;
            this.txtTechPurpose.setPosition(PREVIEW_X + 16, PREVIEW_Y + PREVIEW_H - 22);
            context.render(this.txtTechPurpose);
        }
    }
    drawBgPreview(context) {
        const sprite = this.bgSprites.get(this.key ?? '');
        if (!sprite)
            return;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH, cx, cy);
        context.render(sprite);
    }
    drawCursorPreview(context) {
        const sprite = this.cursorSprites.get(this.key ?? '');
        if (!sprite)
            return;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, Math.min(maxW, 256), Math.min(maxH, 256), cx, cy);
        context.render(sprite);
    }
    drawTilesetPreview(context) {
        const sprite = this.tilesetSprites.get(this.key ?? '');
        if (!sprite)
            return;
        const entry = assets.demo.tilesets[this.key ?? ''];
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH - 30, cx, cy - 15);
        context.render(sprite);
        if (entry?.tileWidth && entry?.tileHeight) {
            this.txtMeta.text = `tile: ${entry.tileWidth}×${entry.tileHeight}px`;
            this.txtMeta.setPosition(PREVIEW_X + 16, PREVIEW_Y + PREVIEW_H - 22);
            context.render(this.txtMeta);
        }
    }
    drawVendorPreview(context) {
        const data = this.vendorData.get(this.key ?? '');
        if (!data) {
            this.txtMeta.text = `Loading: ${this.assetPath()}`;
            this.txtMeta.setPosition(PREVIEW_X + 30, PREVIEW_Y + 80);
            context.render(this.txtMeta);
            return;
        }
        const packs = data.packs ?? [];
        const lines = [
            `License: ${data.license ?? 'CC0'}`,
            `Packs: ${packs.length}`,
            '',
            ...packs.slice(0, 14).map((p) => `  ${p.slug}  (${Object.values(p.fileCountByExtension ?? {}).reduce((a, b) => a + b, 0)} files)`),
        ];
        this.txtMeta.text = lines.join('\n');
        this.txtMeta.setPosition(PREVIEW_X + 30, PREVIEW_Y + 60);
        context.render(this.txtMeta);
    }
    drawAnimControls(context, frameCount) {
        if (!this.animG)
            this.animG = new Graphics();
        const g = this.animG;
        const bx = PREVIEW_X + 16;
        const by = H - 48;
        g.clear();
        g.fillColor = this.animPlaying ? C.active : C.btnDark;
        g.lineWidth = 1;
        g.lineColor = C.border;
        g.drawRectangle(bx, by, 88, 30);
        context.render(g);
        this.txtAnimPlay.text = this.animPlaying ? '⏸ PAUSE' : '▶ PLAY';
        this.txtAnimPlay.setPosition(bx + 14, by + 8);
        context.render(this.txtAnimPlay);
        this.txtAnimFrame.text = `${(this.frameIdx % frameCount) + 1} / ${frameCount}`;
        this.txtAnimFrame.setPosition(PREVIEW_X + 112, by + 10);
        context.render(this.txtAnimFrame);
    }
}
app.start(new AssetBrowserScene());
