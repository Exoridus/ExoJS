import MapGenerator from './MapGenerator';

const clamp = Exo.utils.clamp;

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
        this._width = 256;

        /**
         * @private
         * @member {Number}
         */
        this._height = 256;

        /**
         * @private
         * @member {Number}
         */
        this._tileSize = 64;

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
        this._mapData = this._mapGenerator.generate(this._width, this._height);

        /**
         * @private
         * @member {Sprite}
         */
        this._tile = new Exo.Sprite(tileset.texture);
        this._tile.width = this._tileSize;
        this._tile.height = this._tileSize;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get pixelWidth() {
        return this._width * this._tileSize;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get pixelHeight() {
        return this._height * this._tileSize;
    }

    /**
     * @public
     * @param {Application} app
     * @param {View} camera
     */
    render(app, camera) {
        const displayManager = app.displayManager,
            width = this._width,
            height = this._height,
            mapData = this._mapData,
            tileset = this._tileset,
            tileSize = this._tileSize,
            tile = this._tile,
            tilesHorizontal = ((camera.width / tileSize) + 2) | 0,
            tilesVertical = ((camera.height / tileSize) + 2) | 0,
            startTileX = clamp(camera.left / tileSize, 0, width - tilesHorizontal) | 0,
            startTileY = clamp(camera.top / tileSize, 0, height - tilesVertical) | 0,
            startTileIndex = (startTileY * width) + startTileX,
            tilesTotal = tilesHorizontal * tilesVertical;

        displayManager.begin();

        for (let i = 0; i < tilesTotal; i++) {
            const x = (i % tilesHorizontal) | 0,
                y = (i / tilesHorizontal) | 0,
                index = startTileIndex + ((y * width) + x);

            tileset.setBlock(tile, mapData[index]);

            tile.x = (startTileX + x) * tileSize;
            tile.y = (startTileY + y) * tileSize;

            tile.render(displayManager);
        }

        displayManager.end();
    }
}
