/**
 * @class MenuItem
 * @extends {Text}
 */
export default class MenuItem extends Exo.Text {

    /**
     * @constructor
     * @param {String} text
     * @param {MenuItem} [previousItem]
     */
    constructor(text, previousItem) {
        super(text, {
            fill: 'white',
            fontSize: 45,
            fontFamily: 'AndyBold',
            stroke: 'black',
            strokeThickness: 5,
        });

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
     * @param {Time} delta
     */
    update(delta) {
        const time = this._ticker * this._scalingSpeed,
            scalingCenter = (this._scalingFactor - 1) / 2,
            scale = 1 + (Math.sin(time * Math.PI) * scalingCenter) + scalingCenter;

        this.setScale(scale, scale);
        this._ticker += delta.seconds;
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
