/**
 * @class Player
 * @extends {Sprite}
 */
export default class Player extends Exo.Sprite {

    /**
     * @constructor
     * @param {Texture} texture
     */
    constructor(texture) {
        super(texture);

        const width = 96,
            height = 96;

        /**
         * @private
         * @member {Number}
         */
        this._speed = 2;

        /**
         * @private
         * @member {Number}
         */
        this._runningSpeed = 5;

        /**
         * @private
         * @member {Boolean}
         */
        this._running = false;

        /**
         * @private
         * @member {Object<String, Rectangle>}
         */
        this._frames = {
            FACE_UP: new Exo.Rectangle(0, 0, width, height),
            FACE_RIGHT: new Exo.Rectangle(width, 0, width, height),
            FACE_DOWN: new Exo.Rectangle(width * 2, 0, width, height),
            FACE_LEFT: new Exo.Rectangle(width * 3, 0, width, height),
        };

        this.setTextureFrame(this._frames.FACE_DOWN);
        this.setOrigin(0.5, 1);
    }

    /**
     * @public
     * @member {Boolean}
     */
    get running() {
        return running;
    }

    set running(running) {
        this._running = running;
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     */
    move(x, y) {
        const speed = this._running ? this._runningSpeed : this._speed,
            mag = Math.sqrt((x * x) + (y * y)),
            offsetX = mag > 1 ? (x / mag) : x,
            offsetY = mag > 1 ? (y / mag) : y;

        this.translate(offsetX * speed, offsetY * speed);

        if (x > 0) {
            this.setTextureFrame(this._frames.FACE_RIGHT);
        } else if (x < 0) {
            this.setTextureFrame(this._frames.FACE_LEFT);
        }

        if (y > 0.5) {
            this.setTextureFrame(this._frames.FACE_DOWN);
        } else if (y < -0.5) {
            this.setTextureFrame(this._frames.FACE_UP);
        }
    }
}
