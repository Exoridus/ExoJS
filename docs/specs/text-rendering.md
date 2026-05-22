# Text Rendering System — Design Spec

## Kontext

Das bestehende Text-System (`src/rendering/text/`) hat folgende bekannte Probleme die
diesen Entwurf motivieren:

- `TextStyle`-Mutationen (`text.style.fontFamily = …`) triggern keinen Rebuild — `Text`
  liest `style.dirty` nie
- `fontStyle` fehlt im `font`-Getter → `ready`-Promise funktioniert nicht für Italic-Fonts
- `fill`, `stroke`, `strokeThickness` sind dead code — `_rasterize` ignoriert sie
- `wordWrap`/`wordWrapWidth` in `TextStyle` deklariert aber in `layoutText` nicht implementiert
- Globaler Atlas-Singleton: `clear()` räumt alle Text-Nodes ab, rebuilt aber nur den
  aufrufenden Node
- Atlas-Overflow wirft aus Konstruktor und Settern statt graceful zu wachsen
- `fillColor` im Konstruktor nicht geklont wenn übergeben
- Ein Draw Call pro `Text`-Node

---

## Architektur: Zwei Tiers

```
AbstractText (Container, gemeinsame public API)
├── DynamicText   — runtime Canvas 2D Rasterisierung, maximale Flexibilität
└── BitmapText    — offline-generierter Atlas (BMFont / MSDF), maximale Qualität
```

**DynamicText** für alles Dynamische: lokalisierter Text, nutzergenerierter Inhalt,
variable Fonts, Color Fonts. Canvas 2D bleibt das Rasterisierungs-Backend.

**BitmapText** für alles zur Build-Zeit Bekannte: UI-Schriften, Zahlen, Icons.
Liest aus einem vorberechneten Atlas (BMFont-PNG+FNT oder MSDF-PNG+JSON).

---

## GlyphAtlasPool

Statt eines globalen Singletons verwaltet `GlyphAtlasPool` eine Map von Font-Variante
zu `GlyphAtlas`. Jede Variante hat ihre eigene Atlas-Kette, unabhängig von anderen.

```
GlyphAtlasPool
├── "Arial:normal:bold"    → GlyphAtlas (pages: [AtlasPage, AtlasPage])
├── "MyFont:italic:normal" → GlyphAtlas (pages: [AtlasPage])
└── …
```

**Atlas-Key:** `"${family}:${fontStyle}:${fontWeight}"` — ohne `fontSize`, da bei Canvas
2D jede Größe separat gerastert wird. Die Größe ist Teil des Glyph-Keys, nicht des
Atlas-Keys. (Bei MSDF entfällt dieses Problem, da ein Atlas alle Größen abdeckt.)

### AtlasPage

Jede `AtlasPage` ist eine Textur fester Größe (default 1024×1024) mit einem
`ShelfPacker`:

```ts
interface AtlasPage {
  readonly texture: Texture;
  readonly index: number;           // Seitennummer für Shader
  insert(w: number, h: number): { x: number; y: number } | null; // null = voll
  rasterize(ctx: OffscreenCanvasRenderingContext2D): void;
  uploadDirtyRegion(): void;        // texSubImage2D nur für geänderte Bereiche
}
```

### Shelf Packing

Horizontale Zeilen ("Shelves") mit fester Höhe. Neue Glyphen gehen auf die erste
passende Zeile; gibt es keine, wird unten eine neue Zeile eröffnet:

```
┌─────────────────────────────────┐
│ A  B  C  D  [     leer      ]   │ Shelf 0 (height=28 incl. padding)
│ g  p  q  y  j  [   leer   ]     │ Shelf 1 (height=22)
│ M  W  [          leer      ]    │ Shelf 2 (height=36)
│         [   freier Atlas   ]    │
└─────────────────────────────────┘
```

Wenn eine Page voll ist (`insert` gibt `null`) wird transparent eine neue `AtlasPage`
angehängt — kein Fehler, kein globales Clear.

### Multi-Page Shader (WebGL 2)

Alle Pages einer Atlas-Variante werden als `TEXTURE_2D_ARRAY` hochgeladen.
Jedes Glyph-Quad trägt seine Seitennummer als Vertex-Attribut:

```glsl
uniform sampler2DArray uGlyphAtlas;
in float vPage;
in vec2  vUv;

void main() {
  float alpha = texture(uGlyphAtlas, vec3(vUv, vPage)).r;
  fragColor = uTint * alpha;
}
```

