// Auto-generated from infinite-terrain.ts — edit the .ts source, not this file.
import { Application, Asset, Color, Container, Keyboard, Scene, Spritesheet, TextureRegion, View } from '@codexo/exojs';
import { ChunkStreamer, createSampledChunkSource, TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension, TileSet } from '@codexo/exojs-tilemap';
import { mountControlPanel, mountControls } from '@examples/runtime';
// An infinite, procedurally generated world: the TileLayer has NO width/height
// (unbounded), and a ChunkStreamer keeps only the chunks near the camera
// resident. Terrain comes from a deterministic value-noise fBm sampler fed
// through createSampledChunkSource — same seed, same world, every visit.
const TILE = 64;
const FEATURE_SIZE = 28;
const MOVE_SPEED = 420;
// Deterministic integer-lattice hash → [0, 1). Any change here changes every
// world; the worker copy in the worker example must stay byte-identical.
function hash2D(seed, x, y) {
    let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) | 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
function valueNoise(seed, x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const n00 = hash2D(seed, x0, y0);
    const n10 = hash2D(seed, x0 + 1, y0);
    const n01 = hash2D(seed, x0, y0 + 1);
    const n11 = hash2D(seed, x0 + 1, y0 + 1);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sy;
}
// 4 octaves, persistence 0.5, lacunarity 2 → result in ~[0, 0.94).
function fbm(seed, x, y) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let octave = 0; octave < 4; octave++) {
        value += amplitude * valueNoise(seed + octave, x * frequency, y * frequency);
        amplitude *= 0.5;
        frequency *= 2;
    }
    return value;
}
// Biome mapping (elevation-style bands; localTileId values are solid
// full-square terrain-center tiles read off mapPack_tilesheet.png — 17
// columns, index = row * 17 + column).
const TILE_DEEP_WATER = 203; // patterned blue  (row 11, col 16)
const TILE_WATER = 186; // plain light blue (row 10, col 16)
const TILE_SAND = 18; // beige center     (row 1, col 1)
const TILE_GRASS = 23; // green center     (row 1, col 6)
const TILE_ROCK = 28; // gray center      (row 1, col 11)
const TILE_SNOW = 86; // white center     (row 5, col 1)
function biomeTileId(value) {
    if (value < 0.34)
        return TILE_DEEP_WATER;
    if (value < 0.42)
        return TILE_WATER;
    if (value < 0.5)
        return TILE_SAND;
    if (value < 0.68)
        return TILE_GRASS;
    if (value < 0.8)
        return TILE_ROCK;
    return TILE_SNOW;
}
const app = new Application({
    canvas: { width: 1280, height: 720, mount: document.body, sizingMode: 'fit' },
    clearColor: new Color(38, 82, 128), // deep-water blue behind unloaded chunks
    extensions: [tilemapExtension],
});
class InfiniteTerrainScene extends Scene {
    camera;
    explorer;
    worldRoot;
    mapView;
    terrain;
    tileset;
    streamer;
    seed = 1337;
    moveX = 0;
    moveY = 0;
    hudTimer = 0;
    hud;
    async init() {
        const tilesTexture = await this.loader.load(Asset.kind('texture', assets.demo.tilesets.map.image));
        this.tileset = new TileSet({
            name: 'biomes',
            texture: new TextureRegion(tilesTexture, { x: 0, y: 0, width: tilesTexture.width, height: tilesTexture.height }),
            tileWidth: TILE,
            tileHeight: TILE,
            tileCount: 204,
            columns: 17,
        });
        // No width/height: the layer (and map) are unbounded — chunks exist
        // only where something writes them.
        this.terrain = new TileLayer({ id: 1, name: 'terrain', tileWidth: TILE, tileHeight: TILE, tilesets: [this.tileset] });
        const map = new TileMap({ name: 'infinite-world', tileWidth: TILE, tileHeight: TILE, tilesets: [this.tileset], layers: [this.terrain] });
        this.mapView = map.createView({ bands: { terrain: ['terrain'] } });
        const characters = new Spritesheet(this.loader.get(assets.demo.spritesheets.platformerCharacters.image), (await this.loader.load(Asset.kind('json', assets.demo.spritesheets.platformerCharacters.data))));
        this.explorer = characters.getFrameSprite('character_green_front').setAnchor(0.5);
        this.explorer.setPosition(0, 0);
        this.explorer.setScale(1.25);
        const actorLayer = new Container();
        actorLayer.addChild(this.explorer);
        this.worldRoot = new Container();
        this.worldRoot.addChild(this.mapView.band('terrain'), actorLayer);
        // Camera follows the explorer — no setBounds: an unbounded map has no
        // edges to clamp the camera to.
        const { width, height } = app.canvas;
        this.camera = new View(this.explorer.x, this.explorer.y, width, height);
        this.camera.follow(this.explorer, { lerp: 0.12 });
        this.rebuildStreamer();
        this.setupInput();
        this.setupHud();
    }
    rebuildStreamer() {
        // destroy() evicts every chunk this streamer loaded; the next update()
        // of the replacement streamer loads the whole initial wanted set
        // unbudgeted, so a seed change repopulates the screen in one frame.
        this.streamer?.destroy();
        const seed = this.seed;
        const source = createSampledChunkSource(this.terrain, {
            sample: (tx, ty) => fbm(seed, tx / FEATURE_SIZE, ty / FEATURE_SIZE),
            mapValueToTile: value => ({ tileset: this.tileset, localTileId: biomeTileId(value), transform: TILE_TRANSFORM_IDENTITY }),
        });
        this.streamer = new ChunkStreamer(this.terrain, source, this.camera);
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
            title: 'Infinite Procedural Terrain',
            controls: [
                { keys: 'WASD', action: 'fly across the endless world' },
                { keys: 'panel', action: 'reroll the seed' },
            ],
            status: '',
            hint: 'The map has no width or height. A ChunkStreamer loads chunks around the camera and evicts the ones you leave behind — revisited terrain is regenerated identically from the seed.',
        });
        const panel = mountControlPanel({ title: 'World' });
        panel.addButton({
            label: 'New seed',
            onClick: () => {
                this.seed = (Math.random() * 0x7fffffff) | 0;
                this.rebuildStreamer();
            },
        });
    }
    update(delta) {
        if (this.moveX !== 0 || this.moveY !== 0) {
            const length = Math.hypot(this.moveX, this.moveY) || 1;
            this.explorer.move((this.moveX / length) * MOVE_SPEED * delta.seconds, (this.moveY / length) * MOVE_SPEED * delta.seconds);
        }
        this.streamer.update();
        this.hudTimer += delta.seconds;
        if (this.hudTimer >= 0.25) {
            this.hudTimer = 0;
            const tx = Math.floor(this.explorer.x / TILE);
            const ty = Math.floor(this.explorer.y / TILE);
            this.hud.setStatus(`${this.streamer.residentCount} chunks resident · tile ${tx}, ${ty} · seed ${this.seed}`);
        }
    }
    draw(context) {
        context.backend.clear();
        context.render(this.worldRoot, { view: this.camera });
    }
}
app.start(new InfiniteTerrainScene());
