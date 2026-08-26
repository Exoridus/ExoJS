import { Application, Button, FadeSceneTransition, Scene } from '@codexo/exojs';

// #region guide:menu-buttons
class MainMenuScene extends Scene {}

const app = new Application({ scenes: { MainMenuScene } });
const resumeButton = new Button({ label: 'Resume' });
const mainMenuButton = new Button({ label: 'Main menu' });

resumeButton.onClick.add(() => app.scenes.resume());
mainMenuButton.onClick.add(() => {
  void app.scenes.change(MainMenuScene, { transition: new FadeSceneTransition() });
});
// #endregion guide:menu-buttons
