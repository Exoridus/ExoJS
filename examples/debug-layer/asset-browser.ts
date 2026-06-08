import {
    Application, Color, FontAsset, Graphics, Json, Music, Scene,
    Sprite, Spritesheet, SvgAsset, Text, Texture,
} from '@codexo/exojs';

// Dynamic category accessor: maps a category key to the correct sub-object
// in the hierarchical assets catalog. Technical assets live under
// assets.technical; everything else is under assets.demo.
function getCategoryData(catKey: string): Record<string, unknown> {
    if (catKey === 'technical') return assets.technical as unknown as Record<string, unknown>;
    return (assets.demo as unknown as Record<string, Record<string, unknown>>)[catKey] ?? {};
}

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

const CAT_BTN_W = 82;
const CAT_BTN_H = 38;
const CAT_BTN_Y1 = 6;
const CAT_BTN_Y2 = 58;
const CAT_BTN_X0 = 6;

const BG_BTN_SIZE = 26;
const BG_BTN_Y = 16;
const BG_BTN_X0 = W - 3 * (BG_BTN_SIZE + 5) - 6;

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

const TECH_PURPOSE: Record<string, string> = {
    alpha:     'alpha / premultiplied / halo checks',
    filtering: 'nearest / linear / sampler checks',
    color:     'ramp / gamma / color-shift checks',
};

const BG_OPTIONS = [
    { label: 'W', r: 255, g: 255, b: 255 },
    { label: 'G', r: 45,  g: 50,  b: 65  },
    { label: 'K', r: 0,   g: 0,   b: 0   },
];

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

const app = new Application({
    canvas: { width: W, height: H },
    clearColor: C.bg,
});

document.body.append(app.canvas);

class AssetBrowserScene extends Scene {
    cat = 'textures';
    key: string | null = null;
    bgIdx = 1;
    scrollOff = 0;
    hoverIdx: number | null = null;

    audioMusics    = new Map<string, Music>();
    soundMusics    = new Map<string, Music>();
    musicMusics    = new Map<string, Music>();
    soundSpriteAudio = new Map<string, Music>();

    frameIdx = 0;
    frameTimer = 0;
    animPlaying = true;

    texSprites     = new Map<string, Sprite>();
    sprSheets      = new Map<string, Spritesheet>();
    sshSheets      = new Map<string, Spritesheet>();
    svgSprites     = new Map<string, Sprite>();
    inpSheets      = new Map<string, Spritesheet>();
    fontFamilies   = new Map<string, string>();
    techSprites    = new Map<string, Sprite>();
    bgSprites      = new Map<string, Sprite>();
    cursorSprites  = new Map<string, Sprite>();
    tilesetSprites = new Map<string, Sprite>();
    soundSpriteData = new Map<string, any>();
    vendorData     = new Map<string, any>();

    animG: Graphics | null = null;
    audioG: Graphics | null = null;
    copyBtnBg: Graphics | null = null;
    fontSampleTexts = new Map<string, Text>();

    gToolbar  = new Graphics();
    gSidebar  = new Graphics();
    gPreview  = new Graphics();
    gInfoBar  = new Graphics();

    catBtnTexts  = CATEGORIES.map(() => new Text('', { fillColor: C.white, fontSize: 11, fontWeight: 'bold' }));
    bgBtnTexts = BG_OPTIONS.map(() => new Text('', { fillColor: C.dim, fontSize: 11, fontWeight: 'bold' }));

