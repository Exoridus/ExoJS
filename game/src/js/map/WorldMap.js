import { clamp, Size, Sprite, Rectangle, Vector } from 'exojs';
import MapGenerator from './MapGenerator';

/**
 * @class WorldMap
 */
export default class WorldMap {

    /**
     * @constructor
     * @param {Tileset} tileset
     */
    constructor(tileset) {

        /**
         * @private
         * @member {Tileset}
         */
        this._tileset = tileset;

        /**
         * @private
         * @member {Size}
         */
        this._tileSize = new Size(64, 64);

        /**
         * @private
         * @member {Vector}
         */
        this._tileCount = new Vector(256, 256);

        /**
         * @private
         * @member {Sprite}
         */
        this._tile = new Sprite(tileset.texture);
        this._tile.width = this._tileSize.width;
        this._tile.height = this._tileSize.height;

        /**
         * @private
         * @member {MapGenerator}
         */
        this._mapGenerator = new MapGenerator();

        /**
         * @private
         * @member {Number[]}
         */
        this._mapData = this._mapGenerator.generate(this._tileCount.x, this._tileCount.y);

        /**
         * @private
         * @member {Rectangle}
         */
        this._bounds = new Rectangle(0, 0, (this._tileCount.x * this._tileSize.width), (this._tileCount.y * this._tileSize.height));
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get bounds() {
        return this._bounds;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get width() {
        return this._bounds.width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get height() {
        return this._bounds.height;
    }

    /**
     * @public
     * @param {Time} delta
     */
    update(delta) {

    }

    /**
     * @public
     * @param {RenderManager} renderManager
     */
    render(renderManager) {
        const camera = renderManager.renderTarget.view,
            viewport = camera.getBounds(),
            mapData = this._mapData,
            tile = this._tile,
            tileset = this._tileset,
            tilesX = this._tileCount.x,
            tilesY = this._tileCount.y,
            tileWidth = this._tileSize.width,
            tileHeight = this._tileSize.height,
            tilesHorizontal = ((viewport.width / tileWidth) + 2) | 0,
            tilesVertical = ((viewport.height / tileHeight) + 2) | 0,
            startTileX = clamp(viewport.x / tileWidth, 0, tilesX - tilesHorizontal) | 0,
            startTileY = clamp(viewport.y / tileHeight, 0, tilesY - tilesVertical) | 0,
            startTileIndex = (startTileY * tilesX) + startTileX,
            tilesTotal = tilesHorizontal * tilesVertical;

        for (let i = 0; i < tilesTotal; i++) {
            const x = (i % tilesHorizontal) | 0,
                y = (i / tilesHorizontal) | 0,
                index = startTileIndex + ((y * tilesX) + x);

            tileset.setBlock(tile, mapData[index]);

            tile.x = (startTileX + x) * tileWidth;
            tile.y = (startTileY + y) * tileHeight;

            tile.render(renderManager);
        }
    }
}
