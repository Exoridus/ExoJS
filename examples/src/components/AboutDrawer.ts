import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import type { VersionInfo } from '../lib/versions';
import componentStyles from './AboutDrawer.scss?inline';

type CopyField = 'version' | 'install' | null;

@customElement('exo-about-drawer')
export class AboutDrawer extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ type: Boolean, reflect: true }) public open = false;
  @property({ type: String }) public version = '';
  @property({ type: String }) public packageName = '';
  @property({ attribute: false }) public selectedVersion: VersionInfo | null = null;
  @property({ type: String }) public repositoryUrl = '';
  @property({ type: String }) public license = '';
  @property({ type: String }) public author = '';

  @state() private _copiedField: CopyField = null;

  @query('[data-role="close"]') private _closeButton?: HTMLButtonElement;
  @query('.drawer') private _drawerElement?: HTMLElement;

  private _keydownHandler = (event: KeyboardEvent): void => this._onKeyDown(event);
  private _copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  public override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this._keydownHandler);
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._keydownHandler);
    if (this._copyResetTimer !== null) {
      clearTimeout(this._copyResetTimer);
      this._copyResetTimer = null;
    }
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('open') && this.open) {
      // Focus the close button on next frame so the slide transition starts before
      // the browser scrolls to reveal the focused element.
      requestAnimationFrame(() => this._closeButton?.focus());
    }
    if (changed.has('open') && !this.open) {
      this._copiedField = null;
      if (this._copyResetTimer !== null) {
        clearTimeout(this._copyResetTimer);
        this._copyResetTimer = null;
      }
    }
  }

  private _onKeyDown(event: KeyboardEvent): void {
    if (!this.open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this._emitClose();
      return;
    }

    if (event.key === 'Tab') {
      this._handleTab(event);
    }
  }

  private _handleTab(event: KeyboardEvent): void {
    const drawer = this._drawerElement;
    if (!drawer) return;

    const focusable = Array.from(
      drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.shadowRoot?.activeElement ?? null;

    if (event.shiftKey && (active === first || active === null)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private _emitClose(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private async _onCopy(field: Exclude<CopyField, null>, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard may be unavailable (e.g. non-secure context). Silent fail is
      // acceptable — the adjacent text is still visible and selectable.
      return;
    }
    this._copiedField = field;
    if (this._copyResetTimer !== null) clearTimeout(this._copyResetTimer);
    this._copyResetTimer = setTimeout(() => {
      this._copiedField = null;
      this._copyResetTimer = null;
    }, 1400);
  }

  public render(): ReturnType<LitElement['render']> {
    const activeVersion = this.selectedVersion?.id ?? this.version;
    const installCommand = this._buildInstallCommand(activeVersion);
    const repoDisplay = this._getRepoDisplay();
    const issueUrl = this.repositoryUrl ? `${this.repositoryUrl}/issues/new` : '';
    const readmeUrl = this.repositoryUrl ? `${this.repositoryUrl}#readme` : '';

    return html`
      <div
        class="scrim"
        ?data-open=${this.open}
        @click=${this._emitClose}
        aria-hidden="true"
      ></div>
      <aside
        class="drawer"
        ?data-open=${this.open}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        aria-hidden=${this.open ? 'false' : 'true'}
        tabindex="-1"
      >
        <header class="drawer-header">
          <div class="hero">
            <h2 id="about-title" class="hero-title">ExoJS Examples</h2>
            <p class="hero-subtitle">
              Interactive playground for the ExoJS multimedia framework. Select an example on the left, edit the source, and see the preview update live.
            </p>
          </div>
          <button
            class="close"
            data-role="close"
            aria-label="Close"
            @click=${this._emitClose}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
              <line x1="5" y1="5" x2="15" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <line x1="15" y1="5" x2="5" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <section class="section">
          <h3 class="section-title">Current session</h3>
          <dl class="rows">
            ${activeVersion ? html`
              <div class="row">
                <dt class="row-key">Runtime</dt>
                <dd class="row-value">
                  <span class="row-chip">${activeVersion}</span>
                  <button
                    class="row-copy"
                    ?data-copied=${this._copiedField === 'version'}
                    aria-label="Copy runtime version"
                    title="Copy runtime version"
                    @click=${() => this._onCopy('version', activeVersion)}
                  >${this._copiedField === 'version' ? 'Copied' : 'Copy'}</button>
                </dd>
              </div>
            ` : nothing}
            ${installCommand ? html`
              <div class="row">
                <dt class="row-key">Install</dt>
                <dd class="row-value">
                  <code class="row-chip">${installCommand}</code>
                  <button
                    class="row-copy"
                    ?data-copied=${this._copiedField === 'install'}
                    aria-label="Copy install command"
                    title="Copy install command for the selected runtime version"
                    @click=${() => this._onCopy('install', installCommand)}
                  >${this._copiedField === 'install' ? 'Copied' : 'Copy'}</button>
                </dd>
              </div>
            ` : nothing}
            ${this.repositoryUrl ? html`
              <div class="row">
                <dt class="row-key">Repository</dt>
                <dd class="row-value">
                  <a class="row-link" href=${this.repositoryUrl} target="_blank" rel="noopener noreferrer">
                    ${repoDisplay}
                  </a>
                </dd>
              </div>
            ` : nothing}
            ${this.license ? html`
              <div class="row">
                <dt class="row-key">License</dt>
                <dd class="row-value">${this.license}</dd>
              </div>
            ` : nothing}
            ${this.author ? html`
              <div class="row">
                <dt class="row-key">Author</dt>
                <dd class="row-value">${this.author}</dd>
              </div>
            ` : nothing}
          </dl>
        </section>

        ${this.repositoryUrl ? html`
          <section class="section">
            <h3 class="section-title">Links</h3>
            <div class="links">
              <a class="link" href=${this.repositoryUrl} target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M10 1.5a8.5 8.5 0 00-2.688 16.573c.425.078.58-.184.58-.41 0-.202-.007-.737-.011-1.446-2.364.514-2.863-1.14-2.863-1.14-.386-.981-.943-1.242-.943-1.242-.771-.527.058-.516.058-.516.853.06 1.302.876 1.302.876.758 1.299 1.99.924 2.474.707.077-.55.297-.924.54-1.136-1.888-.215-3.872-.944-3.872-4.202 0-.928.331-1.686.875-2.282-.088-.215-.38-1.08.083-2.25 0 0 .713-.228 2.336.87A8.134 8.134 0 0110 5.8c.722.003 1.449.098 2.128.287 1.622-1.098 2.334-.87 2.334-.87.464 1.17.172 2.035.085 2.25.545.596.874 1.354.874 2.282 0 3.266-1.987 3.985-3.88 4.196.305.263.577.781.577 1.574 0 1.136-.01 2.052-.01 2.332 0 .228.153.492.584.409A8.5 8.5 0 0010 1.5Z"/>
                </svg>
                <span>Source on GitHub</span>
              </a>
              <a class="link" href=${readmeUrl} target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <path d="M3.5 3.5h8a2 2 0 0 1 2 2v11a2 2 0 0 0-2-2h-8v-11Z"/>
                  <path d="M16.5 3.5h-3a2 2 0 0 0-2 2v11a2 2 0 0 1 2-2h3v-11Z"/>
                </svg>
                <span>Read the README</span>
              </a>
              <a class="link" href=${issueUrl} target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <circle cx="10" cy="10" r="7.5"/>
                  <line x1="10" y1="6" x2="10" y2="11" stroke-linecap="round"/>
                  <circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none"/>
                </svg>
                <span>Report an issue</span>
              </a>
            </div>
          </section>
        ` : nothing}

        <section class="section">
          <h3 class="section-title">Keyboard shortcuts</h3>
          <dl class="shortcuts">
            <div class="shortcut">
              <dt class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="shortcut-sep">/</span><kbd>⌘</kbd>
                <span class="shortcut-plus">+</span>
                <kbd>Enter</kbd>
              </dt>
              <dd class="shortcut-label">Refresh the preview with the current code</dd>
            </div>
            <div class="shortcut">
              <dt class="shortcut-keys">
                <kbd>Ctrl</kbd><span class="shortcut-sep">/</span><kbd>⌘</kbd>
                <span class="shortcut-plus">+</span>
                <kbd>S</kbd>
              </dt>
              <dd class="shortcut-label">Also refreshes the preview</dd>
            </div>
            <div class="shortcut">
              <dt class="shortcut-keys"><kbd>Esc</kbd></dt>
              <dd class="shortcut-label">Close drawers and dialogs</dd>
            </div>
          </dl>
        </section>
      </aside>
    `;
  }

  private _buildInstallCommand(activeVersion: string): string {
    if (!this.packageName) return '';
    return activeVersion
      ? `npm i ${this.packageName}@${activeVersion}`
      : `npm i ${this.packageName}`;
  }

  private _getRepoDisplay(): string {
    if (!this.repositoryUrl) return '';
    try {
      const url = new URL(this.repositoryUrl);
      return `${url.host}${url.pathname}`.replace(/\/$/, '');
    } catch {
      return this.repositoryUrl;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-about-drawer': AboutDrawer;
  }
}