    txtKey   = new Text('', { fillColor: C.white,  fontSize: 12, fontWeight: 'bold' });
    txtPath  = new Text('', { fillColor: C.dim,    fontSize: 11 });
    txtType  = new Text('', { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' });
    txtCopy  = new Text('COPY KEY', { fillColor: C.white, fontSize: 10 });

    itemTexts = Array.from({ length: 22 }, () => new Text('', { fillColor: C.white, fontSize: 13 }));

    techHeaderTexts = new Map<string, Text>([
        ['alpha',     new Text('ALPHA',     { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' })],
        ['filtering', new Text('FILTERING', { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' })],
        ['color',     new Text('COLOR',     { fillColor: C.accent, fontSize: 10, fontWeight: 'bold' })],
    ]);

    txtTechPurpose = new Text('', { fillColor: C.dim, fontSize: 11 });

    txtNoAssets  = new Text(
        'globalThis.assets is not available.\nRun this example in the ExoJS playground.',
        { fillColor: C.dim, fontSize: 16 },
    );
    txtEmptyCat  = new Text('(empty)', { fillColor: C.dimDark, fontSize: 13 });
    txtNoSel     = new Text('Select an asset from the list.', { fillColor: C.dimDark, fontSize: 14 });
    txtMeta      = new Text('', { fillColor: C.white, fontSize: 13 }, { maxWidth: PREVIEW_W - 80 });
    txtAudioIcon = new Text('', { fillColor: C.white, fontSize: 28 });
    txtAnimPlay  = new Text('', { fillColor: C.white, fontSize: 12 });
    txtAnimFrame = new Text('', { fillColor: C.dim,   fontSize: 11 });

    override async load(loader): Promise<void> {


        const texBatch: Record<string, string> = {};
        for (const [k, url] of Object.entries(assets.demo.textures ?? {})) {
            texBatch[`tex_${k}`] = url as string;
        }
        if (Object.keys(texBatch).length) await loader.load(Texture, texBatch);

        const sprImgBatch: Record<string, string> = {};
        const sprJsonBatch: Record<string, string> = {};
        for (const [k, entry] of Object.entries(assets.demo.sprites ?? {})) {
            sprImgBatch[`spr_${k}`]  = (entry as any).image;
            sprJsonBatch[`spr_${k}`] = (entry as any).data;
        }
        if (Object.keys(sprImgBatch).length) {
            await loader.load(Texture, sprImgBatch);
            await loader.load(Json, sprJsonBatch);
        }

        const sshImgBatch: Record<string, string> = {};
        const sshJsonBatch: Record<string, string> = {};
        for (const [k, entry] of Object.entries(assets.demo.spritesheets ?? {})) {
            sshImgBatch[`ssh_${k}`]  = (entry as any).image;
            sshJsonBatch[`ssh_${k}`] = (entry as any).data;
        }
        if (Object.keys(sshImgBatch).length) {
            await loader.load(Texture, sshImgBatch);
            await loader.load(Json, sshJsonBatch);
        }

        const svgBatch: Record<string, string> = {};
        for (const [k, url] of Object.entries(assets.demo.svg ?? {})) {
            svgBatch[`svg_${k}`] = url as string;
        }
        if (Object.keys(svgBatch).length) await loader.load(SvgAsset, svgBatch);

        const inpImgBatch: Record<string, string> = {};
        const inpJsonBatch: Record<string, string> = {};
        for (const [k, entry] of Object.entries(assets.demo.inputPrompts ?? {})) {
            inpImgBatch[`inp_${k}`]  = (entry as any).image;
            inpJsonBatch[`inp_${k}`] = (entry as any).data;
        }
        if (Object.keys(inpImgBatch).length) {
            await loader.load(Texture, inpImgBatch);
            await loader.load(Json, inpJsonBatch);
        }

        const audBatch: Record<string, string> = {};
        for (const [k, url] of Object.entries(assets.demo.audio ?? {})) {
            audBatch[`aud_${k}`] = url as string;
        }
        if (Object.keys(audBatch).length) await loader.load(Music, audBatch);

        const sndBatch: Record<string, string> = {};
        for (const [k, url] of Object.entries(assets.demo.sound ?? {})) {
            sndBatch[`snd_${k}`] = url as string;
        }
        if (Object.keys(sndBatch).length) await loader.load(Music, sndBatch);

        const musBatch: Record<string, string> = {};
        for (const [k, url] of Object.entries(assets.demo.music ?? {})) {
            musBatch[`mus_${k}`] = url as string;
        }
        if (Object.keys(musBatch).length) await loader.load(Music, musBatch);

        const sdsBatch: Record<string, string> = {};
        const sdsJsonBatch: Record<string, string> = {};
        for (const [k, entry] of Object.entries(assets.demo.soundSprites ?? {})) {
            sdsBatch[`sds_${k}`]     = (entry as any).audio;
            sdsJsonBatch[`sds_${k}`] = (entry as any).data;
        }
        if (Object.keys(sdsBatch).length) {
            await loader.load(Music, sdsBatch);
            await loader.load(Json, sdsJsonBatch);
        }

        for (const [k, url] of Object.entries(assets.demo.fonts ?? {})) {
            // The fonts category mixes vector fonts (.ttf/.otf) with bitmap-font
            // sidecars (.fnt/.png) that FontFace cannot parse. Load only the
            // vector entries — the bitmap ones fall back to a path readout.
            if (!/\.(ttf|otf|woff2?)$/i.test(url as string)) continue;
            const family = `assetbrowser_${k}`;
            await loader.load(FontAsset, { [`fnt_${k}`]: url }, { family });
        }

        const techBatch: Record<string, string> = {};
        for (const [subcat, items] of Object.entries(assets.technical ?? {})) {
            for (const [k, u] of Object.entries(items as Record<string, string>)) {
                techBatch[`tech_${subcat}_${k}`] = u;
            }
        }
        if (Object.keys(techBatch).length) await loader.load(Texture, techBatch);

        const bgBatch: Record<string, string> = {};
        for (const [k, url] of Object.entries(assets.demo.backgrounds ?? {})) {
            bgBatch[`bg_${k}`] = url as string;
        }
        if (Object.keys(bgBatch).length) await loader.load(Texture, bgBatch);

        const curBatch: Record<string, string> = {};
        for (const [k, url] of Object.entries(assets.demo.cursors ?? {})) {
            curBatch[`cur_${k}`] = url as string;
        }
        if (Object.keys(curBatch).length) await loader.load(SvgAsset, curBatch);

        const tlsBatch: Record<string, string> = {};
        for (const [k, entry] of Object.entries(assets.demo.tilesets ?? {})) {
            tlsBatch[`tls_${k}`] = (entry as any).image;
        }
        if (Object.keys(tlsBatch).length) await loader.load(Texture, tlsBatch);

        const vndBatch: Record<string, string> = {};
        for (const [k, url] of Object.entries(assets.demo.vendor ?? {})) {
            vndBatch[`vnd_${k}`] = url as string;
        }
        if (Object.keys(vndBatch).length) await loader.load(Json, vndBatch);
    }

    override init(loader): void {
        for (const [k] of Object.entries(assets.demo.textures ?? {})) {
            const s = new Sprite(loader.get(Texture, `tex_${k}`));
            s.setAnchor(0.5);
            this.texSprites.set(k, s);
        }

        for (const [k] of Object.entries(assets.demo.sprites ?? {})) {
            const tex  = loader.get(Texture, `spr_${k}`);
            const data = loader.get(Json, `spr_${k}`);
            const ss   = new Spritesheet(tex, data);
            this.sprSheets.set(k, ss);
            for (const s of ss.sprites.values()) s.setAnchor(0.5);
        }

        for (const [k] of Object.entries(assets.demo.spritesheets ?? {})) {
            const tex  = loader.get(Texture, `ssh_${k}`);
            const data = loader.get(Json, `ssh_${k}`);
            const ss   = new Spritesheet(tex, data);
            this.sshSheets.set(k, ss);
            for (const s of ss.sprites.values()) s.setAnchor(0.5);
        }

        for (const [k] of Object.entries(assets.demo.svg ?? {})) {
            const s = new Sprite(new Texture(loader.get(SvgAsset, `svg_${k}`)));
            s.setAnchor(0.5);
            this.svgSprites.set(k, s);
        }

        for (const [k] of Object.entries(assets.demo.inputPrompts ?? {})) {
            const tex  = loader.get(Texture, `inp_${k}`);
            const data = loader.get(Json, `inp_${k}`);
            const ss   = new Spritesheet(tex, data);
            this.inpSheets.set(k, ss);
            for (const s of ss.sprites.values()) s.setAnchor(0.5);
        }

        for (const [k] of Object.entries(assets.demo.audio ?? {})) {
            this.audioMusics.set(k, loader.get(Music, `aud_${k}`));
        }

        for (const [k] of Object.entries(assets.demo.sound ?? {})) {
            this.soundMusics.set(k, loader.get(Music, `snd_${k}`));
        }

        for (const [k] of Object.entries(assets.demo.music ?? {})) {
            this.musicMusics.set(k, loader.get(Music, `mus_${k}`));
        }

        for (const [k] of Object.entries(assets.demo.soundSprites ?? {})) {
            this.soundSpriteAudio.set(k, loader.get(Music, `sds_${k}`));
            this.soundSpriteData.set(k, loader.get(Json, `sds_${k}`));
        }

        for (const [k, url] of Object.entries(assets.demo.fonts ?? {})) {
            // Match the load() filter: only vector fonts get a registered family;
            // bitmap-font entries render via the path-readout fallback.
            if (!/\.(ttf|otf|woff2?)$/i.test(url as string)) continue;
            this.fontFamilies.set(k, `assetbrowser_${k}`);
        }

        for (const [subcat, items] of Object.entries(assets.technical ?? {})) {
            for (const [k] of Object.entries(items as Record<string, string>)) {
                const s = new Sprite(loader.get(Texture, `tech_${subcat}_${k}`));
                s.setAnchor(0.5);
                this.techSprites.set(`${subcat}.${k}`, s);
            }
        }

        for (const [k] of Object.entries(assets.demo.backgrounds ?? {})) {
            const s = new Sprite(loader.get(Texture, `bg_${k}`));
            s.setAnchor(0.5);
            this.bgSprites.set(k, s);
        }

        for (const [k] of Object.entries(assets.demo.cursors ?? {})) {
            const s = new Sprite(new Texture(loader.get(SvgAsset, `cur_${k}`)));
            s.setAnchor(0.5);
            this.cursorSprites.set(k, s);
        }

        for (const [k] of Object.entries(assets.demo.tilesets ?? {})) {
            const s = new Sprite(loader.get(Texture, `tls_${k}`));
            s.setAnchor(0.5);
            this.tilesetSprites.set(k, s);
        }

        for (const [k] of Object.entries(assets.demo.vendor ?? {})) {
            this.vendorData.set(k, loader.get(Json, `vnd_${k}`));
        }

        this.app.input.onPointerTap.add(p => this.onTap(p.x, p.y));
        this.app.input.onPointerMove.add(p => this.onMove(p.x, p.y));
        this.app.input.onMouseWheel.add(v => this.onWheel(v.y));

        this.selectFirstInCategory();
    }

    private techFlatKeys(): string[] {

        const out: string[] = [];
        for (const subcat of ['alpha', 'filtering', 'color']) {
            const items = assets.technical[subcat];
            if (!items) continue;
            out.push(subcat);
            for (const k of Object.keys(items)) out.push(`${subcat}.${k}`);
        }
        return out;
    }

    private keys(): string[] {
        if (this.cat === 'technical') return this.techFlatKeys();
        const cat = CATEGORIES.find(c => c.id === this.cat);
        const obj = getCategoryData(cat?.catKey ?? '');
        return obj ? Object.keys(obj) : [];
    }

    private assetPath(): string {
        if (!this.key) return '';
        if (this.cat === 'technical') {
            if (!this.key.includes('.')) return '';
            const [subcat, itemKey] = this.key.split('.');
            return (assets.technical as unknown as Record<string, Record<string, string>>)[subcat]?.[itemKey] ?? '';
        }
        const cat = CATEGORIES.find(c => c.id === this.cat);
        const v = getCategoryData(cat?.catKey ?? '')[this.key] as any;
        if (typeof v === 'string')              return v;
        if (v && typeof v.image === 'string')   return v.image;
        if (v && typeof v.audio === 'string')   return v.audio;
        return '';
    }

    private typeLabel(): string {
        return this.assetPath().split('.').pop()?.toUpperCase() ?? '';
    }

    private selectFirstInCategory(): void {
        const keys = this.keys();
        this.key = this.cat === 'technical'
            ? (keys.find(k => k.includes('.')) ?? null)
            : (keys[0] ?? null);
        this.scrollOff = 0;
        this.resetPreviewState();
    }

    private resetPreviewState(): void {
        this.stopAllAudio();
        this.frameIdx = 0;
        this.frameTimer = 0;
        this.animPlaying = true;
    }

    private stopAllAudio(): void {
        for (const music of [
            ...this.audioMusics.values(),
            ...this.soundMusics.values(),
            ...this.musicMusics.values(),
            ...this.soundSpriteAudio.values(),
        ]) {
            if (music.playing) { music.pause(); music.setTime(0); }
        }
    }

    private currentPlayingMap(): Map<string, Music> | null {
        if (this.cat === 'audio')        return this.audioMusics;
        if (this.cat === 'sound')        return this.soundMusics;
        if (this.cat === 'music')        return this.musicMusics;
        if (this.cat === 'soundSprites') return this.soundSpriteAudio;
        return null;
    }

    private toggleAudio(): void {
        if (!this.key) return;
        const map = this.currentPlayingMap();
        if (!map) return;
        const music = map.get(this.key);
        if (!music) return;
        if (music.playing) { music.pause(); } else { music.play(); }
    }

    private currentFrameKeys(): string[] {
        if (this.cat === 'sprites')      return [...(this.sprSheets.get(this.key ?? '')?.sprites.keys() ?? [])];
        if (this.cat === 'spritesheets') return [...(this.sshSheets.get(this.key ?? '')?.sprites.keys() ?? [])];
        if (this.cat === 'inputPrompts') return [...(this.inpSheets.get(this.key ?? '')?.sprites.keys() ?? [])];
        return [];
    }

    private maxScroll(): number {
        const visibleItems = Math.floor((H - LIST_Y) / ITEM_H);
        return Math.max(0, this.keys().length - visibleItems);
    }

    private isAudioLikeCategory(): boolean {
        return this.cat === 'audio' || this.cat === 'sound'
            || this.cat === 'music' || this.cat === 'soundSprites';
    }

    private onTap(x: number, y: number): void {
        for (let i = 0; i < CATEGORIES_ROW1.length; i++) {
            const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
            if (x >= bx && x < bx + CAT_BTN_W && y >= CAT_BTN_Y1 && y < CAT_BTN_Y1 + CAT_BTN_H) {
                if (this.cat !== CATEGORIES_ROW1[i].id) {
                    this.cat = CATEGORIES_ROW1[i].id;
                    this.selectFirstInCategory();
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
                      && y >= PREVIEW_Y + 8           && y < PREVIEW_Y + 8 + 26) {
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

    private onMove(x: number, y: number): void {
        this.hoverIdx = null;
        if (x >= 0 && x < SIDEBAR_W && y >= TOOLBAR_H) {
            const keys = this.keys();
            const idx = Math.floor((y - LIST_Y) / ITEM_H) + this.scrollOff;
            if (idx >= 0 && idx < keys.length) {
                const isHeader = this.cat === 'technical' && !keys[idx].includes('.');
                if (!isHeader) this.hoverIdx = idx;
            }
        }
    }

    private onWheel(dy: number): void {
        const maxScroll = this.maxScroll();
        const delta = dy > 0 ? 1 : -1;
        this.scrollOff = Math.max(0, Math.min(maxScroll, this.scrollOff + delta));
    }

    override update(delta): void {
        if (!this.animPlaying) return;
        if (this.cat !== 'sprites' && this.cat !== 'spritesheets' && this.cat !== 'inputPrompts') return;
        const frames = this.currentFrameKeys();
        if (!frames.length) return;
        this.frameTimer += delta.seconds;
        if (this.frameTimer >= 0.07) {
            this.frameTimer = 0;
            this.frameIdx = (this.frameIdx + 1) % frames.length;
        }
    }

    override draw(context): void {
        context.backend.clear(C.bg);
        this.drawPreviewBg(context);
        this.drawPreviewContent(context);
        this.drawSidebar(context);
        this.drawToolbar(context);
    }

    private drawNoAssets(context): void {
        const g = this.gPreview;
        g.clear();
        g.fillColor = C.panel;
        g.drawRectangle(0, 0, W, H);
        context.render(g);
        context.render(this.txtNoAssets);
    }

    private drawToolbar(context): void {
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
            t.setPosition(bx + (CAT_BTN_W - 22) / 2, CAT_BTN_Y1 + 12);
            context.render(t);
        }

        for (let i = 0; i < CATEGORIES_ROW2.length; i++) {
            const bx = CAT_BTN_X0 + i * (CAT_BTN_W + 4);
            const t = this.catBtnTexts[CATEGORIES_ROW1.length + i];
            t.setPosition(bx + (CAT_BTN_W - 22) / 2, CAT_BTN_Y2 + 12);
            context.render(t);
        }

        for (let i = 0; i < BG_OPTIONS.length; i++) {
            const bx = BG_BTN_X0 + i * (BG_BTN_SIZE + 5);
            const t = this.bgBtnTexts[i];
            t.style.fillColor = i === 1 ? C.white : C.dim;
            t.setPosition(bx + 7, BG_BTN_Y + 7);
            context.render(t);
        }
    }

    private drawSidebar(context): void {
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
            if (iy + ITEM_H <= TOOLBAR_H || iy >= H) continue;
            const isHeader   = this.cat === 'technical' && !keys[i].includes('.');
            const isSelected = !isHeader && keys[i] === this.key;
            const isHover    = !isHeader && this.hoverIdx === i && !isSelected;
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

        for (let i = 0; i < keys.length && (i - this.scrollOff) < this.itemTexts.length; i++) {
            const iy = LIST_Y + (i - this.scrollOff) * ITEM_H;
            if (iy + ITEM_H <= TOOLBAR_H || iy >= H) continue;

            if (this.cat === 'technical' && !keys[i].includes('.')) {
                const ht = this.techHeaderTexts.get(keys[i]);
                if (ht) { ht.setPosition(10, iy + 12); context.render(ht); }
                continue;
            }

            const t = this.itemTexts[i - this.scrollOff];
            if (!t) continue;
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

    private drawPreviewBg(context): void {
        const { r, g, b } = BG_OPTIONS[this.bgIdx];
        const bg = this.gPreview;
        bg.clear();
        bg.fillColor = new Color(r, g, b);
        bg.drawRectangle(PREVIEW_X, PREVIEW_Y, PREVIEW_W, PREVIEW_H);
        context.render(bg);
    }

    private drawPreviewContent(context): void {
        if (!this.key) {
            this.txtNoSel.setPosition(PREVIEW_X + (PREVIEW_W / 2) - 130, H / 2 - 10);
            context.render(this.txtNoSel);
            this.drawInfoBar(context);
            return;
        }

        switch (this.cat) {
            case 'textures':     this.drawTexPreview(context);   break;
            case 'sprites':      this.drawSprPreview(context);   break;
            case 'spritesheets': this.drawSshPreview(context);   break;
            case 'svg':          this.drawSvgPreview(context);   break;
            case 'audio':        this.drawAudioPreview(context, this.audioMusics); break;
            case 'sound':        this.drawAudioPreview(context, this.soundMusics); break;
            case 'music':        this.drawAudioPreview(context, this.musicMusics); break;
            case 'soundSprites': this.drawSoundSpritePreview(context); break;
            case 'fonts':        this.drawFontPreview(context);  break;
            case 'video':        this.drawVideoPreview(context); break;
            case 'inputPrompts': this.drawInpPreview(context);   break;
            case 'technical':    this.drawTechPreview(context);  break;
            case 'backgrounds':  this.drawBgPreview(context);    break;
            case 'cursors':      this.drawCursorPreview(context); break;
            case 'tilesets':     this.drawTilesetPreview(context); break;
            case 'vendor':       this.drawVendorPreview(context); break;
        }

        this.drawInfoBar(context);
    }

    private drawInfoBar(context): void {
        const g = this.gInfoBar;
        g.clear();
        g.fillColor = C.infoBar;
        g.drawRectangle(PREVIEW_X, PREVIEW_Y, PREVIEW_W, 44);
        g.lineWidth = 1;
        g.lineColor = C.border;
        g.drawLine(PREVIEW_X, PREVIEW_Y + 44, W, PREVIEW_Y + 44);
        context.render(g);

        if (!this.key) return;

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

        if (!this.copyBtnBg) this.copyBtnBg = new Graphics();
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

    private previewCenter(): { cx: number; cy: number; maxW: number; maxH: number } {
        return {
            cx: PREVIEW_X + PREVIEW_W / 2,
            cy: PREVIEW_Y + 44 + (PREVIEW_H - 44) / 2,
            maxW: PREVIEW_W - 80,
            maxH: PREVIEW_H - 80,
        };
    }

    private fitSprite(sprite: Sprite, maxW: number, maxH: number, cx: number, cy: number): void {
        const tex = sprite.texture;
        if (!tex) return;
        const tw = tex.width  || 128;
        const th = tex.height || 128;
        const scale = Math.min(maxW / tw, maxH / th, 3);
        sprite.setScale(scale);
        sprite.setPosition(cx, cy);
    }

    private drawTexPreview(context): void {
        const sprite = this.texSprites.get(this.key ?? '');
        if (!sprite) return;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH, cx, cy);
        context.render(sprite);
    }

    private drawSprPreview(context): void {
        const ss = this.sprSheets.get(this.key ?? '');
        if (!ss) return;
        const frames = [...ss.sprites.keys()];
        if (!frames.length) return;
        const sprite = ss.getFrameSprite(frames[this.frameIdx % frames.length]);
        sprite.setAnchor(0.5);
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH - 50, cx, cy);
        context.render(sprite);
        this.drawAnimControls(context, frames.length);
    }

    private drawSshPreview(context): void {
        const ss = this.sshSheets.get(this.key ?? '');
        if (!ss) return;
        const frames = [...ss.sprites.keys()];
        if (!frames.length) return;
        const sprite = ss.getFrameSprite(frames[this.frameIdx % frames.length]);
        sprite.setAnchor(0.5);
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH - 50, cx, cy);
        context.render(sprite);
        this.drawAnimControls(context, frames.length);
    }

    private drawInpPreview(context): void {
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

    private drawSvgPreview(context): void {
        const sprite = this.svgSprites.get(this.key ?? '');
        if (!sprite) return;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH, cx, cy);
        context.render(sprite);
    }

    private drawAudioPreview(context, musicMap: Map<string, Music>): void {
        if (!this.audioG) this.audioG = new Graphics();
        const music = musicMap.get(this.key ?? '');
        const isPlaying = music ? music.playing : false;
        const g   = this.audioG;
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

    private drawSoundSpritePreview(context): void {
        if (!this.audioG) this.audioG = new Graphics();
        const music   = this.soundSpriteAudio.get(this.key ?? '');
        const data    = this.soundSpriteData.get(this.key ?? '');
        const isPlaying = music ? music.playing : false;
        const sprites = data?.sprites ?? {};

        const g   = this.audioG;
        const { cx } = this.previewCenter();
        const bx  = cx - 50;
        const by  = PREVIEW_Y + 56;

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
            this.txtMeta.text = `${name}  start:${(info as any).start.toFixed(3)}s  dur:${(info as any).duration.toFixed(3)}s`;
            this.txtMeta.setPosition(PREVIEW_X + 30, y);
            context.render(this.txtMeta);
            y += 20;
            if (y > H - 20) break;
        }
    }

    private drawFontPreview(context): void {
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

    private drawVideoPreview(context): void {
        this.txtMeta.text =
            `VIDEO\n\nKey: assets.video.${this.key}\nURL: ${this.assetPath()}\n\nOpen the URL in your browser to preview.`;
        this.txtMeta.setPosition(PREVIEW_X + 40, PREVIEW_Y + 80);
        context.render(this.txtMeta);
    }

    private drawTechPreview(context): void {
        if (!this.key?.includes('.')) return;
        const sprite = this.techSprites.get(this.key);
        if (!sprite) return;
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

    private drawBgPreview(context): void {
        const sprite = this.bgSprites.get(this.key ?? '');
        if (!sprite) return;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH, cx, cy);
        context.render(sprite);
    }

    private drawCursorPreview(context): void {
        const sprite = this.cursorSprites.get(this.key ?? '');
        if (!sprite) return;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, Math.min(maxW, 256), Math.min(maxH, 256), cx, cy);
        context.render(sprite);
    }

    private drawTilesetPreview(context): void {
        const sprite = this.tilesetSprites.get(this.key ?? '');
        if (!sprite) return;
        const entry: any = assets.demo.tilesets[this.key ?? '' as keyof typeof assets.demo.tilesets] as any;
        const { cx, cy, maxW, maxH } = this.previewCenter();
        this.fitSprite(sprite, maxW, maxH - 30, cx, cy - 15);
        context.render(sprite);

        if (entry?.tileWidth && entry?.tileHeight) {
            this.txtMeta.text = `tile: ${entry.tileWidth}×${entry.tileHeight}px`;
            this.txtMeta.setPosition(PREVIEW_X + 16, PREVIEW_Y + PREVIEW_H - 22);
            context.render(this.txtMeta);
        }
    }

    private drawVendorPreview(context): void {
        const data = this.vendorData.get(this.key ?? '');
        if (!data) {
            this.txtMeta.text = `Loading: ${this.assetPath()}`;
            this.txtMeta.setPosition(PREVIEW_X + 30, PREVIEW_Y + 80);
            context.render(this.txtMeta);
            return;
        }
        const packs: any[] = data.packs ?? [];
        const lines = [
            `License: ${data.license ?? 'CC0'}`,
            `Packs: ${packs.length}`,
            '',
            ...packs.slice(0, 14).map((p: any) => `  ${p.slug}  (${Object.values(p.fileCountByExtension ?? {}).reduce((a: number, b: number) => a + b, 0)} files)`),
        ];
        this.txtMeta.text = lines.join('\n');
        this.txtMeta.setPosition(PREVIEW_X + 30, PREVIEW_Y + 60);
        context.render(this.txtMeta);
    }

    private drawAnimControls(context, frameCount: number): void {
        if (!this.animG) this.animG = new Graphics();
        const g  = this.animG;
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
