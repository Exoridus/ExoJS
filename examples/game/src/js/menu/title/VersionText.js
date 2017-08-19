/**
 * @class VersionText
 * @extends {Exo.Text}
 */
export default class VersionText extends Exo.Text {

    /**
     * @constructor
     * @param {String} text
     * @param {Number} viewportWidth
     * @param {Number} viewportHeight
     */
    constructor(text, viewportWidth, viewportHeight) {
        super(text, {
            color: 'white',
            fontSie: 25,
            fontFamily: 'AndyBold',
            outlineColor: 'black',
            outlineWidth: 3,
        }, Exo.ScaleModes.Linear);

        this.setOrigin(1, 1);
        this.setPosition(viewportWidth - 10, viewportHeight);
    }
}
