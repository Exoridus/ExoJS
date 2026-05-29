import {
    Application, Color, Graphics, Json, Music, Scene,
    Sprite, Spritesheet, SvgAsset, Text, Texture,
} from '@codexo/exojs';

// ─── Asset catalog ────────────────────────────────────────────────────────────
const catalog = globalThis.assets ?? null;

// ─── Layout constants ─────────────────────────────────────────────────────────
const W = 900;
const H = 680;
const TOOLBAR_H = 110;
const SIDEBAR_W = 220;
const ITEM_H = 36;
const LIST_Y = TOOLBAR_H + 4;
const PREVIEW_X = SIDEBAR_W;
const PREVIEW_Y = TOOLBAR_H;
const PREVIEW_W = W - SIDEBAR_W;
const PREVIEW_H = H - TOOLBAR_H;

// Category toolbar – two rows of 8
const CAT_BTN_W = 82;
const CAT_BTN_H = 38;
const CAT_BTN_Y1 = 6;
const CAT_BTN_Y2 = 58;
const CAT_BTN_X0 = 6;

// BG toggle buttons (right side of toolbar, row 1)
const BG_BTN_SIZE = 26;
const BG_BTN_Y = 16;
const BG_BTN_X0 = W - 3 * (BG_BTN_SIZE + 5) - 6;

// ─── Data ─────────────────────────────────────────────────────────────────────
const CATEGORIES_ROW1 = [
    { id: 'textures',     label: 'IMG',  catKey: 'textures' },
    { id: 'sprites',      label: 'SPR',  catKey: 'sprites' },
    { id: 'audio',        label: 'AUD',  catKey: 'audio' },
    { id: 'svg',          label: 'SVG',  catKey: 'svg' },
    { id: 'fonts',        label: 'FNT',  catKey: 'fonts' },
    { id: 'video',        label: 'VID',  catKey: 'video' },
    { id: 'inputPrompts', label: 'INP',  catKey: 'inputPrompts' },
    { id: 'technical',    label: 'TECH', catKey: 'technical' },
];

const CATEGORIES_ROW2 = [
    { id: 'sound',        label: 'SND',  catKey: 'sound' },
    { id: 'music',        label: 'MUS',  catKey: 'music' },
    { id: 'soundSprites', label: 'SDS',  catKey: 'soundSprites' },
    { id: 'spritesheets', label: 'SSH',  catKey: 'spritesheets' },
    { id: 'tilesets',     label: 'TLS',  catKey: 'tilesets' },
    { id: 'backgrounds',  label: 'BGS',  catKey: 'backgrounds' },
    { id: 'cursors',      label: 'CSR',  catKey: 'cursors' },
    { id: 'vendor',       label: 'VND',  catKey: 'vendor' },
];

const CATEGORIES = [...CATEGORIES_ROW1, ...CATEGORIES_ROW2];

const TECH_PURPOSE = {
    alpha:     'alpha / premultiplied / halo checks',
    filtering: 'nearest / linear / sampler checks',
    color:     'ramp / gamma / color-shift checks',
};

const BG_OPTIONS = [
    { label: 'W', r: 255, g: 255, b: 255 },
    { label: 'G', r: 45,  g: 50,  b: 65  },
    { label: 'K', r: 0,   g: 0,   b: 0   },
];

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
    bg:        new Color(26,  28,  38),
    toolbar:   new Color(30,  34,  46),
    panel:     new Color(32,  36,  48),
    active:    new Color(58,  120, 218),
    hover:     new Color(44,  50,  66),
    border:    new Color(52,  58,  76),
    infoBar:   new Color(18,  22,  32),
    btnDark:   new Color(44,  52,  72),
    btnGreen:  new Color(55,  150, 75),
    white:     new Color(255, 255, 255),
    dim:       new Color(140, 150, 170),
    dimDark:   new Color(90,  98,  120),
    accent:    new Color(100, 180, 255),
    black:     new Color(0,   0,   0),
};

