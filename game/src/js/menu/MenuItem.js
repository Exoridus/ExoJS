/**
 * @class MenuItem
 * @extends {Exo.Text}
 */
export default class MenuItem extends Exo.Text {

    /**
     * @constructor
     * @param {String} text
     * @param {MenuItem} [previousItem=null]
     */
    constructor(text, previousItem = null) {
        super(text, {
            color: 'white',
            fontSize: 45,
            fontFamily: 'AndyBold',
            outlineColor: 'black',
            outlineWidth: 5,
        }, Exo.SCALE_MODE.LINEAR);

        /**
         * @private
         * @member {Number}
         */
        this._ticker = 0;

        /**
         * @private
         * @member {Number}
         */
        this._scalingFactor = 1.2;

        /**
         * @private
         * @member {Number}
         */
        this._scalingSpeed = 2;

        this.setOrigin(0.5, 0.5);

        if (previousItem) {
            this.setPosition(previousItem.x, previousItem.bottom + (this.height * this._scalingFactor / 2));
        }
    }

    /**
     * @public
     */
    activate() {
        this.tint = Exo.Color.Yellow;
        this._ticker = 0;
    }

    /**
     * @public
     * @param {Exo.Time} delta
     */
    update(delta) {
        const time = this._ticker * this._scalingSpeed,
            scalingCenter = (this._scalingFactor - 1) / 2,
            scale = 1 + (Math.sin(time * Math.PI) * scalingCenter) + scalingCenter;

        this.setScale(scale, scale);
        this._ticker += delta.asSeconds();
    }

    /**
     * @public
     */
    reset() {
        this.tint = Exo.Color.White;
        this.setScale(1, 1);
        this._ticker = 0;
    }
}
