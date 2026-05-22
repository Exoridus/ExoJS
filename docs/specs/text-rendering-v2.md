# Text Rendering V2 — Unified Shader Renderer

## Kontext

Diese Spec baut auf `text-rendering.md` (V1) auf. V1 hat das Fundament gelegt
(DynamicText, GlyphAtlasPool, Multi-Page Atlas, LayoutOptions, BitmapText-
Grundgerüst). V2 schließt die verbleibenden Lücken durch einen **einheitlichen
Text-Renderer** mit drei spezialisierten Shader-Varianten und optionalem
Instanced Batching.

---

## Status der V1-Implementation

### Implementiert ✅

| Feature | Datei(en) |
|---|---|
| `TextStyle` mit `StyleChangeHint` + `consumeDirty()` | `TextStyle.ts` |
| `FontRegistry` / `FontFamily` / `FontWeight` Typen | `TextStyle.ts` |
| `fontStyle` im `font`-Getter (Italic-Bug behoben) | `TextStyle.ts` |
| `fillColor` wird geklont | `TextStyle.ts` |
| `outlineColor` / `outlineWidth` Properties | `TextStyle.ts` |
| `GlyphAtlas` Multi-Page mit automatischem Wachstum | `GlyphAtlas.ts` |
| `GlyphAtlasPool` — Isolation pro Font-Variante | `GlyphAtlasPool.ts` |
| `AbstractText` Basisklasse | `AbstractText.ts` |
| `DynamicText` mit `update()`-Dirty-Loop | `DynamicText.ts` |
| `LayoutOptions` — `maxWidth`, `letterSpacing`, `overflow` | `LayoutOptions.ts` |
| Word-Wrap via `maxWidth` | `TextLayout.ts` |
| `BitmapText` Datenstruktur + Quad-Builder | `BitmapText.ts` |

### Offen / Unvollständig ⚠️

| Feature | Grund |
|---|---|
| `outlineColor`/`outlineWidth` existieren auf `TextStyle` aber sind nicht verdrahtet | Kein Shader vorhanden |
| `BitmapText` hat keinen Parser für `.fnt` Dateien | Noch nicht implementiert |
| `BitmapText` nutzt generischen Mesh-Renderer | Kein MSDF-Shader |
| Kein Drop Shadow | Braucht Shader + Atlas-Padding |
| Kein Gradient Fill | Braucht Shader |
| Kein Batching | Architektur-Änderung nötig |

### Explizit geskippt (V1 Scope) 🚫

| Feature | Begründung |
|---|---|
| Stroke auf DynamicText (Canvas-Rasterisierung) | Wird durch SDF-Outline ersetzt |
| RTL / BiDi | Eigener Spec |
| Ligatures / OpenType-Shaping | Erfordert HarfBuzz-WASM |
| Atlas-LRU-Eviction | Dokumentiertes Limit |
| Vertikaler Text | Eigener Spec |
| Layout: `justify`, `leading`, `breakWords`, `whiteSpace` | Im Scope dieser Spec |
| `HTMLText` (SVG/foreignObject) | Eigener Scope |

---

## Ziel dieser Spec

1. **Drei Shader-Varianten** für drei fundamentale Text-Render-Modi
2. **bitmap-SDF Atlas** für DynamicText — ersetzt RGBA-weiß durch R8-SDF
3. **Outline, Shadow, Gradient** auf DynamicText via Shader-Uniforms
4. **BMFont-Parser** + MSDF-Shader für BitmapText
5. **Emoji / Color Font** opt-in Pfad (RGBA)
6. **Instanced Batching** — alle Text-Nodes einer Shader-Variante + AtlasPage in einem Draw Call
7. **Layout-Features** — `justify`, `leading`, `breakWords`, `whiteSpace`

---

## Warum drei separate Shader statt einem Mega-Shader

### GPU-Branching

Ein Mega-Shader mit `if (uIsMsdf)` oder `if (uIsColor)` ist auf der GPU teuer:
alle Shader-Lanes einer Warp/Wavefront müssen denselben Pfad ausführen, auch
wenn nur ein Teil der Quads diesen Pfad wirklich braucht. Separate Shader haben
keinen toten Code und ermöglichen dem GPU-Compiler optimalen Output.

### Textur-Format erzwingt die Trennung sowieso

Die drei Modi brauchen fundamental unterschiedliche Textur-Formate:

