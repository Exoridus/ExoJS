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
            fill: 'white',
            fontSie: 25,
            fontFamily: 'AndyBold',
            stroke: 'black',
            strokeThickness: 3,
        });

        this.setOrigin(1, 1);
        this.setPosition(viewportWidth - 10, viewportHeight);
    }
}
