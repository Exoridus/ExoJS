/**
 * Source of the autoplay gate that runs inside the preview realm.
 *
 * A string rather than a module of this bundle, because it is injected into the
 * preview iframe and has to resolve `@codexo/exojs` through that document's
 * import map - the same engine instance the sample uses, which a module graph
 * of this document could not reach.
 */
export const AUTOPLAY_GATE_SOURCE = `
import { onAudioPlaybackBlocked } from '@codexo/exojs';

const OVERLAY_ID = 'exo-autoplay-gate';

onAudioPlaybackBlocked.add(system => {
  if (document.getElementById(OVERLAY_ID) !== null) {
    return;
  }

  const overlay = document.createElement('button');

  overlay.id = OVERLAY_ID;
  overlay.type = 'button';
  overlay.setAttribute('aria-label', 'Enable sound');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '0',
    padding: '0',
    font: 'inherit',
    color: '#f4f6fb',
    background: 'rgba(11, 13, 18, 0.55)',
    cursor: 'pointer',
  });

  const badge = document.createElement('span');

  Object.assign(badge.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.55rem',
    padding: '0.7rem 1.1rem',
    borderRadius: '999px',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.9)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
    fontFamily: '"Segoe UI", sans-serif',
    fontSize: '0.95rem',
    fontWeight: '600',
  });
  badge.textContent = '\u25B6 Click to enable sound';
  overlay.appendChild(badge);
  document.body.appendChild(overlay);

  // The click that dismisses this is the gesture the browser was waiting for,
  // so nothing here resumes anything: the engine observes the same event and
  // replays what the sample registered while it was locked.
  system.onUnlock.add(() => overlay.remove());
});
`;
