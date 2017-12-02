import MenuManager from '../MenuManager';
import MainMenu from './MainMenu';
import NewGameMenu from './NewGameMenu';
import LoadGameMenu from './LoadGameMenu';
import SettingsMenu from './SettingsMenu';

/**
 * @class TitleMenuManager
 * @extends {MenuManager}
 */
export default class TitleMenuManager extends MenuManager {

    /**
     * @constructor
     * @param {Application} app
     */
    constructor(app) {
        super(app);

        this.addMenu('main', new MainMenu(app))
            .addMenu('newGame', new NewGameMenu(app, 'main'))
            .addMenu('loadGame', new LoadGameMenu(app, 'main'))
            .addMenu('settings', new SettingsMenu(app, 'main'));
    }
}
