import { Application, Asset, Color, Graphics, type RenderingContext, Scene } from '@codexo/exojs';
import { tiledExtension, TileMapNode } from '@codexo/exojs-tiled';
import { ObjectKind, type ObjectQuery, type TileMapObject } from '@codexo/exojs-tilemap';
import { mountControlPanel, mountControls } from '@examples/runtime';

// Loading a Tiled `.tmj` map through @codexo/exojs-tiled's *advanced*
// parsed-source path, then querying its object layer.
//
//   - `loader.load(Asset.kind('tiledMap', url))` returns a `TiledMap` — the
//     fully parsed, diagnostic-friendly source model (map/tileset/layer
//     metadata, custom properties, `.getProperty()`). This is the same file
//     the common-case `Asset.kind('tileMap', url)` binding loads internally.
//   - `TiledMap.toTileMap()` converts it, synchronously, to the generic
//     runtime `TileMap` that `TileMapNode` renders.
//   - `ObjectLayer.query(filter)` finds objects by `type`, `kind`, or a
//     custom `property`/`value` pair — the same object-layer data a "Tiled
//     collision layer -> physics colliders" bridge would walk (see the
//     Physics chapter's "Tiled Map + Physics Actor" example), here just
//     queried and outlined instead of turned into colliders.
//
// harbor-plaza.tmj (examples/assets/json/maps/) is a small hand-authored
// map: a "Ground" tile layer plus a "Zones" object layer with two water
// docks (type "water", property "hazard"), a market (type "market", property
// "shop"), a spawn point, and an ellipse landmark.

const TILE = 64;
const COLUMNS = 20;
const ROWS = 12;



const FILTERS: ReadonlyArray<{ label: string; query: ObjectQuery }> = [
    { label: 'all zones', query: {} },
    { label: 'type: water', query: { type: 'water' } },
    { label: 'type: market', query: { type: 'market' } },
    { label: 'property: hazard=true', query: { property: 'hazard', value: true } },
    { label: 'kind: point', query: { kind: ObjectKind.Point } },
];

class TiledMapImportScene extends Scene {
    private mapNode!: TileMapNode;
    private overlay = new Graphics();
    private zoneObjects: TileMapObject[] = [];
    private filterIndex = 0;
    private hud!: ReturnType<typeof mountControls>;

    override async init(): Promise<void> {
        // Advanced path: parsed TiledMap -> map property lookup -> manual
        // toTileMap() conversion (the common-case Asset.kind('tileMap', ...)
        // binding does the same conversion internally).
        const source = await this.loader.load(Asset.kind('tiledMap', 'json/maps/harbor-plaza.tmj'));
        const runtimeMap = source.toTileMap();

        this.mapNode = new TileMapNode(runtimeMap);

        const zones = runtimeMap.getObjectLayer('Zones');

        if (!zones) {
            throw new Error('harbor-plaza.tmj is missing its "Zones" object layer');
        }

        this.zoneObjects = zones.objects.slice();

        this.overlay.lineWidth = 3;
        this.overlay.lineColor = Color.gold;

        this.hud = mountControls({
            title: 'Tiled Map Import & Object Query',
            controls: [{ keys: 'panel', action: 'cycle the ObjectLayer.query() filter' }],
            status: `region: ${String(source.getProperty('region')?.value ?? '?')} — ${this.zoneObjects.length} objects in "Zones"`,
            hint: 'ObjectLayer.query() filters by type / kind / a property+value pair — matching zones are outlined in gold.',
        });

        const panel = mountControlPanel({ title: 'Object query' });
        panel.addCycle({
            label: 'Filter',
            options: FILTERS.map(entry => entry.label),
            index: 0,
            onChange: index => {
                this.filterIndex = index;
                this.redrawQuery(zones.query(FILTERS[index]!.query));
            },
        });

        this.redrawQuery(zones.query(FILTERS[this.filterIndex]!.query));
    }

    private redrawQuery(matches: TileMapObject[]): void {
        this.overlay.clear();
        this.overlay.lineWidth = 3;
        this.overlay.lineColor = Color.gold;

        for (const object of matches) {
            if (object.kind === ObjectKind.Point) {
                this.overlay.drawCircle(object.x, object.y, 10);
            } else {
                // Rectangle and ellipse zones both carry [x, y, width, height]
                // bounds; draw whichever outline matches the object's own kind.
                if (object.kind === ObjectKind.Ellipse) {
                    this.overlay.drawEllipse(object.x + object.width / 2, object.y + object.height / 2, object.width / 2, object.height / 2);
                } else {
                    this.overlay.drawRectangle(object.x, object.y, object.width, object.height);
                }
            }
        }

        const names = matches.map(object => object.name || `#${object.id}`).join(', ') || 'none';

        this.hud.setStatus(`${FILTERS[this.filterIndex]!.label}: ${matches.length} match(es) — ${names}`);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.mapNode);
        context.render(this.overlay);
    }
}

const app = new Application({
    scenes: { TiledMapImportScene },
    canvas: {
        width: COLUMNS * TILE,
        height: ROWS * TILE,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(28, 36, 46),
    // tiledExtension depends on tilemapExtension, so registering it alone is
    // enough for both loading (.tmj) and rendering (TileMapNode).
    extensions: [tiledExtension],
    loader: {
        basePath: 'assets/',
    },
});

app.start(TiledMapImportScene);
