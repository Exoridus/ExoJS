import { Application, Asset, Color, Container, Keyboard, type RenderingContext, Scene, Sprite, Spritesheet, type SpritesheetData, TextureRegion, type Time, View } from '@codexo/exojs';
import { ChunkStreamer, type ChunkSource, createSampledChunkSource, createWorkerSampledChunkSource, TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension, TileSet, type TileMapView } from '@codexo/exojs-tilemap';
import { mountControlPanel, mountControls } from '@examples/runtime';

// The same infinite, procedurally generated world as "Infinite Procedural
// Terrain", but the noise sampling can run off the main thread via
// createWorkerSampledChunkSource. Toggle "Provider" between sync/worker and
// raise "Sample cost" to make each tile artificially expensive to sample —
// on the sync path the main thread stalls and the spinning marker + camera
// motion visibly hitch; on the worker path they stay smooth.

const TILE = 64;
const FEATURE_SIZE = 28;
const MOVE_SPEED = 420;

// Deterministic integer-lattice hash → [0, 1). Any change here changes every
// world; the worker copy built below must stay byte-identical.
function hash2D(seed: number, x: number, y: number): number {
    let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) | 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function valueNoise(seed: number, x: number, y: number): number {
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
function fbm(seed: number, x: number, y: number): number {
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
const TILE_WATER = 186;      // plain light blue (row 10, col 16)
const TILE_SAND = 18;        // beige center     (row 1, col 1)
const TILE_GRASS = 23;       // green center     (row 1, col 6)
const TILE_ROCK = 28;        // gray center      (row 1, col 11)
const TILE_SNOW = 86;        // white center     (row 5, col 1)

function biomeTileId(value: number): number {
    if (value < 0.34) return TILE_DEEP_WATER;
    if (value < 0.42) return TILE_WATER;
    if (value < 0.5) return TILE_SAND;
    if (value < 0.68) return TILE_GRASS;
    if (value < 0.8) return TILE_ROCK;
    return TILE_SNOW;
}

// The worker must carry its own copy of the noise code: a Blob-URL worker
// shares no scope with this module — nothing declared above exists inside
// it, which is exactly why createWorkerSampledChunkSource takes a source
// string instead of a live function. The functions below are a plain-JS
// transcription of hash2D/valueNoise/fbm above (annotations stripped only;
// the string is never type-checked) and must stay byte-identical to them —
// otherwise the worker and sync providers would render different worlds
// for the same seed. Seed and cost are baked in at build time, so changing
// either rebuilds the provider from scratch.
function buildWorkerSource(seed: number, extraCost: number): string {
    return `
"use strict";

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

const SEED = ${seed};
const FEATURE_SIZE = ${FEATURE_SIZE};
const EXTRA_COST = ${extraCost};

self.onmessage = (event) => {
    const { requestId, cx, cy, chunkWidth, chunkHeight } = event.data;
    try {
        const values = new Float64Array(chunkWidth * chunkHeight);
        for (let localTy = 0; localTy < chunkHeight; localTy++) {
            for (let localTx = 0; localTx < chunkWidth; localTx++) {
                const tx = cx * chunkWidth + localTx;
                const ty = cy * chunkHeight + localTy;
                let value = fbm(SEED, tx / FEATURE_SIZE, ty / FEATURE_SIZE);
                // Burns deterministic CPU to simulate an expensive sampler —
                // the recomputed value is discarded except for the last pass.
                for (let i = 0; i < EXTRA_COST; i++) {
                    value = fbm(SEED, tx / FEATURE_SIZE, ty / FEATURE_SIZE);
                }
                values[localTy * chunkWidth + localTx] = value;
            }
        }
        // Exactly one reply per request, transferring the buffer for a
        // zero-copy handoff back to the main thread.
        self.postMessage({ requestId, values }, [values.buffer]);
    } catch (error) {
        // Still exactly one reply — the error branch must also answer, or
        // ChunkStreamer treats this chunk as forever in flight (no timeout).
        self.postMessage({ requestId, error: String(error) });
    }
};
`;
}

const app = new Application({
    canvas: { width: 1280, height: 720, mount: document.body, sizingMode: 'fit' },
    clearColor: new Color(38, 82, 128), // deep-water blue behind unloaded chunks
    extensions: [tilemapExtension],
});

class WorkerStreamedTerrainScene extends Scene {
    private camera!: View;
    private explorer!: Sprite;
    private marker!: Sprite;
    private worldRoot!: Container;
    private mapView!: TileMapView;
    private terrain!: TileLayer;
    private tileset!: TileSet;
    private streamer!: ChunkStreamer;
    private seed = 1337;
    private providerMode: 'worker' | 'sync' = 'worker';
    private extraCost = 200;
    private workerSourceHandle: (ChunkSource & { destroy(): void }) | null = null;
    private moveX = 0;
    private moveY = 0;
    private hudTimer = 0;
    private frameMs = 0;
    private hud!: ReturnType<typeof mountControls>;

    override async init(): Promise<void> {
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

        const characters = new Spritesheet(
            await this.loader.load(Asset.kind('texture', assets.demo.spritesheets.platformerCharacters.image)),
            (await this.loader.load(Asset.kind('json', assets.demo.spritesheets.platformerCharacters.data))) as SpritesheetData,
        );

        this.explorer = characters.getFrameSprite('character_green_front').setAnchor(0.5);
        this.explorer.setPosition(0, 0);
        this.explorer.setScale(1.25);

        // Jank indicator: this sprite spins at a constant rate every frame
        // regardless of provider mode — any hitch on the main thread (the
        // sync provider under a high sample cost) is immediately visible as
        // a stutter in its rotation.
        this.marker = characters.getFrameSprite('character_beige_front').setAnchor(0.5);
        this.marker.setScale(0.75);
        this.marker.setPosition(96, -96);

        const actorLayer = new Container();
        actorLayer.addChild(this.explorer, this.marker);

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

    private rebuildStreamer(): void {
        // destroy() evicts every chunk this streamer loaded; the next
        // update() of the replacement streamer loads the whole initial
        // wanted set unbudgeted, so a mode/cost/seed change repopulates the
        // screen in one frame.
        this.streamer?.destroy();
        // Terminate the previous Worker on every rebuild — it leaks
        // otherwise, since createWorkerSampledChunkSource has no lifecycle
        // hook of its own beyond the destroy() it returns.
        this.workerSourceHandle?.destroy();
        this.workerSourceHandle = null;

        const seed = this.seed;
        const cost = this.extraCost;
        if (this.providerMode === 'worker') {
            this.workerSourceHandle = createWorkerSampledChunkSource(this.terrain, {
                workerSource: buildWorkerSource(seed, cost),
                mapValueToTile: value => ({ tileset: this.tileset, localTileId: biomeTileId(value), transform: TILE_TRANSFORM_IDENTITY }),
            });
            this.streamer = new ChunkStreamer(this.terrain, this.workerSourceHandle, this.camera);
        } else {
            const source = createSampledChunkSource(this.terrain, {
                sample: (tx, ty) => {
                    let value = fbm(seed, tx / FEATURE_SIZE, ty / FEATURE_SIZE);
                    for (let i = 0; i < cost; i++) {
                        value = fbm(seed, tx / FEATURE_SIZE, ty / FEATURE_SIZE);
                    }
                    return value;
                },
                mapValueToTile: value => ({ tileset: this.tileset, localTileId: biomeTileId(value), transform: TILE_TRANSFORM_IDENTITY }),
            });
            this.streamer = new ChunkStreamer(this.terrain, source, this.camera);
        }
    }

    private setupInput(): void {
        this.inputs.onActive(Keyboard.A, () => (this.moveX = -1));
        this.inputs.onStop(Keyboard.A, () => {
            if (this.moveX < 0) this.moveX = 0;
        });
        this.inputs.onActive(Keyboard.D, () => (this.moveX = 1));
        this.inputs.onStop(Keyboard.D, () => {
            if (this.moveX > 0) this.moveX = 0;
        });
        this.inputs.onActive(Keyboard.W, () => (this.moveY = -1));
        this.inputs.onStop(Keyboard.W, () => {
            if (this.moveY < 0) this.moveY = 0;
        });
        this.inputs.onActive(Keyboard.S, () => (this.moveY = 1));
        this.inputs.onStop(Keyboard.S, () => {
            if (this.moveY > 0) this.moveY = 0;
        });
    }

    private setupHud(): void {
        this.hud = mountControls({
            title: 'Worker-Streamed Terrain',
            controls: [
                { keys: 'WASD', action: 'fly across the endless world' },
                { keys: 'panel', action: 'switch provider / raise sample cost' },
            ],
            status: '',
            hint: 'createWorkerSampledChunkSource runs the noise sampler on a Worker thread; createSampledChunkSource runs it on the main thread. Raise the sample cost and switch providers to see which one keeps the frame time flat.',
        });
        const panel = mountControlPanel({ title: 'Provider' });
        panel.addCycle({
            label: 'Provider',
            options: ['worker', 'sync'],
            index: 0,
            onChange: (_, mode) => {
                this.providerMode = mode as 'worker' | 'sync';
                this.rebuildStreamer();
            },
        });
        panel.addSlider({
            label: 'Sample cost',
            min: 0,
            max: 500,
            step: 50,
            value: 200,
            onChange: value => {
                this.extraCost = value;
                this.rebuildStreamer();
            },
        });
    }

    override update(delta: Time): void {
        if (this.moveX !== 0 || this.moveY !== 0) {
            const length = Math.hypot(this.moveX, this.moveY) || 1;

            this.explorer.move((this.moveX / length) * MOVE_SPEED * delta.seconds, (this.moveY / length) * MOVE_SPEED * delta.seconds);
        }

        this.marker.rotation += 2 * delta.seconds;

        this.streamer.update();

        // Exponential moving average smooths out single-frame noise so the
        // readout reflects sustained jank rather than every GC blip.
        this.frameMs = this.frameMs * 0.9 + delta.milliseconds * 0.1;

        this.hudTimer += delta.seconds;
        if (this.hudTimer >= 0.25) {
            this.hudTimer = 0;
            const tx = Math.floor(this.explorer.x / TILE);
            const ty = Math.floor(this.explorer.y / TILE);
            this.hud.setStatus(
                `${this.providerMode} · ${this.frameMs.toFixed(1)} ms/frame · ${this.streamer.residentCount} chunks · tile ${tx}, ${ty} · cost ${this.extraCost}`,
            );
        }
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.worldRoot, { view: this.camera });
    }
}

app.start(new WorkerStreamedTerrainScene());
