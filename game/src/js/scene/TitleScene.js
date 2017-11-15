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
        this._background = new Sprite(resources.get('texture', 'title/background'));

        /**
         * @private
         * @member {Music}
         */
        this._titleMusic = resources.get('music', 'title');
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
            .render(this._background)
            .render(this._menuManager)
            .end();
    }

    /**
     * @override
     */
    unload() {
        this._menuManager.destroy();
        this._menuManager = null;

        this._background.destroy();
        this._background = null;

        this._titleMusic.destroy();
        this._titleMusic = null;
    }
}
