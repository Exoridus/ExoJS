import { Application, Asset, Color, Scene, Sprite, Spritesheet, type SpritesheetData, TextureRegion, Vector } from '@codexo/exojs';
import { BoxShape, type PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';
import { PhysicsDebugDraw } from '@codexo/exojs-physics/debug';
import { ObjectKind, ObjectLayer, type RectangleObject, TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension, TileMapNode, TileSet } from '@codexo/exojs-tilemap';
import { buildCollidersFromObjectLayer } from '@examples/physics-tilemap';
import { mountControls } from '@examples/runtime';

// Combined Tiled + physics demo.
//
//   1. A hand-built `TileMap` is rendered with a `TileMapNode` (tilemap
//      extension installed below).
//   2. An `ObjectLayer` carries the level's solid regions — exactly the data a
//      Tiled "collision" object layer would hold.
//   3. `buildCollidersFromObjectLayer` (the shared bridge recipe) walks that
//      layer and adds one static `PhysicsBody` per region to the world.
//   4. A dynamic actor is dropped in with `world.attach` and falls onto the
//      generated colliders, bouncing between the walls.
//
// The green outlines are the physics debug overlay — every outline was built
// from an object-layer rectangle by the bridge, so they line up with the tiles.

const TILE = 64;
const COLUMNS = 20;
const ROWS = 11;

const app = new Application({
    canvas: {
        width: COLUMNS * TILE,
        height: ROWS * TILE,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(38, 46, 66),
    // The tilemap extension wires the per-backend tile chunk renderers so
    // TileMapNode can draw. Physics is a plain library — no extension needed.
    extensions: [tilemapExtension],
});

class TiledMapPhysicsActorScene extends Scene {
    private world!: PhysicsWorld;
    private mapNode!: TileMapNode;
    private actor!: Sprite;
    private actorBody!: PhysicsBody;
    private debug!: PhysicsDebugDraw;
    private hud!: ReturnType<typeof mountControls>;

    override async init(): Promise<void> {
        this.world = new PhysicsWorld({ gravity: { x: 0, y: 1500 } });

        // ── Tileset + a single ground tile layer ──────────────────────────
        // The map-pack tilesheet is a uniform 64×64 grid (17 columns), so it
        // works as a classic grid tileset. We only need one solid-looking tile.
        const tilesTexture = this.loader.get(assets.demo.tilesets.map.image);
        const tileset = new TileSet({
            name: 'map',
            texture: new TextureRegion(tilesTexture, { x: 0, y: 0, width: tilesTexture.width, height: tilesTexture.height }),
            tileWidth: TILE,
            tileHeight: TILE,
            tileCount: 204,
            columns: 17,
        });

        const groundTile = 0; // top-left grid tile — a solid block.
        const layer = new TileLayer({ id: 1, name: 'ground', width: COLUMNS, height: ROWS, tileWidth: TILE, tileHeight: TILE, tilesets: [tileset] });

        // Paint a floor row + two side walls + two floating platforms.
        for (let tx = 0; tx < COLUMNS; tx++) {
            layer.setTileAt(tx, ROWS - 1, { tileset, localTileId: groundTile, transform: TILE_TRANSFORM_IDENTITY });
        }
        for (let ty = 0; ty < ROWS; ty++) {
            layer.setTileAt(0, ty, { tileset, localTileId: groundTile, transform: TILE_TRANSFORM_IDENTITY });
            layer.setTileAt(COLUMNS - 1, ty, { tileset, localTileId: groundTile, transform: TILE_TRANSFORM_IDENTITY });
        }
        for (let tx = 4; tx <= 7; tx++) {
            layer.setTileAt(tx, 6, { tileset, localTileId: groundTile, transform: TILE_TRANSFORM_IDENTITY });
        }
        for (let tx = 12; tx <= 15; tx++) {
            layer.setTileAt(tx, 4, { tileset, localTileId: groundTile, transform: TILE_TRANSFORM_IDENTITY });
        }

        // ── Object layer: the solid regions, exactly mirroring the tiles ──
        // In a Tiled project these rectangles would be drawn in a "collision"
        // object layer; here we author them by hand to match the painted tiles.
        const map = new TileMap({
            name: 'level',
            width: COLUMNS,
            height: ROWS,
            tileWidth: TILE,
            tileHeight: TILE,
            tilesets: [tileset],
            layers: [layer],
            objectLayers: [
                new ObjectLayer({
                    id: 10,
                    name: 'collision',
                    objects: [
                        rect(1, 0, (ROWS - 1) * TILE, COLUMNS * TILE, TILE, 'floor'),
                        rect(2, 0, 0, TILE, ROWS * TILE, 'wall-left'),
                        rect(3, (COLUMNS - 1) * TILE, 0, TILE, ROWS * TILE, 'wall-right'),
                        rect(4, 4 * TILE, 6 * TILE, 4 * TILE, TILE, 'platform-a'),
                        rect(5, 12 * TILE, 4 * TILE, 4 * TILE, TILE, 'platform-b'),
                    ],
                }),
            ],
        });

        this.mapNode = new TileMapNode(map);

        // ── The bridge: ObjectLayer → static physics colliders ────────────
        const collision = map.getObjectLayer('collision');

        if (collision) {
            const built = buildCollidersFromObjectLayer(this.world, collision, { friction: 0.7, restitution: 0.05 });

            this.hud = mountControls({
                title: 'Tiled Map + Physics Actor',
                controls: [{ keys: 'Auto', action: 'actor falls and bounces across the level' }],
                status: `${built.length} static colliders built from the object layer`,
                hint: 'buildCollidersFromObjectLayer() turns a Tiled object layer into static bodies; the actor falls onto them via world.attach.',
            });
        }

        // ── Dynamic actor ─────────────────────────────────────────────────
        const characters = new Spritesheet(
            this.loader.get(assets.demo.spritesheets.platformerCharacters.image),
            (await this.loader.load(Asset.kind('json', assets.demo.spritesheets.platformerCharacters.data))) as SpritesheetData,
        );

        this.actor = characters.getFrameSprite('character_green_front').setAnchor(0.5);
        this.actorBody = this.world.attach(this.actor, {
            type: 'dynamic',
            position: { x: 5 * TILE, y: 2 * TILE },
            shape: new BoxShape(48, 64),
            friction: 0.3,
            restitution: 0.25,
        });
        this.actorBody.applyImpulse(2600, 0);

        // Physics debug overlay: outlines every collider so the bridge output
        // is visible on top of the rendered tiles.
        this.debug = new PhysicsDebugDraw(this.app, this.world, { drawShapes: true, drawCenters: true });
    }

    override update(delta): void {
        this.world.step(delta.seconds);

        const { width, height } = this.app.canvas;
        const body = this.actorBody;

        // Loop the demo: nudge the actor again once it settles, and rescue it if
        // it ever escapes the bounds.
        const speed = Math.hypot(body.linearVelocityX, body.linearVelocityY);

        if ((speed < 8 && body.y > height - 3 * TILE) || body.x < 0 || body.x > width || body.y > height + 200) {
            body.setTransform(new Vector(5 * TILE, 2 * TILE), 0);
            body.linearVelocityX = 0;
            body.linearVelocityY = 0;
            body.angularVelocity = 0;
            body.applyImpulse((Math.random() * 2 + 1) * 1400 * (Math.random() < 0.5 ? -1 : 1), -600);
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.mapNode);
        context.render(this.actor);
        this.debug.render(context.backend);
    }
}

/** Author a rectangle collision object (top-left origin, like Tiled). */
function rect(id: number, x: number, y: number, width: number, height: number, name: string): RectangleObject {
    return {
        kind: ObjectKind.Rectangle,
        id,
        name,
        type: 'solid',
        x,
        y,
        width,
        height,
        rotation: 0,
        visible: true,
        properties: {},
    };
}

app.start(new TiledMapPhysicsActorScene());
