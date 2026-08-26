import { ActionMap, BindingProfile, ButtonAction, Keyboard, Scene } from '@codexo/exojs';

// #region guide:binding-profile
class RebindScene extends Scene {
  controls = new ActionMap({
    jump: new ButtonAction(Keyboard.Space),
    crouch: new ButtonAction(Keyboard.ControlLeft),
  });

  override init(): void {
    this.inputs.attach(this.controls);

    const saved = localStorage.getItem('bindings');

    if (saved !== null) {
      this.controls.applyProfile(BindingProfile.fromJSON(JSON.parse(saved)));
    }
  }

  rebindJump(key: Keyboard): void {
    this.controls.rebind('jump', key);

    const profile = new BindingProfile().set('jump', this.controls.jump.serialize());

    localStorage.setItem('bindings', JSON.stringify(profile));
  }
}
// #endregion guide:binding-profile

export { RebindScene };
