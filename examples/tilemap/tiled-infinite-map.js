// Auto-generated from tiled-infinite-map.ts — edit the .ts source, not this file.
import { Application, Asset, Color, Keyboard, Scene, View } from '@codexo/exojs';
import { tiledExtension } from '@codexo/exojs-tiled';
import { ChunkStreamer, TileMapNode } from '@codexo/exojs-tilemap';
import { mountControls } from '@examples/runtime';
// A hand-authored Tiled `.tmj` infinite map, streamed the same way the
// procedural-terrain examples stream generated worlds: TiledMap.toTileMap()
// converts every chunked ("infinite") tile layer to an unbounded runtime
// TileLayer and builds a ChunkSource for it as a side effect; getChunkSource
// hands that source to a ChunkStreamer — one per chunked layer — ticked from
// a free-flying WASD camera with no bounds.
//
// drift-fields.tmj (examples/assets/json/maps/) is a small island cluster: a
// "Ground" tile layer (8 on-disk 16x16 chunks — a sand beach ring, a rock
// outcrop near the origin, a snow patch tucked into the interior, and an open
// "bay" where one corner chunk was left unauthored) and a sparser "Props"
// tile layer (6 chunks of scattered boulder/gem decoration) stacked on top.
// Everywhere neither layer has an on-disk chunk, the map shows nothing —
// the clear color behind it reads as open water.
const TILE = 64;
const MOVE_SPEED = 480;
const app = new Application({
    canvas: { width: 1280, height: 720, mount: document.body, sizingMode: 'fit' },
    clearColor: new Color(38, 82, 128), // deep-water blue behind unauthored/unloaded chunks
    // tiledExtension depends on tilemapExtension, so registering it alone is
    // enough for both loading (.tmj) and rendering (TileMapNode).
    extensions: [tiledExtension],
    loader: {
        basePath: 'assets/',
    },
});
class TiledInfiniteMapScene extends Scene {
    camera;
    mapNode;
    groundStreamer;
    propsStreamer;
    moveX = 0;
    moveY = 0;
    hudTimer = 0;
    hud;
    async init() {
        const source = await this.loader.load(Asset.kind('tiledMap', 'json/maps/drift-fields.tmj'));
        const runtimeMap = source.toTileMap();
        this.mapNode = new TileMapNode(runtimeMap);
        const ground = runtimeMap.getTileLayer('Ground');
        const props = runtimeMap.getTileLayer('Props');
        if (!ground || !props) {
            throw new Error('drift-fields.tmj is missing its "Ground" or "Props" tile layer');
        }
        // getChunkSource is a side effect of the toTileMap() call above — it
        // returns undefined for a finite (data-based) layer, and one
        // ChunkSource per chunked ("infinite") layer otherwise.
        const groundSource = source.getChunkSource(ground.id);
        const propsSource = source.getChunkSource(props.id);
        if (!groundSource || !propsSource) {
            throw new Error('drift-fields.tmj\'s "Ground"/"Props" layers are not chunked — is "infinite" true?');
        }
        const { width, height } = app.canvas;
        // Free camera: moved directly by WASD, not following any actor — no
        // setBounds, since an unbounded map has no edges to clamp to.
        this.camera = new View(0, 0, width, height);
        this.groundStreamer = new ChunkStreamer(ground, groundSource, this.camera);
        this.propsStreamer = new ChunkStreamer(props, propsSource, this.camera);
        this.setupInput();
        this.setupHud();
    }
    setupInput() {
        this.inputs.onActive(Keyboard.A, () => (this.moveX = -1));
        this.inputs.onStop(Keyboard.A, () => {
            if (this.moveX < 0)
                this.moveX = 0;
        });
        this.inputs.onActive(Keyboard.D, () => (this.moveX = 1));
        this.inputs.onStop(Keyboard.D, () => {
            if (this.moveX > 0)
                this.moveX = 0;
        });
        this.inputs.onActive(Keyboard.W, () => (this.moveY = -1));
        this.inputs.onStop(Keyboard.W, () => {
            if (this.moveY < 0)
                this.moveY = 0;
        });
        this.inputs.onActive(Keyboard.S, () => (this.moveY = 1));
        this.inputs.onStop(Keyboard.S, () => {
            if (this.moveY > 0)
                this.moveY = 0;
        });
    }
    setupHud() {
        this.hud = mountControls({
            title: 'Tiled Infinite Map Streaming',
            controls: [{ keys: 'WASD', action: 'fly the free camera across the streamed map' }],
            status: '',
            hint: '"Ground" and "Props" each stream through their own ChunkStreamer, sourced from TiledMap.getChunkSource(layer.id) — Tiled\'s on-disk 16x16 chunks are re-sliced onto the runtime chunk grid on demand, one requested chunk at a time.',
        });
    }
    update(delta) {
        if (this.moveX !== 0 || this.moveY !== 0) {
            const length = Math.hypot(this.moveX, this.moveY) || 1;
            this.camera.move((this.moveX / length) * MOVE_SPEED * delta.seconds, (this.moveY / length) * MOVE_SPEED * delta.seconds);
        }
        this.groundStreamer.update();
        this.propsStreamer.update();
        this.hudTimer += delta.seconds;
        if (this.hudTimer >= 0.25) {
            this.hudTimer = 0;
            const tx = Math.floor(this.camera.center.x / TILE);
            const ty = Math.floor(this.camera.center.y / TILE);
            this.hud.setStatus(`ground ${this.groundStreamer.residentCount} chunks · props ${this.propsStreamer.residentCount} chunks · tile ${tx}, ${ty}`);
        }
    }
    draw(context) {
        context.backend.clear();
        context.render(this.mapNode, { view: this.camera });
    }
}
app.start(new TiledInfiniteMapScene());