### Limitierungen

- **Fragmentierung:** Shelf-Packing verschwendet Platz bei stark variierenden
  Glyph-Höhen. MaxRects/Guillotine würde dichter packen, ist aber komplexer.
- **Größen-Granularität (Canvas 2D):** Jede `fontSize`-Variante erzeugt eigene
  Glyph-Einträge. `fontSize: 20` und `fontSize: 21` sind separate Cache-Keys.
- **Kein Eviction:** Der Atlas wächst unbegrenzt. LRU-Eviction erfordert Mesh-
  Invalidierung aller betroffenen Quads — nicht im initialen Scope.
- **GPU-Upload-Kosten:** Jedes neue Glyph triggert `texSubImage2D`. Mit `uploadDirtyRegion`
  wird nur der tatsächlich veränderte Bereich hochgeladen.
- **GPU-Speicher:** 1024×1024 RGBA = 4 MB pro Page. Bei vielen Font-Varianten summiert
  sich das; Page-Größe ist konfigurierbar.

---

## TextStyle + Dirty-Flag-System

### StyleChangeHint

Jede Property-Änderung markiert einen Hint der beschreibt wie schwer der nötige
Rebuild ist. Es gibt drei Stufen, die sich zum schwersten akkumulieren:

```ts
type StyleChangeHint = 'tint' | 'layout' | 'font';

// Merge-Regel: tint < layout < font
// 'tint' + 'font' → 'font'
// 'layout' + 'tint' → 'layout'
```

| Hint | Was passiert | Beispiel-Properties |
|---|---|---|
| `'tint'` | Nur `Mesh.tint` updaten, kein Atlas-Rebuild | `fillColor` |
| `'layout'` | Mesh neu bauen, Atlas-Cache bleibt | `fontSize`, `align`, `wordWrap` |
| `'font'` | Atlas-Lookup + Mesh neu bauen | `fontFamily`, `fontWeight`, `fontStyle` |

### TextStyle API

```ts
class TextStyle {
  // Interner Zustand
  private _dirty = false;
  private _pendingHint: StyleChangeHint = 'tint';

  // Nur für externe Observer (DevTools, Editor), nicht für den internen Rebuild-Pfad
  readonly onChange = new Signal<[]>();

  // Von Text.update() aufgerufen — gibt akkumulierten Hint zurück und löscht Flag
  public consumeDirty(): StyleChangeHint | null {
    if (!this._dirty) return null;
    const hint = this._pendingHint;
    this._dirty = false;
    this._pendingHint = 'tint';
    return hint;
  }

  private _markDirty(hint: StyleChangeHint): void {
    this._pendingHint = mergeHint(this._pendingHint, hint);
    if (!this._dirty) {
      this._dirty = true;
      this.onChange.dispatch(); // einmal dispatchen, nicht pro Property
    }
  }

  // Beispiel-Setter:
  set fontFamily(v: FontFamily) {
    if (this._fontFamily === v) return;
    this._fontFamily = v;
    this._markDirty('font');
  }

  set fontSize(v: number) {
    if (this._fontSize === v) return;
    this._fontSize = v;
    this._markDirty('layout');
  }

  set fillColor(v: Color) {
    this._fillColor = v;
    this._markDirty('tint');
  }
}
```

**Kritisch:** Das Signal feuert nur einmal pro "dirty cycle", nicht pro Property-Änderung.
Beliebig viele Properties können pro Frame geändert werden — es gibt genau einen Rebuild
am Anfang des nächsten Frames.

### TextStyle Properties

Nur Properties die tatsächlich implementiert sind. Dead code aus dem alten System
(`fill`, `stroke`, `strokeThickness` als Canvas-Eigenschaften) wird entfernt.

| Property | Typ | Hint | Beschreibung |
|---|---|---|---|
| `fontFamily` | `FontFamily` | `font` | Font-Variante |
| `fontWeight` | `FontWeight` | `font` | `'normal'`, `'bold'`, `'100'`–`'900'` |
| `fontStyle` | `'normal' \| 'italic'` | `font` | |
| `fontSize` | `number` | `layout` | Pixel-Größe |
| `fillColor` | `Color` | `tint` | Laufzeit-Tint via Mesh |
| `outlineColor` | `Color` | `tint` | Outline-Farbe (nur BitmapText/SDF) |
| `outlineWidth` | `number` | `tint` | Outline-Stärke (0 = kein Outline) |
| `align` | `TextAlignment` | `layout` | `'left'`, `'center'`, `'right'` |

