import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getExampleAvailability } from '../lib/runtime-support';
import type { Example, ExamplesMap } from '../lib/types';
import type { VersionInfo } from '../lib/versions';
import { buildExampleHref } from '../lib/url-state';
import { buildPlaygroundNavModel, isExampleRouteActive, type PlaygroundNavCategory } from '../lib/playground-nav';
import { filterExamples, FEATURED_FILTER } from '../lib/example-search';
import componentStyles from './Navigation.scss?inline';
import './LoadingSpinner';
import './NavigationLink';
import './NavigationSection';

const TAG_PRIORITY = ['scene', 'input', 'audio', 'fx', 'effects', 'particles', 'rendering', 'debug', 'advanced'] as const;
const MAX_DEFAULT_TAGS = 9;

@customElement('exo-navigation')
export class Navigation extends LitElement {
    static styles = unsafeCSS(componentStyles);

    @property({ attribute: false }) public examples: ExamplesMap = new Map();
    @property({ attribute: false }) public activeExample: Example | null = null;
    @property({ attribute: false }) public availableTags: Array<string> = [];
    @property({ attribute: false }) public selectedVersion: VersionInfo | null = null;
    @property({ type: String }) public loadError: string | null = null;
    @property({ type: Boolean }) public loaded = false;

    @state() private _searchQuery = '';
    @state() private _activeTagFilter: string | null = null;
    @state() private _showAllTags = false;
    @state() private _overriddenCategories: Map<string, boolean> = new Map();

    protected override willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
        if (changedProperties.has('activeExample') && this._overriddenCategories.size > 0) {
            this._overriddenCategories = new Map();
        }

