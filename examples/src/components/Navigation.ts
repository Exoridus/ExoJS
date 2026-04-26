import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Example, ExamplesMap } from '../lib/types';
import type { VersionInfo } from '../lib/versions';
import { getExampleAvailability } from '../lib/runtime-support';
import { buildExampleHref } from '../lib/url-state';
import componentStyles from './Navigation.scss?inline';
import './NavigationLink';
import './NavigationSection';
import './LoadingSpinner';

@customElement('exo-navigation')
export class Navigation extends LitElement {
  static styles = unsafeCSS(componentStyles);

  @property({ attribute: false }) public examples: ExamplesMap = new Map();
  @property({ attribute: false }) public activeExample: Example | null = null;
  @property({ attribute: false }) public availableTags: Array<string> = [];
  @property({ attribute: false }) public selectedVersion: VersionInfo | null = null;
  @property({ type: String }) public loadError: string | null = null;
  @property({ type: Boolean }) public loaded = false;

  @state() private _tagInputValue = '';
  @state() private _activeTagFilter: string | null = null;
  @state() private _overriddenSections: Map<string, boolean> = new Map();

  protected override willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
    if (changedProperties.has('activeExample') && this._overriddenSections.size > 0) {
      this._overriddenSections = new Map();
    }
  }

  public render(): ReturnType<LitElement['render']> {
    return html`
      <header class="header">
        <h1 class="heading">ExoJS Examples</h1>
      </header>
      <section class="filter-bar">
        <label class="filter-label" for="tag-filter">Filter by tag</label>
        <div class="filter-controls">
          <input
            id="tag-filter"
            class="filter-input"
            list="tag-filter-options"
            .value=${this._tagInputValue}
            placeholder="Pick a tag"
            @input=${this._onTagInput}
            @change=${this._onTagChange}
            @keydown=${this._onTagKeyDown}
          />
          <datalist id="tag-filter-options">
            ${this.availableTags.map(tag => html`<option value=${tag}></option>`)}
          </datalist>
          ${this._activeTagFilter
            ? html`<button class="clear-button" @click=${this._onClearFilter}>Clear</button>`
            : nothing}
        </div>
      </section>
      <nav>${this._renderContent()}</nav>
    `;
  }

  private _renderContent(): ReturnType<LitElement['render']> {
    if (this.loadError) {
      return html`<p class="error">${this.loadError}</p>`;
    }

    if (!this.loaded) {
      return html`<exo-spinner centered></exo-spinner>`;
    }

    const filtered = this._getFilteredExamples();
    return html`${Array.from(filtered.entries()).map(
      ([category, entries]) => this._renderCategory(category, entries)
    )}`;
  }

  private _getFilteredExamples(): ExamplesMap {
    if (!this._activeTagFilter) {
      return this.examples;
    }

    const filtered = Array.from(this.examples.entries())
      .map(([section, examples]) => [
        section,
        examples.filter(ex => (ex.tags ?? []).includes(this._activeTagFilter!)),
      ] as [string, Array<Example>])
      .filter(([, examples]) => examples.length > 0);

    return new Map(filtered);
  }

  private _isSectionExpanded(headline: string, entries: Array<Example>): boolean {
    if (this._overriddenSections.has(headline)) {
      return this._overriddenSections.get(headline)!;
    }

    return entries.some(entry => entry.path === this.activeExample?.path);
  }

  private _renderCategory(headline: string, entries: Array<Example>): ReturnType<LitElement['render']> {
    const expanded = this._isSectionExpanded(headline, entries);
    const unavailableCount = entries.filter(
      entry => !getExampleAvailability(entry).available
    ).length;

    return html`
      <exo-nav-section
        headline=${headline}
        .expanded=${expanded}
        .unavailableCount=${unavailableCount}
        @toggle-section=${this._onToggleSection}
      >
        ${entries.map(entry => this._renderLink(entry))}
      </exo-nav-section>
    `;
  }

  private _renderLink(example: Example): ReturnType<LitElement['render']> {
    const availability = getExampleAvailability(example);
    const href = buildExampleHref(example.path, this.selectedVersion?.id ?? null);

    return html`
      <exo-nav-link
        href=${href}
        path=${example.path}
        title=${example.title}
        description=${example.description}
        ?active=${this.activeExample?.path === example.path}
        ?unavailable=${!availability.available}
        unavailableReason=${availability.reason ?? ''}
      ></exo-nav-link>
    `;
  }

  private _onTagInput(event: Event): void {
    this._tagInputValue = (event.currentTarget as HTMLInputElement).value;
  }

  private _onTagChange(event: Event): void {
    this._applyTagFilter((event.currentTarget as HTMLInputElement).value);
  }

  private _onTagKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this._applyTagFilter((event.currentTarget as HTMLInputElement).value);
  }

  private _onClearFilter(): void {
    this._tagInputValue = '';
    this._activeTagFilter = null;
  }

  private _applyTagFilter(value: string): void {
    const normalized = value.trim();

    if (normalized === '') {
      this._tagInputValue = '';
      this._activeTagFilter = null;
      return;
    }

    const matched = this.availableTags.find(tag => tag === normalized);

    if (!matched) {
      this._tagInputValue = this._activeTagFilter ?? '';
      return;
    }

    this._tagInputValue = matched;
    this._activeTagFilter = matched;
  }

  private _onToggleSection(event: CustomEvent<{ headline: string }>): void {
    const headline = event.detail.headline;
    const entries = this.examples.get(headline) ?? [];
    const current = this._isSectionExpanded(headline, entries);
    const next = new Map(this._overriddenSections);
    next.set(headline, !current);
    this._overriddenSections = next;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'exo-navigation': Navigation;
  }
}
