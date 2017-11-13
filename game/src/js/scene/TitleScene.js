import { Scene, Sprite } from 'exojs';
import TitleMenuManager from '../menu/title/TitleMenuManager';

/**
 * @class TitleScene
 * @extends {Scene}
 */
export default class TitleScene extends Scene {

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {

        /**
         * @private
         * @member {TitleMenuManager}
         */
        this._menuManager = new TitleMenuManager(this.app);
        this._menuManager.enable('main');

        /**
         * @private
         * @member {Sprite}
         */
        this._titleBackground = new Sprite(resources.get('texture', 'title/background'));

        /**
         * @private
         * @member {Music}
         */
        this._titleMusic = resources.get('music', 'title/background');
        this._titleMusic.connect(this.app.mediaManager);
        this._titleMusic.play({ loop: true });
    }

    /**
     * @override
     */
    update(delta) {
        this._menuManager.update(delta);

        this.app.displayManager
            .begin()
            .draw(this._titleBackground)
            .draw(this._menuManager)
            .end();
    }

    /**
     * @override
     */
    unload() {
        this._menuManager.destroy();
        this._menuManager = null;

        this._titleBackground.destroy();
        this._titleBackground = null;

        this._titleMusic.destroy();
        this._titleMusic = null;
    }
}