| Variante | Format | Grund |
|---|---|---|
| `text-sdf` | R8 | Nur Distanzwert, 75% weniger GPU-Speicher als RGBA |
| `text-msdf` | RGB | Drei Distanzkanäle für MSDF-Qualität |
| `text-color` | RGBA | Volle Farbinformation für Emoji/Color Fonts |

Ein einziger Shader-Slot kann nur ein Textur-Format binden. Der Renderer muss
ohnehin nach Format trennen — damit hat man de facto separate Shader.

### Batching profitiert direkt davon

Der Batch-Key ist `Shader-Variante + AtlasPage`. Separate Shader erzwingen
saubere Batch-Grenzen: ein Draw Call mischt nie SDF- und MSDF-Quads (was
nicht funktionieren würde). Der `TextRenderer` ist einmal geschrieben und kennt
alle drei Varianten als Batch-Gruppen — die Emoji-Variante ist dabei fast
gratis, nur ein weiterer Batch-Key-Typ ohne SDF-Logik.

### Was trotzdem geteilt wird

Alle drei Varianten teilen:
- Denselben **Vertex Shader** (Position, UV, WorldTransform per Instance)
- Dieselbe **Renderer-Infrastruktur** (`TextRenderer`, `TextBatch`)
- Dieselbe **Vertex Buffer Layout** (kein Format-Unterschied auf der Geometrie-Seite)
- Dieselbe **Scene-Graph-Integration** (`AbstractText.render()` → `TextRenderer.submit()`)

Das Ergebnis: drei kleine, schnelle Shader — ein Renderer, ein Batching-System.

---

## Die drei Shader-Varianten

### Variante 1: `text-sdf` — DynamicText

**Atlas-Format:** R8 (ein Kanal, Distanzfeld)
**Quelle:** Canvas 2D → `tiny-sdf` Bitmap-zu-SDF-Konvertierung

```glsl
// text-sdf.frag
uniform sampler2D uAtlas;
uniform vec4  uFillColor;
uniform vec4  uOutlineColor;
uniform float uOutlineWidth;  // 0 = kein Outline
uniform vec4  uShadowColor;
uniform vec2  uShadowOffset;  // UV-Raum
uniform float uShadowAlpha;
uniform float uSoftness;      // Kantenweichheit, default ~0.05

in vec2 vUv;
out vec4 fragColor;

void main() {
  float sd   = texture(uAtlas, vUv).r;
  float fill = smoothstep(0.5 - uSoftness, 0.5 + uSoftness, sd);

  // Outline: Ring außerhalb des Fill
  float outlineMin = 0.5 - uOutlineWidth;
  float outline = uOutlineWidth > 0.0
    ? smoothstep(outlineMin - uSoftness, outlineMin + uSoftness, sd) * (1.0 - fill)
    : 0.0;

  // Shadow: Glyph-Form an versetzter UV-Position
  float shadowSd = texture(uAtlas, vUv - uShadowOffset).r;
  float shadow   = smoothstep(0.5 - uSoftness, 0.5 + uSoftness, shadowSd)
                   * uShadowAlpha * (1.0 - fill) * (1.0 - outline);

  // Gradient: UV-basierter Verlauf (Y-Achse, override fill color)
  // Aktiviert wenn uGradientEnabled == 1
  // uniform vec4 uGradientTop; uniform vec4 uGradientBottom;
  // vec4 gradColor = mix(uGradientBottom, uGradientTop, vUv.y);

  fragColor = uFillColor * fill
            + uOutlineColor * outline
            + uShadowColor * shadow;
}
```

### Variante 2: `text-msdf` — BitmapText (MSDF)

**Atlas-Format:** RGB (drei Kanäle, Multi-channel SDF)
**Quelle:** `msdf-atlas-gen` (offline Build-Tool)

```glsl
// text-msdf.frag
uniform sampler2D uAtlas;
uniform vec4  uFillColor;
uniform vec4  uOutlineColor;
uniform float uOutlineMin;   // SDF-Distanz für Outline-Beginn (z.B. 0.3)
uniform float uSoftness;

in vec2 vUv;
out vec4 fragColor;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  vec3  msd     = texture(uAtlas, vUv).rgb;
  float sd      = median(msd.r, msd.g, msd.b);
  float fill    = smoothstep(0.5 - uSoftness, 0.5 + uSoftness, sd);
  float outline = smoothstep(uOutlineMin, uOutlineMin + uSoftness, sd) * (1.0 - fill);

  fragColor = uFillColor * fill + uOutlineColor * outline;
}
```