`fontStyle` muss in den `font`-Getter eingebaut sein:

```ts
get font(): string {
  const style = this._fontStyle !== 'normal' ? `${this._fontStyle} ` : '';
  return `${style}${this._fontWeight} ${this._fontSize}px ${this._fontFamily}`;
}
```

---

## Font Family Type Safety

### FontFace als First-Class Value

`TextStyleOptions.fontFamily` akzeptiert `FontFace | FontFamily`:

```ts
// FontFace direkt übergeben — Font ist garantiert geladen
const face = await loader.load(FontFace, 'font.woff2', { family: 'MyFont' });
const label = new DynamicText('Hello', { font: face });
// Kein 'ready'-Promise nötig
```

Intern extrahiert `TextStyle` die CSS-Family aus dem `FontFace`-Objekt:

```ts
this._fontFamily = options.fontFamily instanceof FontFace
  ? options.fontFamily.family
  : options.fontFamily ?? 'Arial';
```

System-Fonts und beliebige CSS-Strings bleiben weiterhin als `string` nutzbar.

### FontRegistry (Compile-Time Autocomplete)

```ts
// In TextStyle.ts — leere Interface für Declaration Merge
export interface FontRegistry {}

export type FontFamily =
  keyof FontRegistry extends never
    ? string
    : keyof FontRegistry | (string & {});
```

User-Code registriert geladene Fonts:

```ts
// app-types.d.ts
declare module 'exojs' {
  interface FontRegistry {
    'AndyBold': true;
    'MyOtherFont': true;
  }
}

// Jetzt mit Autocomplete:
new TextStyle({ fontFamily: 'AndyBold' })   // ✅ autocomplete
new TextStyle({ fontFamily: 'Typo' })       // ⚠ kein autocomplete, aber kein Fehler
```

---

## Layout

`LayoutOptions` ist von `TextStyle` getrennt — Style beschreibt Aussehen, Layout
beschreibt Fluss:

```ts
interface LayoutOptions {
  maxWidth?:      number;                          // Word-Wrap-Grenze
  maxHeight?:     number;                          // Clip-Grenze
  overflow?:      'visible' | 'clip' | 'ellipsis';
  letterSpacing?: number;                          // Zusätzlicher Abstand zwischen Glyphen
  direction?:     'ltr' | 'rtl';
}
```

`layoutText(text, style, layout, atlas)` berechnet `GlyphPlacement[]` wie bisher als
pure Funktion — keine Änderung am Konzept, nur Erweiterung der Signatur.

---

## DynamicText

```ts
class DynamicText extends AbstractText {
  private _style: TextStyle;
  private _layout: LayoutOptions;
  private _mesh: Mesh | null = null;

  public override update(dt: number): void {
    super.update(dt);

    const hint = this._style.consumeDirty();

    if (hint === null) return;

    if (hint === 'tint') {
      this._applyTint();         // nur Mesh.tint, kein Rebuild
    } else {
      this._rebuild(hint);       // layout oder font
    }
  }

  private _applyTint(): void {
    if (this._mesh) this._mesh.tint = this._style.fillColor;
  }

  private _rebuild(hint: StyleChangeHint): void {
    // Mesh entfernen, neu bauen via layoutText + buildMesh
    // hint === 'font' → Atlas-Lookup berücksichtigt neue Font-Variante
  }
}
```

Kein `ready`-Promise — wer `FontFace` übergibt hat den Font bereits geladen.
Für System-Fonts (String-Übergabe) wird `document.fonts.check()` intern beim ersten
Rebuild konsultiert; ist der Font noch nicht bereit wird nach `document.fonts.load()`
einmalig neugebaut.

---

## BitmapText

Liest aus einem offline-generierten Atlas. Zwei unterstützte Quellformate:

### BMFont (AngelCode)

```ts
interface BmFontData {
  pages: string[];                          // Textur-Dateinamen
  chars: Map<number, BmFontChar>;           // codePoint → Metriken
  kernings: Map<string, number>;            // "cp1,cp2" → Betrag
  lineHeight: number;
  base: number;
}
```

