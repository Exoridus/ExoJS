import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

type PngData = { data: Buffer; width: number; height: number };
type PngCtor = {
    new (opts: Record<string, unknown>): PngData;
    sync: { write(png: PngData): Buffer };
};
const { PNG } = _require('pngjs') as { PNG: PngCtor };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

function makePng(width: number, height: number): PngData {
    const png = new PNG({ width, height, filterType: -1 });
    png.data = Buffer.alloc(width * height * 4, 0);
    return png;
}

function px(png: PngData, x: number, y: number, r: number, g: number, b: number, a: number): void {
    const i = (y * png.width + x) * 4;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
}

function save(png: PngData, relPath: string): void {
    const absPath = path.join(packageRoot, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, PNG.sync.write(png));
    console.log(`  written: ${relPath}`);
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) {         g = c; b = x; }
    else if (h < 240) {         g = x; b = c; }
    else if (h < 300) { r = x;         b = c; }
    else              { r = c;         b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// ── Alpha ─────────────────────────────────────────────────────────────────────

function genAlphaEdgeStraight(): void {
    const W = 256, H = 256;
    const png = makePng(W, H);

    // Opaque red rectangle
    for (let y = 32; y < 96; y++) for (let x = 16; x < 96; x++) {
        px(png, x, y, 220, 40, 40, 255);
    }
    // Semi-transparent green rectangle (alpha=128) — overlaps red
    for (let y = 64; y < 144; y++) for (let x = 80; x < 176; x++) {
        px(png, x, y, 40, 200, 40, 128);
    }
    // Opaque blue rectangle — overlaps green
    for (let y = 80; y < 176; y++) for (let x = 160; x < 240; x++) {
        px(png, x, y, 40, 40, 220, 255);
    }
    // Very transparent white overlay across center (alpha=64)
    for (let y = 100; y < 156; y++) for (let x = 100; x < 156; x++) {
        px(png, x, y, 255, 255, 255, 64);
    }
    // Opaque yellow diamond at bottom — hard diagonal edges
    const cx = 128, cy = 208, radius = 32;
    for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
            if (Math.abs(x - cx) + Math.abs(y - cy) <= radius) {
                px(png, x, y, 240, 200, 0, 255);
            }
        }
    }

    save(png, 'technical/alpha/alpha-edge-straight.png');
}

function genAlphaGradientRings(): void {
    const W = 256, H = 256;
    const png = makePng(W, H);

    const cx = 128, cy = 128;
    const rings: Array<{ ri: number; ro: number; r: number; g: number; b: number }> = [
        { ri: 10,  ro: 26,  r: 220, g: 40,  b: 40  },
        { ri: 35,  ro: 56,  r: 40,  g: 200, b: 40  },
        { ri: 65,  ro: 91,  r: 40,  g: 40,  b: 220 },
        { ri: 100, ro: 131, r: 240, g: 200, b: 0   },
        { ri: 140, ro: 176, r: 0,   g: 220, b: 200 },
    ];

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            for (const ring of rings) {
                if (dist >= ring.ri && dist <= ring.ro) {
                    const t = (dist - ring.ri) / (ring.ro - ring.ri);
                    const alpha = Math.round(255 * Math.sin(Math.PI * t));
                    px(png, x, y, ring.r, ring.g, ring.b, alpha);
                    break;
                }
            }
        }
    }

    save(png, 'technical/alpha/alpha-gradient-rings.png');
}

// ── Filtering ─────────────────────────────────────────────────────────────────

function genChecker256(): void {
    const W = 256, H = 256;
    const png = makePng(W, H);

    // Quadrant checker sizes: TL=1px, TR=2px, BL=4px, BR=8px
    const sizes = [[1, 2], [4, 8]] as const;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const col = x >= 128 ? 1 : 0;
            const row = y >= 128 ? 1 : 0;
            const size = sizes[row][col];
            const lx = x % 128, ly = y % 128;
            const isBlack = (Math.floor(lx / size) + Math.floor(ly / size)) % 2 === 0;
            const v = isBlack ? 0 : 255;
            px(png, x, y, v, v, v, 255);
        }
    }

    save(png, 'technical/filtering/checker-256.png');
}

function genPixelGrid128(): void {
    const W = 128, H = 128;
    const png = makePng(W, H);

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const isLine = x % 8 === 0 || y % 8 === 0;
            const v = isLine ? 0 : 255;
            px(png, x, y, v, v, v, 255);
        }
    }

    save(png, 'technical/filtering/pixel-grid-128.png');
}

function genUvGrid256(): void {
    const W = 256, H = 256;
    const png = makePng(W, H);

    // UV-gradient base: R=u, G=v, B=complementary tint
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const u = x / (W - 1);
            const v = y / (H - 1);
            px(png, x, y,
                Math.round(u * 255),
                Math.round(v * 255),
                Math.round((1 - u * 0.5 - v * 0.5) * 255),
                255);
        }
    }

    // White grid lines every 32 px
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (x % 32 === 0 || y % 32 === 0) {
                px(png, x, y, 255, 255, 255, 255);
            }
        }
    }

    // 4×4 corner markers
    for (const [mx, my] of [[0, 0], [W - 4, 0], [0, H - 4], [W - 4, H - 4]] as const) {
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
            px(png, mx + dx, my + dy, 255, 255, 255, 255);
        }
    }

    // 4×4 center marker
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        px(png, 126 + dx, 126 + dy, 255, 255, 255, 255);
    }

    save(png, 'technical/filtering/uv-grid-256.png');
}

// ── Color ─────────────────────────────────────────────────────────────────────

function genSrgbRamp(): void {
    const W = 256, H = 64;
    const png = makePng(W, H);

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const v = y < 32
                ? x                                                  // smooth
                : Math.min(255, Math.floor(x / 16) * 17);           // 16 steps
            px(png, x, y, v, v, v, 255);
        }
    }

    save(png, 'technical/color/srgb-ramp.png');
}

function genHueRamp(): void {
    const W = 256, H = 64;
    const png = makePng(W, H);

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const [r, g, b] = hsvToRgb((x / W) * 360, 1, 1);
            px(png, x, y, r, g, b, 255);
        }
    }

    save(png, 'technical/color/hue-ramp.png');
}

function genPrimaryRamp(): void {
    const W = 256, H = 64;
    const png = makePng(W, H);

    const colors: Array<[number, number, number]> = [
        [255, 0, 0],     // Red
        [0, 255, 0],     // Green
        [0, 0, 255],     // Blue
        [0, 255, 255],   // Cyan
        [255, 0, 255],   // Magenta
        [255, 255, 0],   // Yellow
        [255, 255, 255], // White
        [0, 0, 0],       // Black
    ];

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const blockIdx = Math.floor(x / 32);
            const localX = x % 32;
            const [cr, cg, cb] = colors[blockIdx];
            if (y < 32) {
                px(png, x, y, cr, cg, cb, 255);
            } else {
                // gradient: full color at left edge, black at right edge
                const t = 1 - localX / 31;
                px(png, x, y, Math.round(cr * t), Math.round(cg * t), Math.round(cb * t), 255);
            }
        }
    }

    save(png, 'technical/color/primary-ramp.png');
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log('[generate-technical-assets] Generating 8 technical test PNGs...');
genAlphaEdgeStraight();
genAlphaGradientRings();
genChecker256();
genPixelGrid128();
genUvGrid256();
genSrgbRamp();
genHueRamp();
genPrimaryRamp();
console.log('[generate-technical-assets] Done.');
