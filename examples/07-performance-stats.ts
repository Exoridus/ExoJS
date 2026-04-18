import { Container, Drawable } from 'exojs';

function buildCrowd(root: Container): void {
    for (let i = 0; i < 2000; i++) {
        const node = new Drawable();

        node.getLocalBounds().set(0, 0, 8, 8);
        node.setPosition((i % 100) * 20, Math.floor(i / 100) * 20);

        root.addChild(node);
    }
}

function reportStats(app: import('exojs').Application): void {
    const stats = app.renderManager.stats;

    console.log(
        `frame=${stats.frame} submitted=${stats.submittedNodes} culled=${stats.culledNodes} `
        + `drawCalls=${stats.drawCalls} batches=${stats.batches} frameMs=${stats.frameTimeMs.toFixed(2)}`,
    );
}

function markAlwaysVisible(node: Drawable): void {
    node.setCullable(false);
}

export { buildCrowd, reportStats, markAlwaysVisible };
