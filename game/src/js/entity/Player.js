const KEYBOARD = Exo.KEYBOARD,
    GAMEPAD = Exo.GAMEPAD,
    utils = Exo.utils,

    /**
     * @inner
     * @member {Object<String, Number>}
     */
    DIRECTION = {
        UP: 0,
        RIGHT: 1,
        DOWN: 2,
        LEFT: 3,
    },

    /**
     * @inner
     * @member {Object<String, Number>}
     */
    FLAGS = {
        NONE: 0,
        DIRTY_FRAME: 1 << 0,
    };

/**
 * @class Player
 * @extends {Sprite}
 */
export default class Player extends Exo.Sprite {

    /**
     * @constructor
     * @param {Application} app
     * @param {Object} options
     * @param {Vector} options.spawnPoint
     * @param {Rectangle} options.worldBounds
     */
    constructor(app, {
        spawnPoint = new Exo.Vector(),
        worldBounds = new Exo.Rectangle(),
    }) {
        super(app.loader.resources.get('texture', 'game/player'));

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

        /**
         * @private
         * @member {Rectangle}
         */
        this._worldBounds = worldBounds.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._spawnPoint = spawnPoint.clone();

        /**
         * @private
         * @member {Boolean}
         */
        this._moving = false;

        /**
         * @private
         * @member {Number}
         */
        this._direction = DIRECTION.DOWN;

        /**
         * @private
         * @member {Vector}
         */
        this._velocity = new Exo.Vector();

        /**
         * @private
         * @member {Size}
         */
        this._frameSize = new Exo.Size(96, 96);

        /**
         * @private
         * @member {Number}
         */
        this._frameIndex = 0;

        /**
         * @private
         * @member {Number}
         */
        this._frameCount = 8;

        /**
         * @private
         * @member {Timer}
         */
        this._frameTimer = new Exo.Timer(false, 100);

        /**
         * @private
         * @member {Rectangle}
         */
        this._frame = new Exo.Rectangle(
            this._direction * this._frameSize.width,
            this._frameIndex * this._frameSize.height,
            this._frameSize.width,
            this._frameSize.height
        );

        /**
         * @private
         * @member {Number}
         */
        this._walkingSpeed = 192;

        /**
         * @private
         * @member {Number}
         */
        this._runningSpeed = 256;

        /**
         * @private
         * @member {Number}
         */
        this._speed = this._walkingSpeed;

        /**
         * @private
         * @member {Number}
         */
        this._flags = FLAGS.NONE;

        this._addInputs();
        this._updateFrame();
        this.setOrigin(0.5, 1);
        this.setPosition(this._spawnPoint.x, this._spawnPoint.y);
    }

    /**
     * @public
     * @param {Time} delta
     */
    update(delta) {
        this._updatePosition(delta);

        if (utils.hasFlag(FLAGS.DIRTY_FRAME, this._flags)) {
            this._updateFrame();

            this._flags = utils.removeFlag(FLAGS.DIRTY_FRAME, this._flags);
        }

        return this;
    }

    /**
     * @override
     */
    setPosition(x, y) {
        this.position.set(
            utils.clamp(x, this._worldBounds.left, this._worldBounds.right),
            utils.clamp(y, this._worldBounds.top, this._worldBounds.bottom)
        );

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._removeInputs();

        this._worldBounds.destroy();
        this._worldBounds = null;

        this._spawnPoint.destroy();
        this._spawnPoint = null;

        this._frameSize.destroy();
        this._frameSize = null;

        this._frame.destroy();
        this._frame = null;

        this._frameTimer.destroy();
        this._frameTimer = null;

        this._frameIndex = null;
        this._frameCount = null;
        this._direction = null;
        this._moving = null;
        this._speed = null;
        this._app = null;
    }

    /**
     * @private
     * @param {Number} direction
     */
    _setDirection(direction) {
        if (this._direction !== direction) {
            this._direction = direction;
            this._flags = utils.addFlag(FLAGS.DIRTY_FRAME, this._flags);
        }

        return this;
    }

    /**
     * @private
     */
    _updateDirection() {
        const { x, y } = this._velocity;

        if (x > 0) {
            this._setDirection(DIRECTION.RIGHT);
        } else if (x < 0) {
            this._setDirection(DIRECTION.LEFT);
        }

        if (y > 0.5) {
            this._setDirection(DIRECTION.DOWN);
        } else if (y < -0.5) {
            this._setDirection(DIRECTION.UP);
        }

        return this;
    }

