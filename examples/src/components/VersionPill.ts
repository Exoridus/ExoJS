import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import type { VersionInfo } from '../lib/versions';
import componentStyles from './VersionPill.scss?inline';

export interface SelectVersionEvent {
  id: string;
}

@customElement('exo-version-pill')
export class VersionPill extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ attribute: false }) public selectedVersion: VersionInfo | null = null;
  @property({ attribute: false }) public versions: ReadonlyArray<VersionInfo> = [];

  @state() private _menuOpen = false;

  @query('.pill') private _pillButton?: HTMLButtonElement;

  private _keydownHandler = (event: KeyboardEvent): void => this._onKeyDown(event);
  private _outsideHandler = (event: MouseEvent): void => this._onOutsideClick(event);

  public override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this._keydownHandler);
    document.addEventListener('mousedown', this._outsideHandler);
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._keydownHandler);
    document.removeEventListener('mousedown', this._outsideHandler);
  }

  public render(): ReturnType<LitElement['render']> {
    const selected = this.selectedVersion;

    if (!selected) {
      return html`<span class="pill--empty" aria-busy="true">— loading</span>`;
    }

    return html`
      <button
        class="pill"
        data-track=${selected.track}
        aria-haspopup="menu"
        aria-expanded=${String(this._menuOpen)}
        aria-label=${`ExoJS version ${selected.id}, ${selected.track}. Change version.`}
        title="Change ExoJS version"
        @click=${this._onTogglePill}
        @keydown=${this._onPillKeyDown}
      >
        <span class="dot" data-track=${selected.track} aria-hidden="true"></span>
        <span class="version">v${selected.id}</span>
        <span class="track">${selected.track}</span>
        <svg class="chevron" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2 4.5 L6 8.5 L10 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      ${this._menuOpen ? this._renderMenu(selected) : nothing}
    `;
  }

  private _renderMenu(selected: VersionInfo): ReturnType<LitElement['render']> {
    return html`
      <div class="menu" role="menu" aria-label="ExoJS version">
        <div class="menu-title">ExoJS version</div>
        ${this.versions.map(version => this._renderRow(version, selected))}
        <div class="menu-foot">
          Versions are URL-driven: <span class="mono">?v=&amp;ex=</span>
        </div>
      </div>
    `;
  }

  private _renderRow(version: VersionInfo, selected: VersionInfo): ReturnType<LitElement['render']> {
    const isSelected = version.id === selected.id;

    return html`
      <button
        class="row"
        role="menuitemradio"
        aria-checked=${String(isSelected)}
        data-track=${version.track}
        @click=${() => this._onSelect(version.id)}
        @keydown=${this._onRowKeyDown}
      >
        <span class="row-dot" data-track=${version.track} aria-hidden="true"></span>
        <span class="row-ver">v${version.id}</span>
        <span class="row-track" data-track=${version.track}>${version.track}</span>
        ${version.summary
          ? html`<span class="row-summary">${version.summary}</span>`
          : html`<span class="row-summary"></span>`}
        ${version.latest
          ? html`<span class="row-latest">Latest</span>`
          : nothing}
      </button>
    `;
  }

  private _onTogglePill(event: MouseEvent): void {
    event.stopPropagation();
    this._menuOpen = !this._menuOpen;
  }

  // ARIA APG menu-button pattern: while the trigger has focus, ArrowDown opens
  // the menu and lands focus on the first item; ArrowUp opens and lands on the
  // last. Native Enter/Space already work via the button's click handler — they
  // open the menu but leave focus on the trigger (mouse-style).
  private _onPillKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    const target: 'first' | 'last' = event.key === 'ArrowDown' ? 'first' : 'last';

    if (!this._menuOpen) {
      this._menuOpen = true;
      void this.updateComplete.then(() => this._focusRow(target));
    } else {
      this._focusRow(target);
    }
  }

  private _focusRow(which: 'first' | 'last'): void {
    const rows = Array.from(this.renderRoot.querySelectorAll<HTMLButtonElement>('.row'));
    if (rows.length === 0) return;
    const target = which === 'first' ? rows[0] : rows[rows.length - 1];
    target.focus();
  }

  private _onSelect(id: string): void {
    this.dispatchEvent(new CustomEvent<SelectVersionEvent>('select-version', {
      detail: { id },
      bubbles: true,
      composed: true,
    }));
    this._closeMenu();
  }

  private _closeMenu(): void {
    if (!this._menuOpen) return;
    this._menuOpen = false;
    requestAnimationFrame(() => this._pillButton?.focus());
  }

  private _onKeyDown(event: KeyboardEvent): void {
    if (!this._menuOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this._closeMenu();
    }
  }

  private _onRowKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const rows = Array.from(this.renderRoot.querySelectorAll<HTMLButtonElement>('.row'));
    if (rows.length === 0) return;

    const currentIndex = rows.findIndex(row => row === event.currentTarget);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + delta + rows.length) % rows.length;

    event.preventDefault();
    rows[nextIndex].focus();
  }

  private _onOutsideClick(event: MouseEvent): void {
    if (!this._menuOpen) return;

    const path = event.composedPath();
    if (path.includes(this)) return;

    this._menuOpen = false;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-version-pill': VersionPill;
  }
}
