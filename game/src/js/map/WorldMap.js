import { utils, Size, Sprite, Rectangle } from 'exojs';
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
         * @member {Number}
         */
        this._tilesX = 256;

        /**
         * @private
         * @member {Number}
         */
        this._tilesY = 256;

        /**
         * @private
         * @member {Size}
         */
        this._tileSize = new Size(64, 64);

        /**
         * @private
         * @member {Tileset}
         */
        this._tileset = tileset;

        /**
         * @private
         * @member {MapGenerator}
         */
        this._mapGenerator = new MapGenerator();

        /**
         * @private
         * @member {Number[]}
         */
        this._mapData = this._mapGenerator.generate(this._tilesX, this._tilesY);

        /**
         * @private
         * @member {Sprite}
         */
        this._tile = new Sprite(tileset.texture);
        this._tile.width = this._tileSize.width;
        this._tile.height = this._tileSize.height;

        /**
         * @private
         * @member {Rectangle}
         */
        this._bounds = new Rectangle(0, 0, (this._tilesX * this._tileSize.width), (this._tilesY * this._tileSize.height));
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
     * @param {DisplayManager} displayManager
     */
    render(displayManager) {
        const camera = displayManager.view,
            mapData = this._mapData,
            tilesX = this._tilesX,
            tilesY = this._tilesY,
            tile = this._tile,
            tileset = this._tileset,
            tileWidth = this._tileSize.width,
            tileHeight = this._tileSize.height,
            tilesHorizontal = ((camera.width / tileWidth) + 2) | 0,
            tilesVertical = ((camera.height / tileHeight) + 2) | 0,
            startTileX = utils.clamp(camera.left / tileWidth, 0, tilesX - tilesHorizontal) | 0,
            startTileY = utils.clamp(camera.top / tileHeight, 0, tilesY - tilesVertical) | 0,
            startTileIndex = (startTileY * tilesX) + startTileX,
            tilesTotal = tilesHorizontal * tilesVertical;

        for (let i = 0; i < tilesTotal; i++) {
            const x = (i % tilesHorizontal) | 0,
                y = (i / tilesHorizontal) | 0,
                index = startTileIndex + ((y * tilesX) + x);

            tileset.setBlock(tile, mapData[index]);

            tile.x = (startTileX + x) * tileWidth;
            tile.y = (startTileY + y) * tileHeight;

            tile.render(displayManager);
        }
    }
}
