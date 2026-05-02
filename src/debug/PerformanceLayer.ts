import { DebugLayer } from './DebugLayer';
import { Graphics } from '@/rendering/primitives/Graphics';
import { Text } from '@/rendering/text/Text';
import { TextStyle } from '@/rendering/text/TextStyle';
import { Color } from '@/core/Color';
import { Container } from '@/rendering/Container';
import type { Time } from '@/core/Time';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { Application } from '@/core/Application';
import type { RenderNode } from '@/rendering/RenderNode';

// --- layout constants (camelCase to satisfy lint naming convention) ----------

const panelX = 8;
const panelY = 8;
const panelW = 180;
const panelH = 130;

const lineH = 14;
const textSize = 11;
const textRowCount = 4;
const sparklineY = panelY + 8 + textRowCount * lineH + 4;
const sparklineH = panelH - (sparklineY - panelY) - 4;
const sparklineW = panelW - 16;
const sparklineX = panelX + 8;

const fpsSampleCount = 60;
const sparklineSampleCount = 120;
const sparklineMaxMs = 33; // 100% height = 33ms (~30 fps)

// Semi-transparent dark background.
const bgColor = new Color(0, 0, 0, 0.7);
// Bright text color (light blue-white).
const textColor = Color.white.clone();
// Cyan sparkline.
const sparklineColor = new Color(0, 1, 1, 1.0);

// -----------------------------------------------------------------------------

/** Recursively count nodes under a RenderNode. */
function countNodes(node: RenderNode): number {
    let count = 1;
    const container = node as Partial<{ children: Array<RenderNode>; }>;

    if (Array.isArray(container.children)) {
        for (const child of container.children) {
            count += countNodes(child);
        }
    }

    return count;
}

export class PerformanceLayer extends DebugLayer {
    // Rolling FPS sample buffer (60 samples).
    private readonly _fpsSamples: Float32Array = new Float32Array(fpsSampleCount);
    private _fpsSampleIndex = 0;

    // Rolling frame-time buffer (120 samples) for sparkline.
    private readonly _sparkSamples: Float32Array = new Float32Array(sparklineSampleCount);
    private _sparkSampleIndex = 0;

    // Root container — lazily initialized on first update() call so the
    // glyph atlas is not touched in environments where canvas 2D is absent.
    private _root: Container | null = null;
    private _textFps: Text | null = null;
    private _textFrame: Text | null = null;
    private _textDraws: Text | null = null;
    private _textNodes: Text | null = null;
    private _sparkline: Graphics | null = null;

    public constructor(app: Application) {
        super(app);
    }

    public override update(delta: Time): void {
        // Lazily build the scene graph on first update so that Text (which
        // touches the glyph atlas immediately) is only constructed when the
        // layer is first made visible — not at DebugOverlay construction time.
        if (this._root === null) {
            this._build();
        }

        // --- FPS rolling average ---
        const frameMs = delta.milliseconds;

        this._fpsSamples[this._fpsSampleIndex] = frameMs;
        this._fpsSampleIndex = (this._fpsSampleIndex + 1) % fpsSampleCount;

        let totalMs = 0;
        let validSamples = 0;

        for (let i = 0; i < fpsSampleCount; i++) {
            const s = this._fpsSamples[i];

            if (s > 0) {
                totalMs += s;
                validSamples++;
            }
        }

        const avgMs = validSamples > 0 ? totalMs / validSamples : 0;
        const fps   = avgMs > 0 ? 1000 / avgMs : 0;

        // --- Sparkline sample ---
        this._sparkSamples[this._sparkSampleIndex] = frameMs;
        this._sparkSampleIndex = (this._sparkSampleIndex + 1) % sparklineSampleCount;

        // --- Stats ---
        const stats = this._app.backend.stats;
        const scene = this._app.sceneManager.scene;
        const nodeCount = scene ? countNodes(scene.root as RenderNode) : 0;

        // --- Update text ---
        if (this._textFps !== null) {
            this._textFps.text   = `FPS: ${fps.toFixed(1)}`;
        }

        if (this._textFrame !== null) {
            this._textFrame.text = `Frame: ${frameMs.toFixed(1)}ms`;
        }

        if (this._textDraws !== null) {
            this._textDraws.text = `Draws: ${stats.drawCalls}`;
        }

        if (this._textNodes !== null) {
            this._textNodes.text = `Nodes: ${nodeCount}`;
        }

        // --- Rebuild sparkline geometry ---
        if (this._sparkline !== null) {
            this._sparkline.clear();
            this._sparkline.lineWidth = 1;
            this._sparkline.lineColor = sparklineColor;

            // Walk samples in chronological order (oldest first).
            const oldest = this._sparkSampleIndex;
            const stepX = sparklineW / (sparklineSampleCount - 1);

            let started = false;

            for (let i = 0; i < sparklineSampleCount; i++) {
                const idx = (oldest + i) % sparklineSampleCount;
                const ms  = this._sparkSamples[idx];
                const px  = sparklineX + i * stepX;
                const py  = sparklineY + sparklineH - Math.min(1, ms / sparklineMaxMs) * sparklineH;

                if (!started) {
                    this._sparkline.moveTo(px, py);
                    started = true;
                } else {
                    this._sparkline.lineTo(px, py);
                }
            }
        }
    }

    public override render(backend: RenderBackend): void {
        this._root?.render(backend);
    }

    public override destroy(): void {
        if (this._root !== null) {
            this._root.destroy();
            this._root = null;
        }

        this._textFps = null;
        this._textFrame = null;
        this._textDraws = null;
        this._textNodes = null;
        this._sparkline = null;
    }

    // -----------------------------------------------------------------------

    private _build(): void {
        const style = new TextStyle({
            fontSize: textSize,
            fontFamily: 'Arial',
            fontWeight: 'normal',
            fillColor: textColor,
            strokeThickness: 0,
        });

        const bg = new Graphics();

        bg.fillColor = bgColor;
        bg.drawRectangle(panelX, panelY, panelW, panelH);

        this._textFps   = new Text('FPS: -',    style.clone());
        this._textFrame = new Text('Frame: -',  style.clone());
        this._textDraws = new Text('Draws: -',  style.clone());
        this._textNodes = new Text('Nodes: -',  style.clone());

        this._textFps.x   = panelX + 8;   this._textFps.y   = panelY + 8;
        this._textFrame.x = panelX + 8;   this._textFrame.y = panelY + 8 + lineH;
        this._textDraws.x = panelX + 8;   this._textDraws.y = panelY + 8 + lineH * 2;
        this._textNodes.x = panelX + 8;   this._textNodes.y = panelY + 8 + lineH * 3;

        this._sparkline = new Graphics();

        this._root = new Container();
        this._root.addChild(bg);
        this._root.addChild(this._textFps);
        this._root.addChild(this._textFrame);
        this._root.addChild(this._textDraws);
        this._root.addChild(this._textNodes);
        this._root.addChild(this._sparkline);
    }
}