Shadow ist bei MSDF ebenfalls möglich (gleiche UV-Offset-Technik wie text-sdf),
aber seltener gebraucht — kann als optionaler Uniform-Block ergänzt werden.

### Variante 3: `text-color` — Emoji / Color Fonts

**Atlas-Format:** RGBA (volle Farbinformation)
**Quelle:** Canvas 2D mit `colorGlyphs: true` (kein weißer fillStyle)

```glsl
// text-color.frag
uniform sampler2D uAtlas;

in vec2 vUv;
out vec4 fragColor;

void main() {
  fragColor = texture(uAtlas, vUv); // direkt, kein Tinting
}
```

Kein Tint, kein Outline, kein SDF — reine Farbtextur. Aktiviert via
`DynamicText`-Option `colorGlyphs: true`.

---

## bitmap-SDF für DynamicText

### Warum

Aktuell schreibt `AtlasPage.rasterize()` weiße Pixel. Mit SDF:

- Outline, Shadow, Glow als Shader-Uniforms (kein zweiter Draw Call)
- Weicheres Scaling (SDF skaliert besser als Rohpixel)
- R8-Atlas statt RGBA — 75% weniger GPU-Speicher
- `outlineColor`/`outlineWidth` auf `TextStyle` bereits vorhanden, können
  sofort verdrahtet werden

### Integration: `tiny-sdf`

`tiny-sdf` (3 KB, zero dependencies) implementiert den EDT-Algorithmus
(Euclidean Distance Transform) der aus einem Bitmap-Pixel-Alpha-Array ein
R8-SDF erzeugt.

```ts
import TinySdf from 'tiny-sdf';

// Einmal pro Atlas-Variante erstellen
const sdf = new TinySdf({
  fontSize: size,
  fontFamily: family,
  fontWeight: weight,
  fontStyle: style,
  buffer: SDF_RADIUS,   // Pixel-Abstand den das SDF nach außen kodiert
  radius: SDF_RADIUS,   // muss >= maxShadowOffset + maxOutlineWidth
  cutoff: 0.25,
});

const { data, width, height } = sdf.draw(char);
// data: Uint8ClampedArray mit R8-Werten
// In Atlas-Slot schreiben via ctx.putImageData() oder direkt als R8-Textur
```

**`SDF_RADIUS`** bestimmt den maximalen Outline/Shadow-Bereich. Default: `8px`.
Für große Outlines oder Shadows muss er erhöht werden (konfigurierbar).

### AtlasPage-Änderungen

`AtlasPage` bekommt eine `mode`-Eigenschaft: `'sdf' | 'msdf' | 'color'`.

```ts
// Neues Textur-Format für SDF-Seiten:
this.texture = new Texture(canvas, { format: 'r8' });
```

`GlyphAtlas` legt bei Konstruktion den Modus fest. `GlyphAtlasPool` erstellt
SDF-Atlanten für normale DynamicText-Nodes, RGBA-Atlanten für `colorGlyphs`.

---

## TextStyle — neue Properties

Zusätzlich zu den bestehenden `outlineColor`/`outlineWidth`:

```ts
export interface TextStyleOptions {
  // ... bestehende Properties ...

  // Shadow (tint-Hint, nur Shader-Update)
  shadowColor?:   Color;
  shadowOffsetX?: number;  // Pixel
  shadowOffsetY?: number;
  shadowAlpha?:   number;  // 0..1, default 0 (kein Shadow)
  shadowBlur?:    number;  // Weichheit, default 0

  // Gradient (tint-Hint)
  gradientColors?: [Color, Color];  // [oben, unten], null = kein Gradient
  gradientAxis?:   'vertical' | 'horizontal';  // default 'vertical'
}
```

**Hint-Zuordnung:** Alle Shadow- und Gradient-Properties → `'tint'` (kein
Atlas-Rebuild, nur Shader-Uniform-Update).

**Wichtig:** `shadowOffsetX/Y` und `shadowBlur` bestimmen ob `SDF_RADIUS` bei
der Atlas-Erstellung ausreicht. Wird der Shadow-Offset größer als `SDF_RADIUS`,
wird der Atlas-Key mit dem Radius invalidiert und der Glyph neu gerastert.

---

## BMFont-Parser

Liest das AngelCode `.fnt` Textformat (nicht XML) und gibt `BmFontData` zurück.

