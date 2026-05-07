import { DebugLayer } from './DebugLayer';
import { Graphics } from '@/rendering/primitives/Graphics';
import { Color } from '@/core/Color';
import { Container } from '@/rendering/Container';
import type { DebugLayerViewMode } from './DebugLayer';
import type { Time } from '@/core/Time';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { Application } from '@/core/Application';
import type { RenderNode } from '@/rendering/RenderNode';

// Color constants (created once, reused).
const colorIdle     = new Color(1,    0,    1,    0.6); // magenta
const colorHovered  = new Color(1,    1,    0,    0.9); // yellow
const colorCaptured = new Color(0,    1,    1,    0.9); // cyan
const colorQuadrant = new Color(0.5,  0.5,  0.5,  0.3); // faint gray

/**
 * Debug layer that draws outlines around interactive scene nodes.
 * - Magenta: interactive but idle.
 * - Yellow: currently hovered.
 * - Cyan: pointer-captured (drag in progress).
 * - Faint gray quadrant outlines when the spatial index is active (i.e.
 *   at least one interactive node is present in the scene).
 * World-space.
 */
export class HitTestLayer extends DebugLayer {
    private _graphics: Graphics | null = null;

    public constructor(app: Application) {
        super(app);
    }

    /** Renders in world-space so outlines align with interactive node positions. */
    public override get viewMode(): DebugLayerViewMode {
        return 'world';
    }

    /** No per-frame pre-computation required; all state is derived in {@link render}. */
    public override update(_delta: Time): void {
        // Nothing to pre-compute; all state is read in render().
    }

    /**
     * Walk the scene tree and draw color-coded outlines around interactive
     * nodes (magenta = idle, yellow = hovered, cyan = pointer-captured).
     * Also draws faint gray quadrant boundaries when the spatial index is
     * active, helping diagnose partitioning behavior.
     */
    public override render(backend: RenderBackend): void {
        const root = this._app.sceneManager.scene?.root;

        if (!root) {
            return;
        }

        if (this._graphics === null) {
            this._graphics = new Graphics();
        }

        const gfx = this._graphics;

        gfx.clear();
        gfx.lineWidth = 1;

        // Determine hovered and captured sets for color-coding.
        const interaction = this._app.interaction;
        const hoveredNode = interaction.getHoveredNode();
        const capturedNodes = new Set(interaction.getCapturedNodes());

        // Walk scene and draw outlines for interactive nodes.
        this._walkNode(root as RenderNode, gfx, hoveredNode, capturedNodes);

        // Draw quadtree regions when the spatial index is active.
        const quadtree = interaction._getDebugQuadtree();

        if (quadtree !== null) {
            gfx.lineColor = colorQuadrant;

            quadtree._walkBounds((rect) => {
                gfx.moveTo(rect.left,  rect.top);
                gfx.lineTo(rect.right, rect.top);
                gfx.lineTo(rect.right, rect.bottom);
                gfx.lineTo(rect.left,  rect.bottom);
                gfx.lineTo(rect.left,  rect.top);
            });
        }

        gfx.render(backend);
    }

    /** Release the internal {@link Graphics} primitive. */
    public override destroy(): void {
        if (this._graphics !== null) {
            this._graphics.destroy();
            this._graphics = null;
        }
    }

    // -----------------------------------------------------------------------

    private _walkNode(
        node: RenderNode,
        gfx: Graphics,
        hovered: RenderNode | null,
        captured: Set<RenderNode>,
    ): void {
        if (!node.visible) {
            return;
        }

        if (node.interactive) {
            const bounds = node.getBounds();

            if (bounds.width > 0 && bounds.height > 0) {
                if (captured.has(node)) {
                    gfx.lineColor = colorCaptured;
                } else if (node === hovered) {
                    gfx.lineColor = colorHovered;
                } else {
                    gfx.lineColor = colorIdle;
                }

                gfx.moveTo(bounds.left,  bounds.top);
                gfx.lineTo(bounds.right, bounds.top);
                gfx.lineTo(bounds.right, bounds.bottom);
                gfx.lineTo(bounds.left,  bounds.bottom);
                gfx.lineTo(bounds.left,  bounds.top);
            }
        }

        // Recurse into Container children.
        const container = node as Partial<{ children: Array<RenderNode> }>;

        if (Array.isArray(container.children)) {
            for (const child of container.children) {
                this._walkNode(child, gfx, hovered, captured);
            }
        }
    }
}
