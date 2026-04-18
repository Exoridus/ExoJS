export interface RenderStats {
    frame: number;
    submittedNodes: number;
    culledNodes: number;
    drawCalls: number;
    batches: number;
    renderPasses: number;
    renderTargetChanges: number;
    frameTimeMs: number;
}

export const createRenderStats = (): RenderStats => ({
    frame: 0,
    submittedNodes: 0,
    culledNodes: 0,
    drawCalls: 0,
    batches: 0,
    renderPasses: 0,
    renderTargetChanges: 0,
    frameTimeMs: 0,
});

export const resetRenderStats = (stats: RenderStats): RenderStats => {
    stats.frame++;
    stats.submittedNodes = 0;
    stats.culledNodes = 0;
    stats.drawCalls = 0;
    stats.batches = 0;
    stats.renderPasses = 0;
    stats.renderTargetChanges = 0;
    stats.frameTimeMs = 0;

    return stats;
};