```ts
// src/resources/BmFontFactory.ts
export class BmFontFactory extends AbstractAssetFactory<BmFontData> {
  public readonly type = BmFontData;

  public async load(config: AssetConfig, ctx: LoaderContext): Promise<BmFontData> {
    const raw = await ctx.fetchText(config.source);
    return parseBmFontText(raw);
  }
}

function parseBmFontText(text: string): BmFontData {
  // Jede Zeile parsen: "tag key=value key=value ..."
  // Unterstützte Tags: info, common, page, chars, char, kernings, kerning
}
```

**Hilfsfunktionen** für das Parsen von `key=value`-Paaren:
```ts
function int(line: string, key: string): number
function str(line: string, key: string): string  // strips quotes
```

Die Textur-Pages werden **separat** geladen — der Nutzer übergibt sie dem
`BitmapText`-Konstruktor. Optional kann eine `BmFontBundle`-Factory beide
Schritte kapseln.

---

## Renderer-Architektur: TextRenderer + TextBatch

### Motivation

Aktuell: DynamicText erstellt `Mesh`-Kinder → generischer Mesh-Renderer → ein
Draw Call pro Node. Mit TextRenderer: alle Nodes einer Batch-Gruppe → ein
Instanced Draw Call.

### TextBatch

```
TextBatch (pro Shader-Variante × AtlasPage)
├── Vertex Buffer: [x, y, uvX, uvY] × 4 Vertices × N Glyphen
├── Instance Buffer: [worldMatrix4x4, tintR, tintG, tintB, tintA] × N Nodes
└── → ein drawIndexed(instanced) Call
```

Jedes Glyph-Quad kennt seine Node-Instanz-ID. World-Transforms gehen als
Matrix-Attribut per Instance in den Vertex-Shader.

### TextRenderer

```ts
class TextRenderer {
  // Sammelt alle sichtbaren Text-Nodes im Scene Graph
  public collect(root: RenderNode): void;

  // Baut Batches und emittiert Draw Calls
  public flush(backend: RenderBackend): void;
}
```

**Batch-Kriterien:**

```
Batch-Key = ShaderVariant + AtlasPage-Texture-ID
```

Alle DynamicText-Nodes, die dieselbe Atlas-Page referenzieren, landen in einem
Batch. Page-Index geht als Vertex-Attribut in den Shader (bereits im spec v1
für TEXTURE_2D_ARRAY vorgesehen).

### Integration in den Render-Loop

`DynamicText.render(backend)` registriert sich beim `TextRenderer` statt direkt
zu rendern:

```ts
public override render(backend: RenderBackend): void {
  backend.textRenderer.submit(this);
}
```

`backend.flush()` ruft am Ende `textRenderer.flush(backend)` auf.

**DynamicText hat keine `Mesh`-Kinder mehr** — die Quad-Daten werden intern
als Float32Arrays gehalten und dem TextRenderer übergeben.

---

## Emoji / Color Fonts

Opt-in via `DynamicText`-Konstruktor:

```ts
new DynamicText('👋 Hello', { colorGlyphs: true });
```

Wenn `colorGlyphs: true`:
- `AtlasPage` nutzt `mode: 'color'` (RGBA, weißer fillStyle wird nicht gesetzt)
- Atlas-Key-Präfix: `color:${family}:...`
- Shader-Variante: `text-color`
- Kein SDF, kein Tinting, kein Outline/Shadow

**Gemischter Text** (normale Zeichen + Emoji in einem Node) erfordert zwei
getrennte Pässe — ein DynamicText-Node kann nicht beide Modi gleichzeitig
nutzen. Entweder `colorGlyphs: true` für den ganzen Node, oder Emoji in einem
separaten Node neben normalem Text.

---

## Layout-Features (nachgeholt)

Alle reine Layout-Änderungen in `TextLayout.ts` + `LayoutOptions`/`TextStyle`.
Gelten für DynamicText **und** BitmapText identisch.

### `justify` Alignment

Gleichmäßige Streckung des Wortabstands auf `maxLineWidth`:

```ts
// Pass 2 in layoutText():
if (align === 'justify' && !isLastLine) {
  const gaps = wordCount - 1;
  const extraPerGap = (maxLineWidth - lineWidth) / gaps;
  // Wort-Positionen mit extraPerGap anpassen
}
```

### `leading`

Zusätzlicher Pixel-Abstand zwischen Zeilen (additiv zu `lineHeight`):