        if (changedProperties.has('availableTags')) {
            this._showAllTags = false;
        }
    }

    public render(): ReturnType<LitElement['render']> {
        const allTags = this._buildAllTags();
        const defaultTags = this._buildDefaultTags(allTags);
        const activeTag = this._activeTagFilter ?? 'all';
        const visibleTags =
            this._showAllTags || allTags.length <= defaultTags.length
                ? allTags
                : defaultTags.includes(activeTag)
                  ? defaultTags
                  : [...defaultTags, activeTag];
        const canToggleTags = allTags.length > defaultTags.length;
        const hiddenCount = Math.max(0, allTags.length - defaultTags.length);

        return html`
            <section class="side-head">
                <label class="search" for="example-search">
                    <svg class="search-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3"></circle>
                        <path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"></path>
                    </svg>
                    <input
                        id="example-search"
                        class="search-input"
                        .value=${this._searchQuery}
                        placeholder="Find an example..."
                        @input=${this._onSearchInput}
                    />
                    <kbd>Ctrl+K</kbd>
                </label>
                <div class="tag-row" ?data-expanded=${this._showAllTags} aria-label="Filter examples by tag">
                    <button
                        class="tag-button tag-button--featured"
                        type="button"
                        ?data-active=${activeTag === FEATURED_FILTER}
                        aria-pressed=${String(activeTag === FEATURED_FILTER)}
                        @click=${() => this._onSelectTag(FEATURED_FILTER)}
                    >
                        Start here
                    </button>
                    ${visibleTags.map(tag => {
                        const selected = activeTag === tag;
                        return html`
                            <button
                                class="tag-button"
                                type="button"
                                ?data-active=${selected}
                                aria-pressed=${String(selected)}
                                @click=${() => this._onSelectTag(tag)}
                            >
                                ${tag}
                            </button>
                        `;
                    })}
                </div>
                ${canToggleTags
                    ? html`
                          <button
                              class="tag-toggle"
                              type="button"
                              aria-expanded=${String(this._showAllTags)}
                              @click=${this._onToggleTags}
                          >
                              ${this._showAllTags ? 'Show fewer tags' : `Show all tags (${hiddenCount} more)`}
                          </button>
                      `
                    : nothing}
            </section>
            <nav>${this._renderContent()}</nav>
        `;
    }

    private _buildAllTags(): Array<string> {
        return ['all', ...this.availableTags];
    }

    private _buildDefaultTags(allTags: Array<string>): Array<string> {
        const available = new Set(allTags);
        const counts = this._getTagCounts();
        const ordered: string[] = ['all'];

        for (const priorityTag of TAG_PRIORITY) {
            if (available.has(priorityTag)) ordered.push(priorityTag);
        }

        const remaining = allTags
            .filter(tag => tag !== 'all' && !ordered.includes(tag))
            .sort((a, b) => {
                const countDiff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
                if (countDiff !== 0) return countDiff;
                return a.localeCompare(b);
            });

        for (const tag of remaining) {
            if (ordered.length > MAX_DEFAULT_TAGS) break;
            ordered.push(tag);
        }

        return ordered;
    }

    private _getTagCounts(): Map<string, number> {
        const counts = new Map<string, number>();
        const allExamples = Array.from(this.examples.values()).flat();
        for (const example of allExamples) {
            for (const tag of example.tags ?? []) {
                counts.set(tag, (counts.get(tag) ?? 0) + 1);
            }
        }
        return counts;
    }

    private _renderContent(): ReturnType<LitElement['render']> {
        if (this.loadError) return html`<p class="error">${this.loadError}</p>`;
        if (!this.loaded) return html`<exo-spinner centered></exo-spinner>`;

        const allExamples = Array.from(this.examples.values()).flat();
        const filtered = filterExamples(allExamples, {
            query: this._searchQuery,
            activeFilter: this._activeTagFilter,
        });

        if (filtered.length === 0) {
            return html`
                <p class="empty-state">
                    No examples match your search.<br />
                    <span class="empty-hint">Try a broader term like "sprite", "audio", "input", or "debug".</span>
                </p>
            `;
        }

        const showFeatured =
            !this._searchQuery.trim() &&
            (this._activeTagFilter === null || this._activeTagFilter === 'all');

        const categories = buildPlaygroundNavModel(filtered);

        return html`
            ${showFeatured ? this._renderFeaturedSection(allExamples) : nothing}
            ${categories.map(category => this._renderCategory(category))}
        `;
    }

    private _renderFeaturedSection(allExamples: Array<Example>): ReturnType<LitElement['render']> {
        const featured = filterExamples(allExamples, { query: '', activeFilter: FEATURED_FILTER });
        if (featured.length === 0) return nothing;

        return html`
            <div class="featured-section" aria-label="Start here">
                <span class="featured-label">Start here</span>
                ${featured.map(example => this._renderLink(example))}
            </div>
        `;
    }

    // The playground sidenav is the flat catalog: one category level, examples
    // directly underneath. Each example appears exactly once (under its own
    // `section`), so the active-link state can never light up two links at once.
    private _buildCategories(): Array<PlaygroundNavCategory> {
        return buildPlaygroundNavModel(this._filterExamples(Array.from(this.examples.values()).flat()));
    }

    private _filterExamples(examples: Array<Example>): Array<Example> {
        return filterExamples(examples, {
            query: this._searchQuery,
            activeFilter: this._activeTagFilter,
        });
    }

    private _isCategoryExpanded(category: PlaygroundNavCategory): boolean {
        if (this._overriddenCategories.has(category.slug)) return this._overriddenCategories.get(category.slug)!;
        return category.examples.some(example => isExampleRouteActive(example.path, this.activeExample?.path));
    }

    private _renderCategory(category: PlaygroundNavCategory): ReturnType<LitElement['render']> {
        const expanded = this._isCategoryExpanded(category);
        const unavailableCount = category.examples.filter(example => !getExampleAvailability(example).available).length;

        return html`
            <exo-nav-section
                headline=${category.title}
                .expanded=${expanded}
                .unavailableCount=${unavailableCount}
                @toggle-section=${() => this._onToggleCategory(category.slug)}
            >
                ${category.examples.map(example => this._renderLink(example))}
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
                ?active=${isExampleRouteActive(example.path, this.activeExample?.path)}
                ?unavailable=${!availability.available}
                unavailableReason=${availability.reason ?? ''}
            ></exo-nav-link>
        `;
    }

    private _onSearchInput(event: Event): void {
        this._searchQuery = (event.currentTarget as HTMLInputElement).value;
    }

    private _onSelectTag(tag: string): void {
        this._activeTagFilter = tag === 'all' ? null : tag;
    }

    private _onToggleTags(): void {
        this._showAllTags = !this._showAllTags;
    }

    private _onToggleCategory(slug: string): void {
        const next = new Map(this._overriddenCategories);
        const category = this._buildCategories().find(entry => entry.slug === slug);
        if (!category) return;
        const current = next.get(slug) ?? this._isCategoryExpanded(category);
        next.set(slug, !current);
        this._overriddenCategories = next;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-navigation': Navigation;
    }
}