Geladen via XML-Factory (XML-Variante) oder eigenem Text-Parser (Text-Variante).
Textur-Pages werden separat über den Loader geladen.

### MSDF Atlas

Output von `msdf-atlas-gen` — PNG + JSON:

```json
{
  "atlas": { "type": "msdf", "width": 512, "height": 512, "size": 48 },
  "glyphs": [
    { "unicode": 65, "planeBounds": {...}, "atlasBounds": {...}, "advance": 0.6 }
  ]
}
```

**Shader für BitmapText (MSDF):**

```glsl
float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  vec3 msd = texture(uAtlas, vUv).rgb;
  float sd = median(msd.r, msd.g, msd.b);
  float fill    = smoothstep(0.5 - uSoftness, 0.5 + uSoftness, sd);
  float outline = smoothstep(uOutlineMin, uOutlineMin + uSoftness, sd) * (1.0 - fill);
  fragColor = uFillColor * fill + uOutlineColor * outline;
}
```

Outline, Glow und Drop Shadow sind reine Shader-Parameter — kein zweiter Draw Call,
kein Atlas-Rebuild.

---

## Batched Rendering

Alle `DynamicText`-Nodes die dieselbe Atlas-Page referenzieren werden in einem
einzigen instanced Draw Call gerendert:

```
TextBatch (pro AtlasPage)
└── instanced quads: [positions | uvs | pageIndex | tint] × N Glyphen
```

World-Transform jedes Text-Nodes geht als Matrix-Attribut per Instance ins Vertex-
Shader. Der Scene-Graph-Overhead bleibt erhalten.

**DynamicText ohne Scene-Graph-Integration (standalone):** Ein Draw Call pro Node
ist akzeptabel und ist der Einstiegspunkt — Batching ist eine Optimierung für später.

---

## Font-Format-Erweiterbarkeit

| Format | Tier | Laufzeit? | Abhängigkeit |
|---|---|---|---|
| WOFF/WOFF2/TTF/OTF | DynamicText | Ja (FontFace) | Browser-nativ |
| Variable Fonts | DynamicText | Ja (font-variation-settings) | Browser-nativ |
| Color Fonts / Emoji | DynamicText | Ja, opt-in `colorGlyphs: true` | Browser-nativ |
| BMFont (Text/XML) | BitmapText | Nein (offline) | XmlFactory / eigener Parser |
| MSDF Atlas | BitmapText | Nein (offline) | msdf-atlas-gen (Build-Tool) |

**Color Fonts** (COLR/Emoji) benötigen einen separaten Rendering-Modus: `fillStyle`
darf nicht auf `#ffffff` hardgecodet werden, und Tinting via `Mesh.tint` ist sinnlos.
Opt-in per `colorGlyphs: true` in `DynamicText`-Optionen; dieser Modus rendert RGBA
direkt aus dem Canvas.

---

## Was explizit nicht im Scope ist

- **RTL / BiDi:** Rechts-nach-links-Text und gemischte Richtungen. Komplex, eigener Spec.
- **Ligatures / OpenType-Shaping:** Arabisch, Devanagari etc. Erfordert HarfBuzz-WASM.
- **SDF-Generierung zur Laufzeit:** Zu CPU-intensiv ohne Worker + WASM-SDF-Generator.
  Vorerst: BitmapText für SDF-Qualität (offline), DynamicText für Flexibilität.
- **Atlas-LRU-Eviction:** Zu komplex für den ersten Scope. Dokumentiertes Limit.
- **Vertikaler Text:** Eigener Layout-Pfad, eigener Spec.

---

## Implementierungsreihenfolge (Vorschlag)

1. `TextStyle` — dirty flag + `consumeDirty()` + `StyleChangeHint`, `fontStyle` in
   `font`-Getter, dead properties entfernen, `fillColor` klonen
2. `DynamicText` — `update()`-basierter Dirty-Check, `_applyTint()` vs. `_rebuild()`
3. `GlyphAtlas` — multi-page mit `AtlasPage[]`, kein globaler Singleton
4. `GlyphAtlasPool` — per-font-variant Isolation
5. `FontRegistry` + `FontFace`-Übergabe in `TextStyleOptions`
6. `LayoutOptions` — `wordWrap`, `maxWidth`, `overflow`, `letterSpacing`
7. `BitmapText` + BMFont-Loader
8. `BitmapText` + MSDF-Shader
9. Batched Rendering (optional, Optimierungsstufe)