// ─── Application ──────────────────────────────────────────────────────────────
const app = new Application({
    canvas: { width: W, height: H },
    clearColor: C.bg,
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        // ── State ──────────────────────────────────────────────────────────
        _cat = 'textures';
        _key = null;
        _bgIdx = 1;
        _scrollOff = 0;
        _hoverIdx = null;

        // Audio state — keyed by catalog key → Music instance
        _audioMusics    = new Map();  // audio.*
        _soundMusics    = new Map();  // sound.*
        _musicMusics    = new Map();  // music.*
        _soundSpriteAudio = new Map(); // soundSprites.* → Music

        // Sprite animation state
        _frameIdx = 0;
        _frameTimer = 0;
        _animPlaying = true;

        // Asset maps (populated in init())
        _texSprites     = new Map();  // textures.key → Sprite
        _sprSheets      = new Map();  // sprites.key  → Spritesheet
        _sshSheets      = new Map();  // spritesheets.key → Spritesheet
        _svgSprites     = new Map();  // svg.key → Sprite
        _inpSheets      = new Map();  // inputPrompts.key → Spritesheet
        _fontFamilies   = new Map();  // fonts.key → CSS family string
        _techSprites    = new Map();  // 'subcat.key' → Sprite
        _bgSprites      = new Map();  // backgrounds.key → Sprite
        _cursorSprites  = new Map();  // cursors.key → Sprite
        _tilesetSprites = new Map();  // tilesets.key → Sprite
        _soundSpriteData = new Map(); // soundSprites.key → parsed JSON
        _vendorData     = new Map();  // vendor.key → parsed JSON

        // Lazily created per-draw objects
        _animG = null;
        _audioG = null;
        _copyBtnBg = null;
        _fontSampleTexts = new Map();

        // ── Graphics objects ───────────────────────────────────────────────
        _gToolbar  = new Graphics();
        _gSidebar  = new Graphics();
        _gPreview  = new Graphics();
        _gInfoBar  = new Graphics();

        // ── Static text objects ────────────────────────────────────────────
        _catBtnTexts  = CATEGORIES.map(c => {
            const t = new Text(c.label, { fillColor: C.white, fontSize: 11, fontWeight: 'bold' });
            return t;
        });
        _bgBtnTexts = BG_OPTIONS.map(o => new Text(o.label, { fillColor: C.dim, fontSize: 11, fontWeight: 'bold' }));

        _txtKey   = new Text('', { fillColor: C.white,  fontSize: 12, fontWeight: 'bold' });
        _txtPath  = new Text('', { fillColor: C.dim,    fontSize: 11 });
        _txtType  = new Text('', { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' });
        _txtCopy  = new Text('COPY KEY', { fillColor: C.white, fontSize: 10 });

        _itemTexts = Array.from({ length: 22 }, () => new Text('', { fillColor: C.white, fontSize: 13 }));

        _techHeaderTexts = new Map([
            ['alpha',     new Text('ALPHA',     { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' })],
            ['filtering', new Text('FILTERING', { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' })],
            ['color',     new Text('COLOR',     { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' })],
        ]);

        _txtTechPurpose = new Text('', { fillColor: C.dim, fontSize: 11 });

        _txtNoAssets  = new Text(
            'globalThis.assets is not available.\nRun this example in the ExoJS playground.',
            { fillColor: C.dim, fontSize: 16 },
        );
        _txtEmptyCat  = new Text('(empty)', { fillColor: C.dimDark, fontSize: 13 });
        _txtNoSel     = new Text('Select an asset from the list.', { fillColor: C.dimDark, fontSize: 14 });
        _txtMeta      = new Text('', { fillColor: C.white, fontSize: 13 }, { maxWidth: PREVIEW_W - 80 });
        _txtAudioIcon = new Text('', { fillColor: C.white, fontSize: 28 });
        _txtAnimPlay  = new Text('', { fillColor: C.white, fontSize: 12 });
        _txtAnimFrame = new Text('', { fillColor: C.dim,   fontSize: 11 });

        // ── Load phase ─────────────────────────────────────────────────────
        async load(loader) {
            if (!catalog) return;

            // Textures
            const texBatch = {};
            for (const [k, url] of Object.entries(catalog.textures ?? {})) {
                texBatch['tex_' + k] = url;
            }
            if (Object.keys(texBatch).length) await loader.load(Texture, texBatch);

            // Sprites (image + JSON)
            const sprImgBatch = {};
            const sprJsonBatch = {};
            for (const [k, entry] of Object.entries(catalog.sprites ?? {})) {
                sprImgBatch['spr_' + k]  = entry.image;
                sprJsonBatch['spr_' + k] = entry.data;
            }
            if (Object.keys(sprImgBatch).length) {
                await loader.load(Texture, sprImgBatch);
                await loader.load(Json, sprJsonBatch);
            }

            // Spritesheets (image + JSON)
            const sshImgBatch = {};
            const sshJsonBatch = {};
            for (const [k, entry] of Object.entries(catalog.spritesheets ?? {})) {
                sshImgBatch['ssh_' + k]  = entry.image;
                sshJsonBatch['ssh_' + k] = entry.data;
            }
            if (Object.keys(sshImgBatch).length) {
                await loader.load(Texture, sshImgBatch);
                await loader.load(Json, sshJsonBatch);
            }

            // SVG
            const svgBatch = {};
            for (const [k, url] of Object.entries(catalog.svg ?? {})) {
                svgBatch['svg_' + k] = url;
            }
            if (Object.keys(svgBatch).length) await loader.load(SvgAsset, svgBatch);

            // Input prompts (image + JSON)
            const inpImgBatch = {};
            const inpJsonBatch = {};
            for (const [k, entry] of Object.entries(catalog.inputPrompts ?? {})) {
                inpImgBatch['inp_' + k]  = entry.image;
                inpJsonBatch['inp_' + k] = entry.data;
            }
            if (Object.keys(inpImgBatch).length) {
                await loader.load(Texture, inpImgBatch);
                await loader.load(Json, inpJsonBatch);
            }

            // Audio (legacy)
            const audBatch = {};
            for (const [k, url] of Object.entries(catalog.audio ?? {})) {
                audBatch['aud_' + k] = url;
            }
            if (Object.keys(audBatch).length) await loader.load(Music, audBatch);

            // Sound
            const sndBatch = {};
            for (const [k, url] of Object.entries(catalog.sound ?? {})) {
                sndBatch['snd_' + k] = url;
            }
            if (Object.keys(sndBatch).length) await loader.load(Music, sndBatch);

            // Music
            const musBatch = {};
            for (const [k, url] of Object.entries(catalog.music ?? {})) {
                musBatch['mus_' + k] = url;
            }
            if (Object.keys(musBatch).length) await loader.load(Music, musBatch);

            // SoundSprites – load audio + JSON data
            const sdsBatch = {};
            const sdsJsonBatch = {};
            for (const [k, entry] of Object.entries(catalog.soundSprites ?? {})) {
                sdsBatch['sds_' + k]     = entry.audio;
                sdsJsonBatch['sds_' + k] = entry.data;
            }
            if (Object.keys(sdsBatch).length) {
                await loader.load(Music, sdsBatch);
                await loader.load(Json, sdsJsonBatch);
            }

            // Fonts
            for (const [k, url] of Object.entries(catalog.fonts ?? {})) {
                const family = 'assetbrowser_' + k;
                await loader.load(FontFace, { ['fnt_' + k]: url }, { family });
            }

            // Technical PNGs
            const techBatch = {};
            for (const [subcat, items] of Object.entries(catalog.technical ?? {})) {
                for (const [k, url] of Object.entries(items)) {
                    techBatch['tech_' + subcat + '_' + k] = url;
                }
            }
            if (Object.keys(techBatch).length) await loader.load(Texture, techBatch);

            // Backgrounds
            const bgBatch = {};
            for (const [k, url] of Object.entries(catalog.backgrounds ?? {})) {
                bgBatch['bg_' + k] = url;
            }
            if (Object.keys(bgBatch).length) await loader.load(Texture, bgBatch);

            // Cursors (SVG)
            const curBatch = {};
            for (const [k, url] of Object.entries(catalog.cursors ?? {})) {
                curBatch['cur_' + k] = url;
            }
            if (Object.keys(curBatch).length) await loader.load(SvgAsset, curBatch);

            // Tilesets (image only)
            const tlsBatch = {};
            for (const [k, entry] of Object.entries(catalog.tilesets ?? {})) {
                tlsBatch['tls_' + k] = entry.image;
            }
            if (Object.keys(tlsBatch).length) await loader.load(Texture, tlsBatch);

            // Vendor JSON
            const vndBatch = {};
            for (const [k, url] of Object.entries(catalog.vendor ?? {})) {
                vndBatch['vnd_' + k] = url;
            }
            if (Object.keys(vndBatch).length) await loader.load(Json, vndBatch);
        }

        // ── Init phase ─────────────────────────────────────────────────────
        init(loader) {
            if (!catalog) {
                this._txtNoAssets.setPosition(PREVIEW_X + 40, H / 2 - 30);
                return;
            }

            for (const [k] of Object.entries(catalog.textures ?? {})) {
                const s = new Sprite(loader.get(Texture, 'tex_' + k));
                s.setAnchor(0.5);
                this._texSprites.set(k, s);
            }

            for (const [k] of Object.entries(catalog.sprites ?? {})) {
                const tex  = loader.get(Texture, 'spr_' + k);
                const data = loader.get(Json, 'spr_' + k);
                const ss   = new Spritesheet(tex, data);
                this._sprSheets.set(k, ss);
                for (const s of ss.sprites.values()) s.setAnchor(0.5);
            }

            for (const [k] of Object.entries(catalog.spritesheets ?? {})) {
                const tex  = loader.get(Texture, 'ssh_' + k);
                const data = loader.get(Json, 'ssh_' + k);
                const ss   = new Spritesheet(tex, data);
                this._sshSheets.set(k, ss);
                for (const s of ss.sprites.values()) s.setAnchor(0.5);
            }

            for (const [k] of Object.entries(catalog.svg ?? {})) {
                const s = new Sprite(new Texture(loader.get(SvgAsset, 'svg_' + k)));
                s.setAnchor(0.5);
                this._svgSprites.set(k, s);
            }

            for (const [k] of Object.entries(catalog.inputPrompts ?? {})) {
                const tex  = loader.get(Texture, 'inp_' + k);
                const data = loader.get(Json, 'inp_' + k);
                const ss   = new Spritesheet(tex, data);
                this._inpSheets.set(k, ss);
                for (const s of ss.sprites.values()) s.setAnchor(0.5);
            }

            for (const [k] of Object.entries(catalog.audio ?? {})) {
                this._audioMusics.set(k, loader.get(Music, 'aud_' + k));
            }

            for (const [k] of Object.entries(catalog.sound ?? {})) {
                this._soundMusics.set(k, loader.get(Music, 'snd_' + k));
            }

            for (const [k] of Object.entries(catalog.music ?? {})) {
                this._musicMusics.set(k, loader.get(Music, 'mus_' + k));
            }

            for (const [k] of Object.entries(catalog.soundSprites ?? {})) {
                this._soundSpriteAudio.set(k, loader.get(Music, 'sds_' + k));
                this._soundSpriteData.set(k, loader.get(Json, 'sds_' + k));
            }

            for (const [k] of Object.entries(catalog.fonts ?? {})) {
                this._fontFamilies.set(k, 'assetbrowser_' + k);
            }

            for (const [subcat, items] of Object.entries(catalog.technical ?? {})) {
                for (const [k] of Object.entries(items)) {
                    const s = new Sprite(loader.get(Texture, 'tech_' + subcat + '_' + k));
                    s.setAnchor(0.5);
                    this._techSprites.set(subcat + '.' + k, s);
                }
            }

            for (const [k] of Object.entries(catalog.backgrounds ?? {})) {
                const s = new Sprite(loader.get(Texture, 'bg_' + k));
                s.setAnchor(0.5);
                this._bgSprites.set(k, s);
            }

            for (const [k] of Object.entries(catalog.cursors ?? {})) {
                const s = new Sprite(new Texture(loader.get(SvgAsset, 'cur_' + k)));
                s.setAnchor(0.5);
                this._cursorSprites.set(k, s);
            }

            for (const [k] of Object.entries(catalog.tilesets ?? {})) {
                const s = new Sprite(loader.get(Texture, 'tls_' + k));
                s.setAnchor(0.5);
                this._tilesetSprites.set(k, s);
            }

            for (const [k] of Object.entries(catalog.vendor ?? {})) {
                this._vendorData.set(k, loader.get(Json, 'vnd_' + k));
            }

            this.app.input.onPointerTap.add(p => this._onTap(p.x, p.y));
            this.app.input.onPointerMove.add(p => this._onMove(p.x, p.y));
            this.app.input.onMouseWheel.add(v => this._onWheel(v.y));

            this._selectFirstInCategory();
        }

        // ── Helpers ────────────────────────────────────────────────────────
        _techFlatKeys() {
            if (!catalog?.technical) return [];
            const out = [];
            for (const subcat of ['alpha', 'filtering', 'color']) {
                const items = catalog.technical[subcat];
                if (!items) continue;
                out.push(subcat);
                for (const k of Object.keys(items)) out.push(subcat + '.' + k);
            }
            return out;
        }

        _keys() {
            if (!catalog) return [];
            if (this._cat === 'technical') return this._techFlatKeys();
            const cat = CATEGORIES.find(c => c.id === this._cat);
            const obj = catalog[cat?.catKey];
            return obj ? Object.keys(obj) : [];
        }

        _assetPath() {
            if (!catalog || !this._key) return '';
            if (this._cat === 'technical') {
                if (!this._key.includes('.')) return '';
                const [subcat, itemKey] = this._key.split('.');
                return catalog.technical?.[subcat]?.[itemKey] ?? '';
            }
            const cat = CATEGORIES.find(c => c.id === this._cat);
            const v = catalog[cat?.catKey]?.[this._key];
            if (typeof v === 'string')              return v;
            if (v && typeof v.image === 'string')   return v.image;
            if (v && typeof v.audio === 'string')   return v.audio;
            return '';
        }

        _typeLabel() {
            const ext = this._assetPath().split('.').pop()?.toUpperCase() ?? '';
            return ext;
        }

        _selectFirstInCategory() {
            const keys = this._keys();
            this._key = this._cat === 'technical'
                ? (keys.find(k => k.includes('.')) ?? null)
                : (keys[0] ?? null);
            this._scrollOff = 0;
            this._resetPreviewState();
        }

        _resetPreviewState() {
            this._stopAllAudio();
            this._frameIdx = 0;
            this._frameTimer = 0;
            this._animPlaying = true;
        }

        _stopAllAudio() {
            for (const music of [
                ...this._audioMusics.values(),
                ...this._soundMusics.values(),
                ...this._musicMusics.values(),
                ...this._soundSpriteAudio.values(),
            ]) {
                if (music.playing) { music.pause(); music.setTime(0); }
            }
        }

        _currentPlayingMap() {
            if (this._cat === 'audio')        return this._audioMusics;
            if (this._cat === 'sound')        return this._soundMusics;
            if (this._cat === 'music')        return this._musicMusics;
            if (this._cat === 'soundSprites') return this._soundSpriteAudio;
            return null;
        }

        _toggleAudio() {
            if (!this._key) return;
            const map = this._currentPlayingMap();
            if (!map) return;
            const music = map.get(this._key);
            if (!music) return;
            if (music.playing) { music.pause(); } else { music.play(); }
        }

        _currentFrameKeys() {
            if (this._cat === 'sprites')      return [...(this._sprSheets.get(this._key)?.sprites.keys() ?? [])];
            if (this._cat === 'spritesheets') return [...(this._sshSheets.get(this._key)?.sprites.keys() ?? [])];
            if (this._cat === 'inputPrompts') return [...(this._inpSheets.get(this._key)?.sprites.keys() ?? [])];
            return [];
        }

        _maxScroll() {
            const visibleItems = Math.floor((H - LIST_Y) / ITEM_H);
            return Math.max(0, this._keys().length - visibleItems);
        }

        _isAudioLikeCategory() {
            return this._cat === 'audio' || this._cat === 'sound'
                || this._cat === 'music' || this._cat === 'soundSprites';
        }

        // ── Input handlers ─────────────────────────────────────────────────
        _onTap(x, y) {
            // Category buttons – row 1
            for (let i = 0; i < CATEGORIES_ROW1.length; i++) {
                const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
                if (x >= bx && x < bx + CAT_BTN_W && y >= CAT_BTN_Y1 && y < CAT_BTN_Y1 + CAT_BTN_H) {
                    if (this._cat !== CATEGORIES_ROW1[i].id) {
                        this._cat = CATEGORIES_ROW1[i].id;
                        this._selectFirstInCategory();
                    }
                    return;
                }
            }
            // Category buttons – row 2
            for (let i = 0; i < CATEGORIES_ROW2.length; i++) {
                const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
                if (x >= bx && x < bx + CAT_BTN_W && y >= CAT_BTN_Y2 && y < CAT_BTN_Y2 + CAT_BTN_H) {
                    if (this._cat !== CATEGORIES_ROW2[i].id) {
                        this._cat = CATEGORIES_ROW2[i].id;
                        this._selectFirstInCategory();
                    }
                    return;
                }
            }

            // BG toggle buttons
            for (let i = 0; i < BG_OPTIONS.length; i++) {
                const bx = BG_BTN_X0 + i * (BG_BTN_SIZE + 5);
                if (x >= bx && x < bx + BG_BTN_SIZE && y >= BG_BTN_Y && y < BG_BTN_Y + BG_BTN_SIZE) {
                    this._bgIdx = i;
                    return;
                }
            }

            // Sidebar item selection
            if (x >= 0 && x < SIDEBAR_W && y >= TOOLBAR_H) {
                const keys = this._keys();
                const idx = Math.floor((y - LIST_Y) / ITEM_H) + this._scrollOff;
                if (idx >= 0 && idx < keys.length) {
                    const newKey = keys[idx];
                    const isHeader = this._cat === 'technical' && !newKey.includes('.');
                    if (!isHeader && newKey !== this._key) {
                        this._key = newKey;
                        this._resetPreviewState();
                    }
                }
                return;
            }

            // Preview: copy key button
            if (this._key && x >= PREVIEW_X + PREVIEW_W - 84 && x < PREVIEW_X + PREVIEW_W - 10
                          && y >= PREVIEW_Y + 8           && y < PREVIEW_Y + 8 + 26) {
                const fullKey = `assets.${this._cat}.${this._key}`;
                navigator.clipboard?.writeText(fullKey).catch(() => {});
                return;
            }

            // Preview: audio-like play/pause
            if (this._isAudioLikeCategory() && this._key) {
                const bx = PREVIEW_X + (PREVIEW_W - 100) / 2;
                const by = PREVIEW_Y + PREVIEW_H / 2 - 30;
                if (x >= bx && x < bx + 100 && y >= by && y < by + 56) {
                    this._toggleAudio();
                    return;
                }
            }

            // Preview: animation play/pause
            if ((this._cat === 'sprites' || this._cat === 'spritesheets' || this._cat === 'inputPrompts') && this._key) {
                const bx = PREVIEW_X + 16;
                const by = H - 48;
                if (x >= bx && x < bx + 90 && y >= by && y < by + 30) {
                    this._animPlaying = !this._animPlaying;
                    return;
                }
            }
        }

        _onMove(x, y) {
            this._hoverIdx = null;
            if (x >= 0 && x < SIDEBAR_W && y >= TOOLBAR_H) {
                const keys = this._keys();
                const idx = Math.floor((y - LIST_Y) / ITEM_H) + this._scrollOff;
                if (idx >= 0 && idx < keys.length) {
                    const isHeader = this._cat === 'technical' && !keys[idx].includes('.');
                    if (!isHeader) this._hoverIdx = idx;
                }
            }
        }

        _onWheel(dy) {
            const maxScroll = this._maxScroll();
            const delta = dy > 0 ? 1 : -1;
            this._scrollOff = Math.max(0, Math.min(maxScroll, this._scrollOff + delta));
        }

        // ── Update ─────────────────────────────────────────────────────────
        update(delta) {
            if (!this._animPlaying) return;
            if (this._cat !== 'sprites' && this._cat !== 'spritesheets' && this._cat !== 'inputPrompts') return;
            const frames = this._currentFrameKeys();
            if (!frames.length) return;
            this._frameTimer += delta.seconds;
            if (this._frameTimer >= 0.07) {
                this._frameTimer = 0;
                this._frameIdx = (this._frameIdx + 1) % frames.length;
            }
        }

        // ── Draw ───────────────────────────────────────────────────────────
        draw(context) {
            context.backend.clear(C.bg);

            if (!catalog) {
                this._drawNoAssets(context);
                return;
            }

            this._drawPreviewBg(context);
            this._drawPreviewContent(context);
            this._drawSidebar(context);
            this._drawToolbar(context);
        }

        // ── Draw: no-assets ────────────────────────────────────────────────
        _drawNoAssets(context) {
            const g = this._gPreview;
            g.clear();
            g.fillColor = C.panel;
            g.drawRectangle(0, 0, W, H);
            context.render(g);
            context.render(this._txtNoAssets);
        }

        // ── Draw: toolbar ──────────────────────────────────────────────────
        _drawToolbar(context) {
            const g = this._gToolbar;
            g.clear();

            g.fillColor = C.toolbar;
            g.drawRectangle(0, 0, W, TOOLBAR_H);

            g.lineWidth = 1;
            g.lineColor = C.border;
            g.drawLine(0, TOOLBAR_H - 1, W, TOOLBAR_H - 1);
            g.drawLine(0, CAT_BTN_Y2 - 4, W, CAT_BTN_Y2 - 4);

            // Row 1 buttons
            for (let i = 0; i < CATEGORIES_ROW1.length; i++) {
                const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
                g.fillColor = this._cat === CATEGORIES_ROW1[i].id ? C.active : C.btnDark;
                g.lineWidth = 0;
                g.drawRectangle(bx, CAT_BTN_Y1, CAT_BTN_W, CAT_BTN_H);
            }

            // Row 2 buttons
            for (let i = 0; i < CATEGORIES_ROW2.length; i++) {
                const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
                g.fillColor = this._cat === CATEGORIES_ROW2[i].id ? C.active : C.btnDark;
                g.lineWidth = 0;
                g.drawRectangle(bx, CAT_BTN_Y2, CAT_BTN_W, CAT_BTN_H);
            }

            // BG toggle buttons (right side, row 1)
            for (let i = 0; i < BG_OPTIONS.length; i++) {
                const { r, g: gv, b } = BG_OPTIONS[i];
                const bx = BG_BTN_X0 + i * (BG_BTN_SIZE + 5);
                g.fillColor = new Color(r, gv, b);
                g.lineWidth = this._bgIdx === i ? 2 : 1;
                g.lineColor = this._bgIdx === i ? C.accent : C.border;
                g.drawRectangle(bx, BG_BTN_Y, BG_BTN_SIZE, BG_BTN_SIZE);
            }

            context.render(g);

            // Row 1 labels
            for (let i = 0; i < CATEGORIES_ROW1.length; i++) {
                const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
                const t = this._catBtnTexts[i];
                t.setPosition(bx + (CAT_BTN_W - 22) / 2, CAT_BTN_Y1 + 12);
                context.render(t);
            }

            // Row 2 labels
            for (let i = 0; i < CATEGORIES_ROW2.length; i++) {
                const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
                const t = this._catBtnTexts[CATEGORIES_ROW1.length + i];
                t.setPosition(bx + (CAT_BTN_W - 22) / 2, CAT_BTN_Y2 + 12);
                context.render(t);
            }

            // BG button labels
            for (let i = 0; i < BG_OPTIONS.length; i++) {
                const bx = BG_BTN_X0 + i * (BG_BTN_SIZE + 5);
                const t = this._bgBtnTexts[i];
                t.style.fillColor = i === 1 ? C.white : C.dim;
                t.setPosition(bx + 7, BG_BTN_Y + 7);
                context.render(t);
            }
        }

        // ── Draw: sidebar ──────────────────────────────────────────────────
        _drawSidebar(context) {
            const g = this._gSidebar;
            g.clear();

            g.fillColor = C.panel;
            g.drawRectangle(0, TOOLBAR_H, SIDEBAR_W, H - TOOLBAR_H);

            g.lineWidth = 1;
            g.lineColor = C.border;
            g.drawLine(SIDEBAR_W, TOOLBAR_H, SIDEBAR_W, H);

            const keys = this._keys();

            for (let i = 0; i < keys.length; i++) {
                const iy = LIST_Y + (i - this._scrollOff) * ITEM_H;
                if (iy + ITEM_H <= TOOLBAR_H || iy >= H) continue;
                const isHeader   = this._cat === 'technical' && !keys[i].includes('.');
                const isSelected = !isHeader && keys[i] === this._key;
                const isHover    = !isHeader && this._hoverIdx === i && !isSelected;
                if (isHeader) {
                    g.fillColor = C.infoBar;
                    g.lineWidth = 0;
                    g.drawRectangle(0, iy, SIDEBAR_W - 1, ITEM_H);
                } else if (isSelected) {
                    g.fillColor = C.active;
                    g.lineWidth = 0;
                    g.drawRectangle(0, iy, SIDEBAR_W - 1, ITEM_H);
                } else if (isHover) {
                    g.fillColor = C.hover;
                    g.lineWidth = 0;
                    g.drawRectangle(0, iy, SIDEBAR_W - 1, ITEM_H);
                }
            }

            context.render(g);

            for (let i = 0; i < keys.length && (i - this._scrollOff) < this._itemTexts.length; i++) {
                const iy = LIST_Y + (i - this._scrollOff) * ITEM_H;
                if (iy + ITEM_H <= TOOLBAR_H || iy >= H) continue;

                if (this._cat === 'technical' && !keys[i].includes('.')) {
                    const ht = this._techHeaderTexts.get(keys[i]);
                    if (ht) { ht.setPosition(10, iy + 12); context.render(ht); }
                    continue;
                }

                const t = this._itemTexts[i - this._scrollOff];
                if (!t) continue;
                t.text = this._cat === 'technical' ? (keys[i].split('.')[1] ?? keys[i]) : keys[i];
                t.style.fillColor = keys[i] === this._key ? C.white : C.dim;
                t.setPosition(this._cat === 'technical' ? 18 : 10, iy + 10);
                context.render(t);
            }

            if (keys.length === 0) {
                this._txtEmptyCat.setPosition(60, LIST_Y + 14);
                context.render(this._txtEmptyCat);
            }
        }

        // ── Draw: preview background ───────────────────────────────────────
        _drawPreviewBg(context) {
            const { r, g, b } = BG_OPTIONS[this._bgIdx];
            const bg = this._gPreview;
            bg.clear();
            bg.fillColor = new Color(r, g, b);
            bg.drawRectangle(PREVIEW_X, PREVIEW_Y, PREVIEW_W, PREVIEW_H);
            context.render(bg);
        }

        // ── Draw: preview content ──────────────────────────────────────────
        _drawPreviewContent(context) {
            if (!this._key) {
                this._txtNoSel.setPosition(PREVIEW_X + (PREVIEW_W / 2) - 130, H / 2 - 10);
                context.render(this._txtNoSel);
                this._drawInfoBar(context);
                return;
            }

            switch (this._cat) {
                case 'textures':     this._drawTexPreview(context);   break;
                case 'sprites':      this._drawSprPreview(context);   break;
                case 'spritesheets': this._drawSshPreview(context);   break;
                case 'svg':          this._drawSvgPreview(context);   break;
                case 'audio':        this._drawAudioPreview(context, this._audioMusics); break;
                case 'sound':        this._drawAudioPreview(context, this._soundMusics); break;
                case 'music':        this._drawAudioPreview(context, this._musicMusics); break;
                case 'soundSprites': this._drawSoundSpritePreview(context); break;
                case 'fonts':        this._drawFontPreview(context);  break;
                case 'video':        this._drawVideoPreview(context); break;
                case 'inputPrompts': this._drawInpPreview(context);   break;
                case 'technical':    this._drawTechPreview(context);  break;
                case 'backgrounds':  this._drawBgPreview(context);    break;
                case 'cursors':      this._drawCursorPreview(context); break;
                case 'tilesets':     this._drawTilesetPreview(context); break;
                case 'vendor':       this._drawVendorPreview(context); break;
            }

            this._drawInfoBar(context);
        }

        // ── Draw: info bar ─────────────────────────────────────────────────
        _drawInfoBar(context) {
            const g = this._gInfoBar;
            g.clear();
            g.fillColor = C.infoBar;
            g.drawRectangle(PREVIEW_X, PREVIEW_Y, PREVIEW_W, 44);
            g.lineWidth = 1;
            g.lineColor = C.border;
            g.drawLine(PREVIEW_X, PREVIEW_Y + 44, W, PREVIEW_Y + 44);
            context.render(g);

            if (!this._key) return;

            this._txtKey.text = `assets.${this._cat}.${this._key}`;
            this._txtKey.setPosition(PREVIEW_X + 10, PREVIEW_Y + 5);
            context.render(this._txtKey);

            this._txtPath.text = this._assetPath();
            this._txtPath.setPosition(PREVIEW_X + 10, PREVIEW_Y + 24);
            context.render(this._txtPath);

            const ext = this._typeLabel();
            if (ext) {
                this._txtType.text = ext;
                this._txtType.setPosition(PREVIEW_X + PREVIEW_W - 160, PREVIEW_Y + 15);
                context.render(this._txtType);
            }

            if (!this._copyBtnBg) this._copyBtnBg = new Graphics();
            const copyX = PREVIEW_X + PREVIEW_W - 84;
            const copyY = PREVIEW_Y + 9;
            this._copyBtnBg.clear();
            this._copyBtnBg.fillColor = C.btnDark;
            this._copyBtnBg.lineWidth = 1;
            this._copyBtnBg.lineColor = C.border;
            this._copyBtnBg.drawRectangle(copyX, copyY, 72, 26);
            context.render(this._copyBtnBg);
            this._txtCopy.setPosition(copyX + 10, copyY + 7);
            context.render(this._txtCopy);
        }

        // ── Draw helpers ───────────────────────────────────────────────────
        _previewCenter() {
            return {
                cx: PREVIEW_X + PREVIEW_W / 2,
                cy: PREVIEW_Y + 44 + (PREVIEW_H - 44) / 2,
                maxW: PREVIEW_W - 80,
                maxH: PREVIEW_H - 80,
            };
        }

        _fitSprite(sprite, maxW, maxH, cx, cy) {
            const tex = sprite.texture;
            if (!tex) return;
            const tw = tex.width  || 128;
            const th = tex.height || 128;
            const scale = Math.min(maxW / tw, maxH / th, 3);
            sprite.setScale(scale);
            sprite.setPosition(cx, cy);
        }

        // ── Draw: texture ──────────────────────────────────────────────────
        _drawTexPreview(context) {
            const sprite = this._texSprites.get(this._key);
            if (!sprite) return;
            const { cx, cy, maxW, maxH } = this._previewCenter();
            this._fitSprite(sprite, maxW, maxH, cx, cy);
            context.render(sprite);
        }

        // ── Draw: sprites (animated) ───────────────────────────────────────
        _drawSprPreview(context) {
            const ss = this._sprSheets.get(this._key);
            if (!ss) return;
            const frames = [...ss.sprites.keys()];
            if (!frames.length) return;
            const sprite = ss.getFrameSprite(frames[this._frameIdx % frames.length]);
            sprite.setAnchor(0.5);
            const { cx, cy, maxW, maxH } = this._previewCenter();
            this._fitSprite(sprite, maxW, maxH - 50, cx, cy);
            context.render(sprite);
            this._drawAnimControls(context, frames.length);
        }

        // ── Draw: spritesheets (animated) ──────────────────────────────────
        _drawSshPreview(context) {
            const ss = this._sshSheets.get(this._key);
            if (!ss) return;
            const frames = [...ss.sprites.keys()];
            if (!frames.length) return;
            const sprite = ss.getFrameSprite(frames[this._frameIdx % frames.length]);
            sprite.setAnchor(0.5);
            const { cx, cy, maxW, maxH } = this._previewCenter();
            this._fitSprite(sprite, maxW, maxH - 50, cx, cy);
            context.render(sprite);
            this._drawAnimControls(context, frames.length);
        }

        // ── Draw: input-prompt ─────────────────────────────────────────────
        _drawInpPreview(context) {
            const ss = this._inpSheets.get(this._key);
            if (ss) {
                const frames = [...ss.sprites.keys()];
                if (frames.length > 0) {
                    const sprite = ss.getFrameSprite(frames[this._frameIdx % frames.length]);
                    sprite.setAnchor(0.5);
                    const { cx, cy, maxW, maxH } = this._previewCenter();
                    this._fitSprite(sprite, maxW, maxH - 50, cx, cy);
                    context.render(sprite);
                    this._drawAnimControls(context, frames.length);
                    return;
                }
            }
        }

        // ── Draw: SVG ──────────────────────────────────────────────────────
        _drawSvgPreview(context) {
            const sprite = this._svgSprites.get(this._key);
            if (!sprite) return;
            const { cx, cy, maxW, maxH } = this._previewCenter();
            this._fitSprite(sprite, maxW, maxH, cx, cy);
            context.render(sprite);
        }

        // ── Draw: audio/sound/music ────────────────────────────────────────
        _drawAudioPreview(context, musicMap) {
            if (!this._audioG) this._audioG = new Graphics();
            const music = musicMap.get(this._key);
            const isPlaying = music ? music.playing : false;
            const g   = this._audioG;
            const { cx, cy } = this._previewCenter();
            const bx = cx - 50;
            const by = cy - 28;
            g.clear();
            g.fillColor = isPlaying ? C.btnGreen : C.btnDark;
            g.lineWidth = 1;
            g.lineColor = C.border;
            g.drawRectangle(bx, by, 100, 56);
            context.render(g);

            this._txtAudioIcon.text = isPlaying ? '⏸' : '▶';
            this._txtAudioIcon.setPosition(bx + (isPlaying ? 30 : 34), by + 10);
            context.render(this._txtAudioIcon);

            this._txtMeta.text = this._typeLabel();
            this._txtMeta.setPosition(cx - 15, by + 68);
            context.render(this._txtMeta);
        }

        // ── Draw: soundSprites ─────────────────────────────────────────────
        _drawSoundSpritePreview(context) {
            if (!this._audioG) this._audioG = new Graphics();
            const music   = this._soundSpriteAudio.get(this._key);
            const data    = this._soundSpriteData.get(this._key);
            const isPlaying = music ? music.playing : false;
            const sprites = data?.sprites ?? {};

            const g   = this._audioG;
            const { cx, cy } = this._previewCenter();
            const bx  = cx - 50;
            const by  = PREVIEW_Y + 56;

            g.clear();
            g.fillColor = isPlaying ? C.btnGreen : C.btnDark;
            g.lineWidth = 1;
            g.lineColor = C.border;
            g.drawRectangle(bx, by, 100, 44);
            context.render(g);

            this._txtAudioIcon.text = isPlaying ? '⏸' : '▶';
            this._txtAudioIcon.setPosition(bx + (isPlaying ? 30 : 34), by + 6);
            context.render(this._txtAudioIcon);

            // List sprites
            let y = by + 64;
            for (const [name, info] of Object.entries(sprites)) {
                this._txtMeta.text = `${name}  start:${info.start.toFixed(3)}s  dur:${info.duration.toFixed(3)}s`;
                this._txtMeta.setPosition(PREVIEW_X + 30, y);
                context.render(this._txtMeta);
                y += 20;
                if (y > H - 20) break;
            }
        }

        // ── Draw: font ─────────────────────────────────────────────────────
        _drawFontPreview(context) {
            const family = this._fontFamilies.get(this._key);
            if (!family) {
                this._txtMeta.text = `Font: ${this._key}\n${this._assetPath()}`;
                this._txtMeta.setPosition(PREVIEW_X + 40, PREVIEW_Y + 80);
                context.render(this._txtMeta);
                return;
            }
            let t = this._fontSampleTexts.get(this._key);
            if (!t) {
                t = new Text('AaBbCc 123 !?', { fontFamily: family, fontSize: 48, fillColor: C.white });
                this._fontSampleTexts.set(this._key, t);
            }
            t.style.fillColor = this._bgIdx === 0 ? C.black : C.white;
            t.setPosition(PREVIEW_X + 40, PREVIEW_Y + 120);
            context.render(t);

            let t2 = this._fontSampleTexts.get(this._key + '_sm');
            if (!t2) {
                t2 = new Text('The quick brown fox jumps over the lazy dog', { fontFamily: family, fontSize: 20, fillColor: C.dim });
                this._fontSampleTexts.set(this._key + '_sm', t2);
            }
            t2.style.fillColor = this._bgIdx === 0 ? C.dimDark : C.dim;
            t2.setPosition(PREVIEW_X + 40, PREVIEW_Y + 190);
            context.render(t2);
        }

        // ── Draw: video ────────────────────────────────────────────────────
        _drawVideoPreview(context) {
            this._txtMeta.text =
                `VIDEO\n\nKey: assets.video.${this._key}\nURL: ${this._assetPath()}\n\nOpen the URL in your browser to preview.`;
            this._txtMeta.setPosition(PREVIEW_X + 40, PREVIEW_Y + 80);
            context.render(this._txtMeta);
        }

        // ── Draw: technical ────────────────────────────────────────────────
        _drawTechPreview(context) {
            if (!this._key?.includes('.')) return;
            const sprite = this._techSprites.get(this._key);
            if (!sprite) return;
            const { cx, cy, maxW, maxH } = this._previewCenter();
            this._fitSprite(sprite, maxW, maxH - 28, cx, cy - 14);
            context.render(sprite);

            const subcat = this._key.split('.')[0];
            const purpose = TECH_PURPOSE[subcat] ?? '';
            if (purpose) {
                this._txtTechPurpose.text = purpose;
                this._txtTechPurpose.setPosition(PREVIEW_X + 16, PREVIEW_Y + PREVIEW_H - 22);
                context.render(this._txtTechPurpose);
            }
        }

        // ── Draw: backgrounds ──────────────────────────────────────────────
        _drawBgPreview(context) {
            const sprite = this._bgSprites.get(this._key);
            if (!sprite) return;
            const { cx, cy, maxW, maxH } = this._previewCenter();
            this._fitSprite(sprite, maxW, maxH, cx, cy);
            context.render(sprite);
        }

        // ── Draw: cursors ──────────────────────────────────────────────────
        _drawCursorPreview(context) {
            const sprite = this._cursorSprites.get(this._key);
            if (!sprite) return;
            const { cx, cy, maxW, maxH } = this._previewCenter();
            this._fitSprite(sprite, Math.min(maxW, 256), Math.min(maxH, 256), cx, cy);
            context.render(sprite);
        }

        // ── Draw: tilesets ─────────────────────────────────────────────────
        _drawTilesetPreview(context) {
            const sprite = this._tilesetSprites.get(this._key);
            if (!sprite) return;
            const entry = catalog?.tilesets?.[this._key];
            const { cx, cy, maxW, maxH } = this._previewCenter();
            this._fitSprite(sprite, maxW, maxH - 30, cx, cy - 15);
            context.render(sprite);

            if (entry?.tileWidth && entry?.tileHeight) {
                this._txtMeta.text = `tile: ${entry.tileWidth}×${entry.tileHeight}px`;
                this._txtMeta.setPosition(PREVIEW_X + 16, PREVIEW_Y + PREVIEW_H - 22);
                context.render(this._txtMeta);
            }
        }

        // ── Draw: vendor ───────────────────────────────────────────────────
        _drawVendorPreview(context) {
            const data = this._vendorData.get(this._key);
            if (!data) {
                this._txtMeta.text = `Loading: ${this._assetPath()}`;
                this._txtMeta.setPosition(PREVIEW_X + 30, PREVIEW_Y + 80);
                context.render(this._txtMeta);
                return;
            }
            const packs = data.packs ?? [];
            const lines = [
                `License: ${data.license ?? 'CC0'}`,
                `Packs: ${packs.length}`,
                '',
                ...packs.slice(0, 14).map(p => `  ${p.slug}  (${Object.values(p.fileCountByExtension ?? {}).reduce((a, b) => a + b, 0)} files)`),
            ];
            this._txtMeta.text = lines.join('\n');
            this._txtMeta.setPosition(PREVIEW_X + 30, PREVIEW_Y + 60);
            context.render(this._txtMeta);
        }

        // ── Draw: animation controls ───────────────────────────────────────
        _drawAnimControls(context, frameCount) {
            if (!this._animG) this._animG = new Graphics();
            const g  = this._animG;
            const bx = PREVIEW_X + 16;
            const by = H - 48;
            g.clear();
            g.fillColor = this._animPlaying ? C.active : C.btnDark;
            g.lineWidth = 1;
            g.lineColor = C.border;
            g.drawRectangle(bx, by, 88, 30);
            context.render(g);

            this._txtAnimPlay.text = this._animPlaying ? '⏸ PAUSE' : '▶ PLAY';
            this._txtAnimPlay.setPosition(bx + 14, by + 8);
            context.render(this._txtAnimPlay);

            this._txtAnimFrame.text = `${(this._frameIdx % frameCount) + 1} / ${frameCount}`;
            this._txtAnimFrame.setPosition(PREVIEW_X + 112, by + 10);
            context.render(this._txtAnimFrame);
        }
    })(),
);