```ts
// In TextStyleOptions / TextStyle
leading?: number;  // default 0, Layout-Hint

// In layoutText():
const lineStep = fontSize * lineHeight + style.leading;
```

### `breakWords`

Wenn ein einzelnes Wort breiter als `maxWidth` ist, zeichenweise umbrechen:

```ts
// In _wrapLine():
if (wordWidth > maxWidth) {
  // Zeichen für Zeichen in aktuelle Zeile füllen
}
```

### `whiteSpace`

```ts
// In LayoutOptions
whiteSpace?: 'normal' | 'pre' | 'pre-line';
// 'normal':   Mehrfach-Spaces kollabieren, \n wird Leerzeichen (default bei wordWrap)
// 'pre':      Alles exakt wie im String (Spaces + \n erhalten)
// 'pre-line': Spaces kollabieren, \n bleibt erhalten (aktuelles Verhalten)
```

Implementierung: Text-Preprocessing vor dem Layout-Pass.

---

## Implementierungsreihenfolge

1. **Layout-Features** — `justify`, `leading`, `breakWords`, `whiteSpace`
   _Keine Renderer-Abhängigkeit, sofort testbar_

2. **TextStyle Shadow-Properties** — `shadowColor`, `shadowOffsetX/Y`,
   `shadowAlpha`, `shadowBlur`, `gradientColors`
   _Nur Datenmodell + Hints, noch kein Shader_

3. **`tiny-sdf` Integration** — `AtlasPage` schreibt R8-SDF statt RGBA-weiß
   _`GlyphAtlas` bekommt `mode`-Parameter_

4. **`text-sdf` Shader** — WebGL2 + WebGPU Implementierung
   _Verdrahtet: outlineColor/Width, shadowColor/Offset, gradient_

5. **DynamicText auf neuen Shader umstellen** — kein Mesh-Kind mehr,
   eigener Render-Pfad der `text-sdf` nutzt

6. **BMFont-Parser** — `BmFontFactory` + `parseBmFontText()`

7. **`text-msdf` Shader** — BitmapText auf MSDF-Renderer umstellen

8. **`text-color` Shader + Emoji-Pfad** — `colorGlyphs: true`

9. **TextRenderer + TextBatch** — Instanced Batching für alle drei Varianten
   _Größter Aufwand, größter Performance-Gewinn_

---

## Explizit nicht im Scope dieser Spec

| Feature | Begründung |
|---|---|
| RTL / BiDi | Eigener Spec, erfordert Unicode-Bidi-Algorithmus |
| Ligatures / OpenType-Shaping | Erfordert HarfBuzz-WASM |
| Runtime-MSDF via opentype.js + WASM | ~2-3 Wochen, eigener Scope |
| Atlas-LRU-Eviction | Dokumentiertes Limit bleibt bestehen |
| Vertikaler Text | Eigener Spec |
| `HTMLText` (SVG/foreignObject) | Eigener Scope |
| Inline Rich Text (fett/kursiv innerhalb eines Strings) | Eigener Scope |
| SDF `radius` zur Laufzeit ändern | Erfordert Atlas-Invalidierung |
| Variable Fonts (`font-variation-settings`) | Canvas 2D handhabt es, kein ExoJS-API nötig |

---

## Abhängigkeiten

| Paket | Zweck | Größe |
|---|---|---|
| `tiny-sdf` | Bitmap → R8-SDF Konvertierung | ~3 KB |

Keine weiteren externen Abhängigkeiten. `msdf-atlas-gen` ist ein Offline-
Build-Tool und landet nicht im Bundle.

---

## Offene Fragen / Entscheidungen vor der Implementierung

1. **SDF_RADIUS als globale Konstante oder pro-Atlas konfigurierbar?**
   Empfehlung: globale Konstante `8` mit Export für Nutzer die größere
   Shadows brauchen.

2. **TextRenderer im RenderBackend oder als Scene-Graph-Pass?**
   Empfehlung: Als separater Render-Pass den der RenderBackend nach dem
   normalen Scene-Pass ausführt — analog zu Particles.

3. **BmFontBundle-Factory** (lädt .fnt + Texturen in einem Schritt)?
   Empfehlung: Ja, als convenience wrapper. Kern-Parser bleibt separat.

4. **Gradient-Achse world-space oder UV-space?**
   UV-space ist einfacher (kein Transform-Uniform nötig), aber Gradient
   rotiert mit dem Node. World-space braucht die inverse Node-Matrix im
   Shader. Empfehlung: UV-space als V1, world-space optional later.