    /**
     * @private
     */
    _updateFrameIndex() {
        if (this._moving && this._frameTimer.isExpired) {
            this._frameTimer.restart();
            this._setFrameIndex(this._frameIndex + 1);
        }

        return this;
    }

    /**
     * @private
     * @param {Number} index
     */
    _setFrameIndex(index) {
        const frameIndex = (index % this._frameCount);

        if (this._frameIndex !== frameIndex) {
            this._frameIndex = frameIndex;
            this._flags = utils.addFlag(FLAGS.DIRTY_FRAME, this._flags);
        }

        return this;
    }

    /**
     * @private
     * @param {Time} delta
     */
    _updatePosition(delta) {
        const mag = this._velocity.magnitude;

        if (mag > 0) {
            const distance = (this._speed * delta.seconds),
                velX = this._velocity.x,
                velY = this._velocity.y,
                offsetX = (mag > 1 ? (velX / mag) : velX) * distance,
                offsetY = (mag > 1 ? (velY / mag) : velY) * distance;

            this.translate(offsetX, offsetY);
            this._updateDirection();

            if (!this._moving) {
                this._moving = true;
                this._frameTimer.restart();
                this._setFrameIndex(1);
            }

            this.trigger('move', this.x, this.y, this);
        } else if (this._moving) {
            this._moving = false;
            this._frameTimer.stop();
            this._setFrameIndex(0);
        }

        this._updateFrameIndex();

        this._velocity.set(0, 0);

        return this;
    }

    /**
     * @private
     */
    _updateFrame() {
        this.setTextureFrame(this._frame.setPosition(
            this._direction * this._frameSize.width,
            this._frameIndex * this._frameSize.height
        ));

        return this;
    }

    /**
     * @private
     */
    _addInputs() {
        this._moveUpInput = new Exo.Input([
            KEYBOARD.Up,
            KEYBOARD.W,
            GAMEPAD.LeftStickUp,
            GAMEPAD.DPadUp,
        ], {
            context: this,
            active(value) {
                this._velocity.add(0, value * -1);
            },
        });

        this._moveDownInput = new Exo.Input([
            KEYBOARD.Down,
            KEYBOARD.S,
            GAMEPAD.LeftStickDown,
            GAMEPAD.DPadDown,
        ], {
            context: this,
            active(value) {
                this._velocity.add(0, value);
            },
        });

        this._moveLeftInput = new Exo.Input([
            KEYBOARD.Left,
            KEYBOARD.A,
            GAMEPAD.LeftStickLeft,
            GAMEPAD.DPadLeft,
        ], {
            context: this,
            active(value) {
                this._velocity.add(value * -1, 0);
            },
        });

        this._moveRightInput = new Exo.Input([
            KEYBOARD.Right,
            KEYBOARD.D,
            GAMEPAD.LeftStickRight,
            GAMEPAD.DPadRight,
        ], {
            context: this,
            active(value) {
                this._velocity.add(value, 0);
            },
        });

        this._toggleRunInput = new Exo.Input([
            KEYBOARD.Shift,
            GAMEPAD.FaceLeft,
        ], {
            context: this,
            start() {
                this._speed = this._runningSpeed;
            },
            stop() {
                this._speed = this._walkingSpeed;
            }
        });

        this._app.inputManager.add([
            this._moveUpInput,
            this._moveDownInput,
            this._moveLeftInput,
            this._moveRightInput,
            this._toggleRunInput,
        ]);
    }

    /**
     * @private
     */
    _removeInputs() {
        this.app.inputManager.remove([
            this._moveUpInput,
            this._moveDownInput,
            this._moveLeftInput,
            this._moveRightInput,
            this._toggleRunInput,
        ]);

        this._moveUpInput.destroy();
        this._moveUpInput = null;

        this._moveDownInput.destroy();
        this._moveDownInput = null;

        this._moveLeftInput.destroy();
        this._moveLeftInput = null;

        this._moveRightInput.destroy();
        this._moveRightInput = null;

        this._toggleRunInput.destroy();
        this._toggleRunInput = null;
    }
}
