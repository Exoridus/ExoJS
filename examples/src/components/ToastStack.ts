import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { dismissToast, getToasts, subscribeToasts, type ToastMessage } from '../lib/toast-store';
import componentStyles from './ToastStack.scss?inline';

@customElement('exo-toast-stack')
export class ToastStack extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @state() private _toasts: ReadonlyArray<ToastMessage> = [];

  private _unsubscribe?: () => void;

  public override connectedCallback(): void {
    super.connectedCallback();
    this._toasts = getToasts();
    this._unsubscribe = subscribeToasts(toasts => {
      this._toasts = toasts;
    });
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }

  public render(): ReturnType<LitElement['render']> {
    // The stack is a passive container. Each toast is its own polite live
    // region (role="status"), so newly-mounted toasts get announced once
    // without re-reading existing toasts on every change.
    if (this._toasts.length === 0) {
      return html`<div class="stack" aria-label="Notifications"></div>`;
    }

    return html`
      <div class="stack" aria-label="Notifications">
        ${this._toasts.map(toast => this._renderToast(toast))}
      </div>
    `;
  }

  private _renderToast(toast: ToastMessage): ReturnType<LitElement['render']> {
    return html`
      <div class="toast" data-toast-id=${toast.id} role="status" aria-live="polite" aria-atomic="true">
        <span class="message">${toast.message}</span>
        ${toast.action
          ? html`
              <button
                class="action"
                @click=${() => this._runAction(toast)}
              >${toast.action.label}</button>
            `
          : nothing}
        <button
          class="close"
          aria-label="Dismiss"
          title="Dismiss"
          @click=${() => dismissToast(toast.id)}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
            <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;
  }

  private _runAction(toast: ToastMessage): void {
    try {
      toast.action?.onClick();
    } finally {
      dismissToast(toast.id);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-toast-stack': ToastStack;
  }
}
