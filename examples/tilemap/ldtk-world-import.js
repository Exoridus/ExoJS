// Auto-generated from ldtk-world-import.ts — edit the .ts source, not this file.
import { Application, Asset, Color, Container, Graphics, Scene, Text } from '@codexo/exojs';
import { getLdtkIntGridValueAt, ldtkExtension } from '@codexo/exojs-ldtk';
import { TileMapNode } from '@codexo/exojs-tilemap';
import { mountControlPanel, mountControls } from '@examples/runtime';
// Loading an LDtk world (`.ldtk`) through @codexo/exojs-ldtk.
//
//   - `loader.load(Asset.kind('ldtkMap', url))` fetches the world, loads every referenced
//     tileset image, and converts *every* level to its own runtime `TileMap`
//     in one pass — `world.levels` (document order) or
//     `world.getLevelByName(identifier)`.
//   - `TileMapNode` renders any one level exactly like a Tiled-sourced map —
//     same runtime, same renderer.
//   - LDtk's `IntGrid` layers (collision/terrain grids painted as plain
//     integers, not tiles) convert to ordinary `TileLayer`s carrying the raw
//     per-cell values as reserved properties; `getLdtkIntGridValueAt(layer,
//     x, y)` looks up the named + coloured definition for a cell.
//   - LDtk `Entities` layers convert to `ObjectLayer`s — the same
//     `TileMapObject` shape a Tiled object layer produces, with entity
//     fields (`Int`, `String`, ...) carried as `properties`.
//
// harbor-world.ldtk (examples/assets/json/maps/) defines two levels sharing
// one tileset: "Level_Harbor" and "Level_Lighthouse", each with a Ground
// tile layer, a Walls IntGrid layer (Wall / Water), and an Entities layer.
const app = new Application({
    canvas: {
        width: 640,
        height: 448,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(18, 22, 30),
    // ldtkExtension depends on tilemapExtension, so registering it alone is
    // enough for both loading (.ldtk) and rendering (TileMapNode).
    extensions: [ldtkExtension],
});
class LdtkWorldImportScene extends Scene {
    world;
    content = new Container();
    hud;
    showIntGrid = true;
    async init() {
        // The .ldtk source must be an absolute URL: @codexo/exojs-ldtk resolves
        // tileset relPaths with `new URL(relPath, source)`, which throws for a
        // relative `source` (unlike the Tiled adapter's relative-base-aware
        // resolver). Resolve against the page URL until the adapter handles
        // relative bases itself.
        const worldUrl = new URL('assets/json/maps/harbor-world.ldtk', window.location.href).href;
        this.world = await this.loader.load(Asset.kind('ldtkMap', worldUrl));
        this.hud = mountControls({
            title: 'LDtk World Import',
            controls: [{ keys: 'panel', action: 'switch level / toggle the IntGrid overlay' }],
            status: `${this.world.levels.length} levels loaded`,
            hint: 'Coloured squares come from getLdtkIntGridValueAt() — the raw Walls IntGrid cell values, resolved to their LDtk-authored name + colour.',
        });
        const panel = mountControlPanel({ title: 'LDtk' });
        panel.addCycle({
            label: 'Level',
            options: this.world.levels.map(level => level.name),
            index: 0,
            onChange: index => this.showLevel(index),
        });
        panel.addToggle({
            label: 'IntGrid overlay',
            value: true,
            onChange: on => {
                this.showIntGrid = on;
                this.showLevel(this.currentLevelIndex);
            },
        });
        this.showLevel(0);
    }
    currentLevelIndex = 0;
    showLevel(index) {
        this.currentLevelIndex = index;
        this.content.removeChildren();
        const level = this.world.levels[index];
        if (!level) {
            return;
        }
        const mapNode = new TileMapNode(level);
        this.content.addChild(mapNode);
        if (this.showIntGrid) {
            this.content.addChild(this.buildIntGridOverlay(level));
        }
        this.content.addChild(this.buildEntityLabels(level));
        const entities = level.getObjectLayer('Entities');
        this.hud.setStatus(`${level.name}: ${entities?.objects.length ?? 0} entities, ${level.width}x${level.height} tiles`);
    }
    /** Tint every IntGrid cell using its LDtk-authored name + colour (Wall / Water). */
    buildIntGridOverlay(level) {
        const overlay = new Graphics();
        const walls = level.layers.find(layer => layer.name === 'Walls');
        if (!walls) {
            return overlay;
        }
        for (let ty = 0; ty < walls.height; ty++) {
            for (let tx = 0; tx < walls.width; tx++) {
                const value = getLdtkIntGridValueAt(walls, tx, ty);
                if (!value) {
                    continue;
                }
                const color = hexToColor(value.color, 0.45);
                overlay.fillColor = color;
                overlay.drawRectangle(tx * walls.tileWidth, ty * walls.tileHeight, walls.tileWidth, walls.tileHeight);
            }
        }
        return overlay;
    }
    /** One small label per entity, naming it and its first custom field. */
    buildEntityLabels(level) {
        const labels = new Container();
        const entities = level.getObjectLayer('Entities');
        for (const entity of entities?.objects ?? []) {
            const fieldSummary = Object.entries(entity.properties)
                .map(([key, value]) => `${key}=${String(value)}`)
                .join(', ');
            const label = new Text(fieldSummary ? `${entity.name} (${fieldSummary})` : entity.name, { fillColor: Color.white, fontSize: 12 });
            label.setAnchor(0.5, 1);
            label.setPosition(entity.x + entity.width / 2, entity.y - 4);
            labels.addChild(label);
        }
        return labels;
    }
    draw(context) {
        context.backend.clear();
        context.render(this.content);
    }
}
/** Parse an LDtk `"#rrggbb"` colour string into an engine `Color` with the given alpha. */
function hexToColor(hex, alpha) {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    return new Color((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, alpha);
}
app.start(new LdtkWorldImportScene());
