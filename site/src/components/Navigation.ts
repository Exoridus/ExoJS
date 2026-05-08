import { LitElement, html, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { GUIDE_PARTS } from '../lib/guide-structure';
import { getExampleAvailability } from '../lib/runtime-support';
import type { Example, ExamplesMap } from '../lib/types';
import type { VersionInfo } from '../lib/versions';
import { buildExampleHref } from '../lib/url-state';
import componentStyles from './Navigation.scss?inline';
import './LoadingSpinner';
import './NavigationLink';
import './NavigationSection';

interface ChapterGroup {
    key: string;
    title: string;
    examples: Array<Example>;
}

interface PartGroup {
    key: string;
    title: string;
    chapters: Array<ChapterGroup>;
}

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
    @state() private _overriddenParts: Map<string, boolean> = new Map();
    @state() private _overriddenChapters: Map<string, boolean> = new Map();

    protected override willUpdate(changedProperties: Map<PropertyKey, unknown>): void {
        if (changedProperties.has('activeExample') && (this._overriddenParts.size > 0 || this._overriddenChapters.size > 0)) {
            this._overriddenParts = new Map();
            this._overriddenChapters = new Map();
        }
    }

    public render(): ReturnType<LitElement['render']> {
        return html`
            <header class="header">
                <h1 class="heading">Examples</h1>
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
                    <datalist id="tag-filter-options">${this.availableTags.map(tag => html`<option value=${tag}></option>`)}</datalist>
                    ${this._activeTagFilter ? html`<button class="clear-button" @click=${this._onClearFilter}>Clear</button>` : nothing}
                </div>
            </section>
            <nav>${this._renderContent()}</nav>
        `;
    }

    private _renderContent(): ReturnType<LitElement['render']> {
        if (this.loadError) return html`<p class="error">${this.loadError}</p>`;
        if (!this.loaded) return html`<exo-spinner centered></exo-spinner>`;

        const groups = this._buildGroups();
        return html`${groups.map(group => this._renderPart(group))}`;
    }

    private _buildGroups(): Array<PartGroup> {
        const allExamples = Array.from(this.examples.values()).flat();
        const examplesByPath = new Map(allExamples.map(example => [example.path, example]));

        return GUIDE_PARTS.map(part => {
            const chapters: Array<ChapterGroup> = part.chapters
                .map(chapter => {
                    const mapped = chapter.examples
                        .map(path => examplesByPath.get(path))
                        .filter((example): example is Example => Boolean(example))
                        .filter(example => (this._activeTagFilter ? (example.tags ?? []).includes(this._activeTagFilter) : true));

                    return {
                        key: chapter.path,
                        title: chapter.title,
                        examples: mapped,
                    };
                })
                .filter(chapter => chapter.examples.length > 0);

            return {
                key: part.slug,
                title: part.title,
                chapters,
            };
        }).filter(part => part.chapters.length > 0);
    }

    private _isPartExpanded(group: PartGroup): boolean {
        if (this._overriddenParts.has(group.key)) return this._overriddenParts.get(group.key)!;
        return group.chapters.some(chapter => chapter.examples.some(example => example.path === this.activeExample?.path));
    }

    private _isChapterExpanded(chapter: ChapterGroup): boolean {
        if (this._overriddenChapters.has(chapter.key)) return this._overriddenChapters.get(chapter.key)!;
        return chapter.examples.some(example => example.path === this.activeExample?.path);
    }

    private _renderPart(group: PartGroup): ReturnType<LitElement['render']> {
        const expanded = this._isPartExpanded(group);
        const unavailableCount = group.chapters
            .flatMap(chapter => chapter.examples)
            .filter(example => !getExampleAvailability(example).available).length;

        return html`
            <exo-nav-section
                headline=${group.title}
                .expanded=${expanded}
                .unavailableCount=${unavailableCount}
                @toggle-section=${() => this._onTogglePart(group.key)}
            >
                ${group.chapters.map(chapter => this._renderChapter(chapter))}
            </exo-nav-section>
        `;
    }

    private _renderChapter(chapter: ChapterGroup): ReturnType<LitElement['render']> {
        const expanded = this._isChapterExpanded(chapter);
        return html`
            <section class="chapter">
                <button class="chapter__toggle" type="button" aria-expanded=${String(expanded)} @click=${() => this._onToggleChapter(chapter.key)}>
                    <span class="chapter__title">${chapter.title}</span>
                    <span class="chapter__chevron" ?data-expanded=${expanded}></span>
                </button>
                ${expanded
                    ? html`
                          <div class="chapter__examples">
                              ${chapter.examples.map(example => this._renderLink(example))}
                          </div>
                      `
                    : nothing}
            </section>
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

    private _onTogglePart(key: string): void {
        const next = new Map(this._overriddenParts);
        const group = this._buildGroups().find(entry => entry.key === key);
        if (!group) return;
        const current = next.get(key) ?? this._isPartExpanded(group);
        next.set(key, !current);
        this._overriddenParts = next;
    }

    private _onToggleChapter(key: string): void {
        const next = new Map(this._overriddenChapters);
        const groups = this._buildGroups();
        const chapter = groups.flatMap(group => group.chapters).find(entry => entry.key === key);
        if (!chapter) return;
        const current = next.get(key) ?? this._isChapterExpanded(chapter);
        next.set(key, !current);
        this._overriddenChapters = next;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'exo-navigation': Navigation;
    }
}
