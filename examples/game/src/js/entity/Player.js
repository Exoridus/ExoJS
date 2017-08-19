const FACE_DIRECTION = {
        UP: 0,
        RIGHT: 1,
        DOWN: 2,
        LEFT: 3,
    },
    playerWidth = 96,
    playerHeight = 96;

/**
 * @class Player
 * @extends {Exo.Sprite}
 */
export default class Player extends Exo.Sprite {

    /**
     * @constructor
     * @param {Exo.Texture} texture
     */
    constructor(texture) {
        super(texture);

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
         * @member {Exo.Rectangle}
         */
        this._frame = new Exo.Rectangle(0, 0, playerWidth, playerHeight);

        /**
         * @private
         * @member {Exo.FrameAnimation}
         */
        this._frameAnimation = new Exo.FrameAnimation();

        this.setOrigin(0.5, 1);
        this.setPosition(640, 320);
        this._setFaceDirection(FACE_DIRECTION.DOWN);
    }

    /**
     * @override
     */
    move(x, y) {
        const speed = this._running ? this._runningSpeed : this._speed,
            mag = Math.sqrt((x * x) + (y * y));

        this.setPosition(
            this.x + ((mag > 1 ? (x / mag) : x) * speed),
            this.y + ((mag > 1 ? (y / mag) : y) * speed)
        );

        if (x > 0) {
            this._setFaceDirection(FACE_DIRECTION.RIGHT);
        } else if (x < 0) {
            this._setFaceDirection(FACE_DIRECTION.LEFT);
        }

        if (y > 0.5) {
            this._setFaceDirection(FACE_DIRECTION.DOWN);
        } else if (y < -0.5) {
            this._setFaceDirection(FACE_DIRECTION.UP);
        }
    }

    /**
     * @private
     * @param {Number} direction
     */
    _setFaceDirection(direction) {
        this._frame.x = direction * playerWidth;
        this._frame.y = 0;

        this.setTextureRect(this._frame);
    }
}
