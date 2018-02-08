import AutoTile from './AutoTile';

/**
 * @class Tileset
 */
export default class Tileset {

    /**
     * @constructor
     * @param {Texture} texture
     * @param {Number} tileSize
     */
    constructor(texture, tileSize) {

        /**
         * @private
         * @member {Texture}
         */
        this._texture = texture;

        /**
         * @private
         * @member {Number}
         */
        this._tileSize = tileSize;

        /**
         * @private
         * @member {Object}
         */
        this._tiles = {
            water: new AutoTile(5, 1, tileSize),
            sand: new AutoTile(0, 1, tileSize),
            grass: new AutoTile(0, 0, tileSize),
            forest: new AutoTile(2, 0, tileSize),
            dirt: new AutoTile(1, 0, tileSize),
            stone: new AutoTile(3, 0, tileSize),
        };

        /**
         * @private
         * @member {Number}
         */
        this._waterLevel = 70;

        /**
         * @private
         * @member {Number}
         */
        this._sandLevel = 95;

        /**
         * @private
         * @member {Number}
         */
        this._grassLevel = 130;

        /**
         * @private
         * @member {Number}
         */
        this._forestLevel = 150;

        /**
         * @private
         * @member {Number}
         */
        this._dirtLevel = 170;
    }

    /**
     * @public
     * @member {Texture}
     */
    get texture() {
        return this._texture;
    }

    /**
     * @public
     * @param {Sprite} tile
     * @param {Number} level
     */
    setBlock(tile, level) {
        let block,
            tint;

        if (level <= this._waterLevel) {
            block = 'water';
            tint = 255 + level - this._waterLevel;
        } else if (level <= this._sandLevel) {
            block = 'sand';
            tint = 255 - level + this._waterLevel;
        } else if (level <= this._grassLevel) {
            block = 'grass';
            tint = 255 - level + this._sandLevel;
        } else if (level <= this._forestLevel) {
            block = 'forest';
            tint = 255 - level + this._grassLevel;
        } else if (level <= this._dirtLevel) {
            block = 'dirt';
            tint = 255 - level + this._forestLevel;
        } else {
            block = 'stone';
            tint = 255 - level + this._dirtLevel;
        }

        tint = tint | 0;
        tile.tint.set(tint, tint, tint);

        if (block in this._tiles) {
            tile.setTextureFrame(this._tiles[block].tileRect, false);
        }
    }
}
