import { Application } from '@codexo/exojs';

const app = new Application();

// The application's own widgets. Connectivity drives them; it does not know
// what they are.
declare const offlineBanner: { visible: boolean };
declare const downloadButton: { enabled: boolean };

// #region guide:connectivity-ui
app.connectivity.onStateChange.add(state => {
  offlineBanner.visible = state === 'offline';
});

app.connectivity.onModeChange.add(mode => {
  downloadButton.enabled = mode !== 'offline';
});
// #endregion guide:connectivity-ui
