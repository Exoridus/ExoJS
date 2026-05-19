# ExoJS Final Maintainer Synthesis — Pre-v0.9.0 API/Product Review

**Datum**: 2026-05-16  
**Eingaben**: drei unabhängige Reviews (DeepSeek, Opus, Codex) · Cross-Review-Synthese · Faktual-Verifikation · Bugfix-Kontext `2a64088` · DeepSeek↔Codex Cross-Examination

---

## 1. Executive verdict

**ExoJS ist auf dem richtigen Kurs.** Die Identität — explizite Rendering-Orchestrierung, klassenbasierter Lifecycle, typisiertes Resource-Loading, strukturelle Ehrlichkeit — ist durch den gesamten 0.8.x-Zyklus intakt geblieben. Kein einziger der drei unabhängigen Reviewer hat eine Neudefinition der Architektur gefordert. BeatDetector ist eine echte kategoriestiftende Differenzierung. Die Render-Pipeline ist korrekt und ehrlich. Das Guide ist vollständig.

**v0.9.0 ist nah, aber nicht das erste nächste Ziel.** Ein fokussierter 0.8.5-Release sollte zuerst kommen — mit addierten DX-Gewinnen und einem gezielten Breaking-Change-Kandidaten (der unten entschieden wird). Danach ist 0.9.0 ein klar umrissener API-Konsolidierungs-Release, keine weitere Feature-Welle.

**Der niedrige externe Nutzungsdruck verändert die Empfehlung erheblich.** Bei praktisch null echten externen Nutzern, die auf die Public API aufgebaut haben, ist die verbleibende Migrationseinschränkung rein intern: Implementierungsaufwand, Beispielaktualisierungen, Guide-Anpassung, Testsuite. Das senkt die Hürde für sinnvolle Breaking API-Verbesserungen auf ihren realen Boden — und einige Fragen, die in den Cross-Examination-Reports aus Vorsicht konservativ beantwortet wurden, sollten hier unter diesem Gesichtspunkt neu bewertet werden.

**Ob eine Beschleunigung oder Verlangsamung von v0.9.0 sinnvoll ist:** Weder noch. Eine fokussierte 0.8.5-Release zuerst, dann 0.9.0. Der Pfad ist klar; er muss nur gegangen werden.

---

## 2. Was jetzt fest entschieden ist

Nach drei unabhängigen Reviews, der Cross-Synthese, der faktischen Verifikation, dem Bugfix und der Cross-Examination:

### Gelöste Faktenfragen

| Behauptung | Entscheidung |
|---|---|
| `SceneNode extends Transformable` ist noch offen | **Falsch.** Gelöst in 0.5.0. `SceneNode` implementiert `Collidable`; Transform-State ist inline. DeepSeeks Behauptung war ein Misread historischer Review-Dokumente gegen aktuellen Source. |
| `SceneNode.render()` No-op existiert noch | **Falsch.** Gelöst in 0.5.0. `render()` liegt nur auf `RenderNode` und dessen Subklassen. |
| `Scene.handleInput` Konsumierungs-Kontrakt war invertiert | **Wahr — und ist nun behoben.** Der Runtime-Branch in `SceneManager.ts:464-467` bricht Propagation bei `handled === false`, während Docs/JSDoc `return true` als Konsumierung definieren. Commit `2a64088` hat den Runtime mit dem dokumentierten Kontrakt aligniert: `true` konsumiert, nicht-`true` propagiert in Passthrough-Modus. |
| Cross-Synthesis-Tippfehler „Codex and Opus should be the adversaries" | **Tippfehler.** Gemeint war „Codex and DeepSeek." Der Kontext der umgebenden Begründung bestätigt dies eindeutig. |

### Fest entschiedene „Nicht verfolgen"-Items

Die folgenden Topics werden aus allen zukünftigen Roadmap-Diskussionen gestrichen:

- **`SceneNode extends Transformable`-Refactoring** — bereits erledigt.
- **`SceneNode.render()` No-op-Entfernung** — bereits erledigt.
- **`AudioManager`-Eigentumsrefactoring (pre-0.9)** — `app.audio` existiert bereits und bietet die konsistente `app.*`-Oberfläche. Die Singleton-Implementierung spiegelt die Browser-Realität (ein AudioContext pro Seite) wider. Kein user-sichtbares Problem.
- **`draw`/`render`-Verb-Vereinheitlichung als Breaking Change** — beide Cross-Examination-Reports haben dies unabhängig abgelehnt. `draw` ist die Orchestrierungsphase des Users; `render` ist die Submission-Methode auf Render-Nodes. Der User schreibt `Scene.draw()` und ruft `this.root.render(backend)` auf — zwei verschiedene Abstraktionsebenen. Ein Rename bringt marginalen Gewinn bei erheblichen Kosten (Guide-Updates, Migration). Als interne Contributor-Richtlinie dokumentieren, aber kein User-facing Breaking Change.
- **`Sprite.tween()` / `View.tween()` / `Filter.tween()`-Integration pre-0.9** — beide Cross-Examination-Reports haben dies zurückgestuft. DeepSeek hat explizit revidiert. Das Guide zeigt Tweens, die gut auf Raw-Properties funktionieren. Kein demonstrierter Schmerz, der neue Oberfläche auf drei verschiedenen Typen rechtfertigt.
- **`CollisionWorld` in Core** — Codex und DeepSeek (nach Revision) sind einig: Detection-first in Core ist die korrekte Grenze. Collision-Response gehört in Extras/separates Paket.
- **Vollständige Render-Architektur-Überarbeitung (RenderInstructions/Batching) pre-0.9** — interne Engine-Evolution, post-0.9.0.
- **Networking, 3D-Meshes, Pathfinding als Core** — unverändert: alle drei Reviews, 3/3 Ablehnung, keine weitere Diskussion notwendig.

### Fest entschiedene strategische Schlussfolgerungen

- **BeatDetector bleibt in Core.** Kein anderes Browser-2D-Runtime hat ein Äquivalent. 3/3-Konsens.
- **Partikel bleiben in Core.** Die Integration ist zu tief, um zu trennen. 3/3-Konsens.
- **Das Loader-Typ-Token-Modell wird nicht ersetzt.** `loader.get(Texture, 'hero')` ist ein Feature, keine Einschränkung. Ergonomische Schichten sind additiv. 3/3-Konsens.
- **Der Lifecycle-Kontrakt der Scene ist stabil.** `load → init → update → draw → handleInput → unload → destroy` wird nicht berührt.
- **Dual-Backend wird nicht gesplittet.** WebGL2 und WebGPU bleiben co-equal-Targets bis ein konkreter Browser-Coverage-Schwellwert benannt wird.
- **Der `./debug`-Subpfad ist das richtige Modell für optionale Tooling-Subpfade.**

---

## 3. Was aus der Roadmap-Diskussion gestrichen werden sollte

Die folgenden Topics sollten keine weitere Entscheidungsenergie verbrauchen:

1. `SceneNode extends Transformable` — gelöst, nicht wieder öffnen
2. `SceneNode.render()` No-op — gelöst, nicht wieder öffnen
3. `AudioManager`-Singleton-Refactoring — kein user-sichtbares Problem, `app.audio` existiert
4. `draw`/`render`-Verb-Rename als User-facing Breaking Change — Contributor-Dokumentation, kein API-Break
5. `Sprite.tween()` / `View.tween()` / `Filter.tween()` pre-0.9 — kein demonstrierter Schmerz, zuviel neue Oberfläche
6. `CollisionWorld` als Core-Addition — Extras/separates Paket ist der richtige Ort
7. Networking / 3D-Meshes / Pathfinding als Core — permanent abgelehnt
8. WASM-Audio-Beschleunigung pre-0.9 — Extras/post-0.9
9. Microphone-First-Class-Capture-Helpers pre-0.9 — aktuelle `MediaStream`-Duck-Typing genügt
10. RenderInstructions/Batching pre-0.9 — interne Engine-Optimierung, post-0.9.0
11. Profiling/Chrome DevTools tiefe Integration — Tooling-Arbeit, nicht API-Concern

---

## 4. Neuformulierung unter niedrigen Migrationskosten

### Warum dieser Moment der richtige ist

Bevor eine externe Nutzerbasis auf Public API aufbaut, ist das reale Gewicht eines Breaking Change:

- Implementierungsaufwand (Tage bis Wochen, je nach Komplexität)
- Guide-Kapitel aktualisieren
- Beispiele anpassen
- Testsuite anpassen
- Konzeptuelle Kohärenz sicherstellen

Das sind echte Kosten — aber handhabbare. Was dagegen nach 1.0 hinzukommt: tausende Nutzer-Codebases, Blogbeiträge mit falschem API-Muster, Forks mit Workarounds, ein Ökosystem, das sich um das alte Design kristallisiert. Die jetzige Migrationsschuld ist rein intern.

Diese Phase ist genau der Moment, in dem API-Entscheidungen mit dem günstigsten Verhältnis von Qualitätsgewinn zu Migrationskosten getroffen werden sollten.

### Welche Breaking Changes jetzt gerechtfertigt sind

Gerechtfertigt, wenn:
- Der Gewinn an langfristiger API-Klarheit, Korrektheit oder Konsistenz real ist
- Das Problem sich nachweislich in Docs, Bugs oder Nutzerverwirrung manifestiert hat
- Die Alternative (die aktuelle Form) bekannte semantische Schwächen hat

Nicht gerechtfertigt, wenn:
- Es reine kosmetische Umbenennung ohne semantischen Gewinn ist
- Es eine spekulative Verbesserung ohne evidenzbasierte Nutzerfriction ist
- Es Designpräferenz ist, die kein nachweisbares Problem löst

### Wie dies die Empfehlungen verändert

Die Cross-Examination-Reports haben in drei Fällen konservative Empfehlungen abgegeben, die unter niedrigen Migrationskosten neu bewertet werden müssen:

1. **Scene Input Propagation API** — beide Reports empfahlen Option A (boolean behalten). Die Begründung war teils implizit migrationsgetrieben. Das sollte unter dem neuen Gesichtspunkt aktiv neu bewertet werden (siehe §5.1).

2. **ApplicationOptions-Gruppierung** — Codex hat das nicht stark adressiert; DeepSeek wollte es, aber das Cross-Examination-Ergebnis war nicht eindeutig. Unter niedrigen Migrationskosten: dieses ist der erste API-Kontakt jedes neuen Nutzers und verdient eine klare Entscheidung (siehe §5.2).

3. **Fluent-Policy** — wurde nicht gezielt als Entscheidungsfrage eingebracht. Unter niedrigen Migrationskosten ist jetzt der Moment für eine explizite Richtlinie (siehe §5.4).

---

## 5. Offene API/Design-Entscheidungen vor der Implementierung

Dies ist die wichtigste Sektion. Diese Topics benötigen einen gezielten Design-Pass, bevor Implementierungsarbeit beginnt.

---

### 5.1 Scene Input Propagation API

**Warum es wichtig ist:** Das boolean-Return-Muster hat bereits einen echten Runtime/Docs-Inversionsbug verursacht. Ein Bug, der durch ein inhärentes Designmerkmal (Return-Value als implizites Signal) begünstigt wird, ist ein Warnsignal über die Langlebigkeit des Designs. Unter niedrigen Migrationskosten ist das der Moment, dies zu überdenken.

**Optionen:**

**Option A — Fixed Boolean (`return true` = konsumiert):**
```ts
handleInput(event: SceneInputEvent): boolean | void {
  // return true; // konsumiert
}
```
- Status quo nach Bugfix. Semantisch klar gemäß Docs.
- Problem: `return true` kann versehentlich aus jedem beliebigen Ausdruck kommen. Arrow-Function-Bodies, Ternaries, und Destrukturierungsmuster können `true` zurückgeben ohne Konsumierungsabsicht.
- Problem: semantische Inkonsistenz mit `Signal.dispatch()` (dort `return false` = Stop). Unterschiedliche Domänen, aber verwirrend für neue Nutzer, die beide Muster begegnen.
- Der Inversionsbug war genau der Typ stiller semantischer Fehler, den boolean-Return-Values begünstigen.

**Option B — `false = stop` (Signal-Konsistenz):**
- Direkter Bruch unmittelbar nach dem Bugfix — maximale Verwirrung.
- Abgelehnt. Kein weiterer Bedarf, das zu evaluieren.

**Option C — Explizite Event-basierte Konsumierung:**
```ts
handleInput(event: SceneInputEvent): void {
  if (shouldConsume) {
    event.consume(); // oder event.stopPropagation()
  }
}
```
- DOM-Familiarität: jeder JS/TS-Entwickler kennt `event.stopPropagation()`.
- Unambiguos: keine versehentlichen Return-Values.
- Erweiterbar: `event.stopImmediatePropagation()` o.ä. könnte später addiert werden.
- Der Bug-Mechanismus (versehentliches Return als Konsumierungssignal) wird strukturell unmöglich.
- Implementierung: `SceneInputEvent`-Union braucht ein `_consumed`-Flag-Property.
- Migrationsweg: additiv zuerst (0.8.5: beide `event.consume()` UND `return true` funktionieren), dann boolean in 0.9.0 entfernen.

**Empfehlung: Option C — vor 0.9.0 verfolgen.**

Begründung: Der boolean-Return-Inversionsbug war nicht ein zufälliger Implementierungsfehler — er ist genau der Typ Fehler, der durch implizite Return-Value-Signale entsteht. Das semantische Problem ist inhärent im Design, nicht nur in der Implementierung. Unter niedrigen Migrationskosten ist das der richtige Moment, diesen Schwachpunkt zu schließen, bevor er in API-Stabilisierung eingefroren wird. `event.consume()` ist DOM-vertraut, präzise und erweiterbar.

Implementierungsplan: 0.8.5 addiert `event.consume()` als erste Wahl, behält `return true` als deprecated-Fallback mit Dev-Mode-Warning. 0.9.0 entfernt den boolean-Return-Path.

**Breaking?** Ja — aber zu zweit phasiert (additiv in 0.8.5, Removal in 0.9.0). Keine externen Nutzer. Interner Migrations-Aufwand: Guide, Beispiele, Tests — überschaubar.

**Sollte jetzt entschieden werden?** Ja — dies ist eine sofortige Designentscheidung vor 0.8.5-Implementierung.

---

### 5.2 ApplicationOptions-Struktur

**Warum es wichtig ist:** `ApplicationOptions` ist der erste API-Kontakt jedes neuen Nutzers. Die aktuelle Flat-Struktur mit 16 gemischten Feldern (Renderer-Internals, Loader-Config, Input-Config, Canvas-Config) sendet das falsche erste Signal über ExoJS's „structured, clear boundaries"-Identität.

**Optionen:**

**Option A — Flat-Struktur behalten:**
Aktueller Zustand. Kein Migrationsaufwand.
- Problem: Mit steigender Feature-Dichte wird der Flattening-Effekt schlimmer. Neue Subsystem-Optionen landen ohne Struktur.
- Problem: Mangelnde Discoverability — TypeScript-Autocomplete zeigt 16 gleichwertige Felder ohne konzeptuelle Gruppierung.
- Problem: Widerspricht der „strukturierten Grenzen"-Identität.

**Option B — Subsystem-Gruppierung:**
```ts
interface ApplicationOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  clearColor?: Color;
  debug?: boolean;
  backend?: BackendConfig;
  rendering?: {
    spriteBatchSize?: number;
    particleBatchSize?: number;
    webglAttributes?: WebGLContextAttributes;
  };
  loading?: {
    resourcePath?: string;
    requestOptions?: RequestInit;
    cache?: CacheStore | readonly CacheStore[];
  };
  input?: {
    gamepadDefinitions?: GamepadDefinition[];
    gamepadSlotStrategy?: GamepadSlotStrategy;
    pointerDistanceThreshold?: number;
  };
}
```
- Klar strukturiert, Subsystem-Grenzen sichtbar
- Einfache Apps bleiben kurz (nur `canvas`, `width`, `height`)
- Autocomplete zeigt Subsystem-Gruppen, nicht 16 gleichwertige Felder
- Zukünftige Optionen landen in der richtigen Gruppe, nicht im flachen Namespace

**Empfehlung: Option B — vor 0.9.0 verfolgen.**

Begründung: Dies ist ein „jetzt oder nach 1.0 nie mehr"-Entscheid. Unter niedrigen Migrationskosten ist der Aufwand rein intern: Application-Konstruktor, Defaults-Merge-Logik, Guide-Snippets, Beispiele anpassen. Der Gewinn ist langfristiger API-Qualität und Skalierbarkeit. Ein 16-Felder-Flat-Object ist heute noch handhabbar; bei 25 Feldern nach weiteren 0.9.x-Releases wird es unangenehm.

**Breaking?** Ja — Nutzer, die `gamepadDefinitions: [...]` direkt auf dem Top-Level setzen, müssen auf `input: { gamepadDefinitions: [...] }` migrieren. Interner Aufwand überschaubar.

**Sollte jetzt entschieden werden?** Ja — der genaue Schnitt der Gruppen muss vor der Implementierung festgelegt sein. Besonders: gehört `backend` (BackendConfig) in `rendering` oder bleibt es Top-Level?

---

### 5.3 Loader / Asset Ergonomics

**Warum es wichtig ist:** `loader.get(Texture, 'hero')` an jedem Konstruktions-Call-Site ist nachweislich die häufigste DX-Friction — in Beispielen, Guide-Kapiteln, Recipes. 3/3 Reviews identifizieren das als echten Schmerz. Die Docs zeigen außerdem einen veralteten Manifest-API-Shape.

**Was sofort getan werden muss (keine Designentscheidung):**
- Das veraltete Manifest-Snippet im Guide (`loading-and-resources.mdx:118-135`) auf den aktuellen API-Shape aus `AssetManifest.ts:24-26` korrigieren. Das ist eine Korrektheitspflicht, keine Ergonomie-Frage.

**Designentscheidung: welche Ergonomie-Schicht(en):**

Nach Cross-Examination-Konvergenz sind drei Ansätze diskutiert worden:

1. **Manifest-derived typed accessor** (DeepSeek, Codex): Die Manifest-Definition gibt bereits den Typ-Alias-Zusammenhang vor. `loader.registerManifest(manifest)` sollte ein typisiertes Accessor-Objekt zurückgeben.

   ```ts
   const assets = await loader.loadBundle('main');
   assets.texture('hero')  // → Texture (typisiert aus Manifest-Inferenz)
   assets.sound('bg')      // → Sound
   ```

2. **Consumer-side factory** (Opus): `Sprite.from(loader, 'hero')` — statische Factory auf dem Drawable-Typ.

3. **Beide als komplementäre Schichten:** Der Accessor löst das "gib mir alles aus dem Manifest"-Pattern. Die Factory löst das "gib mir genau dieses eine"-Pattern.

**Empfehlung:**

Primäre Investition: **Manifest-derived typed accessor** (Ansatz 1). Das ist die Schicht, die das strukturelle Repetitions-Problem löst — das Typ-Token muss nicht mehr an jedem Call-Site wiederholt werden, weil der Manifest es bereits kodiert.

Sekundäre Schicht: **Consumer-side factory** (Ansatz 2) ist komplementär und kann später addiert werden. `Sprite.from(loader, 'hero')` ist der Ultra-Convenience-Pfad für den Einzel-Asset-Fall. Nicht Priorität 1.

**Bleibt unberührt:** `loader.get(Texture, 'alias')` bleibt der explizite Canonical-Pfad für Cases, wo der Nutzer den Typ manuell kontrollieren will.

**Breaking?** Nein — rein additiv.

**Sollte jetzt entschieden werden?** Das genaue Accessor-API-Shape (Return-Typ von `loadBundle`/`registerManifest`, TypeScript-Inferenz-Strategie) muss vor der Implementierung definiert sein. Spezifisch: ob der Accessor TypeScript-Generics oder Runtime-Dispatch nutzt, und welche Manifest-Typisierung nötig ist, um typsichere Rückgaben zu ermöglichen.

---

### 5.4 Fluent `return this`-Policy

**Warum es wichtig ist:** Aktuell gibt es keine konsistente Regel. ~40% der Setter/Mutator-Methoden geben `this` zurück; der Rest gibt `void` zurück. Tween ist vollständig fluent; Scene-Graph-Methoden sind teilweise fluent; Filter-Methoden sind nicht fluent. Keine dieser Entscheidungen ist dokumentiert.

**Optionen:**

**Option A — Ad-hoc weiter (Status quo):** Keine Änderung. Inkonsistenz bleibt.

**Option B — Breite Standardisierung (alle Mutators fluent):** Maximale Chaining-Ergonomie überall. Problem: erzeugt falsche Erwartungen für Methoden, bei denen Chaining kein sinnvolles Nutzungsmuster ist.

**Option C — Tier-basierte Policy (Empfehlung):**

| Tier | Fluent? | Begründung |
|------|---------|-----------|
| **Tween-System** | Ja — vollständig | Builder-Pattern ist intrinsisch; Chaining ist das Design |
| **View-Helfer** (`follow`, `shake`, `setBounds`, etc.) | Ja | `view.follow(target).shake(5, 200)` ist echte Ergonomie |
| **Filter-Methoden** (`addFilter`, `removeFilter`, `clearFilters`, `setFilters`) | Ja — **ergänzen** | `sprite.addFilter(blur).addFilter(glow)` ist genuiner Use Case; aktuell fehlt das |
| **SceneNode/Container Scene-Graph-Methoden** (`addChild`, `removeChild`, `addChildAt`) | Nein — **entfernen** | Guide, Recipes und Beispiele chainen diese nie; `return this` ist toter Code mit falscher Affordance |
| **Application-Level-Methoden** (`start`, `pause`, `resume`) | Nein | Lifecycle-Methoden, kein Chaining-Muster |
| **Scene-Lifecycle-Methoden** (`update`, `draw`, `handleInput`) | Nein | Framework-Callbacks, kein Chaining-Muster |

Explizite Dokumentation mit `@returns this` und kurzem Hinweis, wo Chaining intentional ist.

**Breaking?** Entfernen von `return this` aus Scene-Graph-Methoden ist technisch breaking — aber kein existierender Guide-Code, kein Beispiel und kein Recipe chainiert diese Methoden. Die praktische Breakage ist null.

Hinzufügen von `return this` zu Filter-Methoden ist nicht breaking.

**Sollte jetzt entschieden werden?** Ja — ein kurzer Entscheidungspass. Die Policy ist einfach; die Implementierung ist mechanisch. Kein langer Design-Dokument-Prozess nötig, aber eine dokumentierte Entscheidung vor der Implementierung.

---

### 5.5 Tween-Polish / `chain()` / `Scene.tweens`

**Was nach Cross-Examination konvergiert ist:**

Beide Cross-Examination-Reports sind auf dieselbe enge Scope-Empfehlung konvergiert (DeepSeek hat seine ursprüngliche „volle Integration"-Position revidiert):

1. **`chain()`-Ergonomie-Fix** — ein konkreter, dokumentierter Trap. `chain()` gibt das nächste Tween zurück, nicht `this`. `fadeIn.chain(fadeOut).start()` startet `fadeOut`, nicht `fadeIn`. Das Guide dokumentiert diese Falle explizit — was bedeutet: es ist bekannt, und trotzdem bleibt es ein Trap.

2. **`Scene.tweens`-Shortcut** — anallog zu `Scene.inputs` (das auto-disposed Input-Bindings on Scene-Unload). Tweens, die in einer Scene gestartet werden, sollten automatisch gestoppt werden, wenn die Scene entladen wird. Aktuell muss das der Nutzer manuell handhaben.

3. **`Sprite.tween()` etc. — defer.** Kein demonstrierter Schmerz, der neue Oberfläche auf drei verschiedenen Typen rechtfertigt. Post-0.9.0.

**`chain()`-Fix-Optionen:**

- **`TweenManager.sequence([t1, t2, t3])`**: Sauberste API. Nimmt eine Liste von Tweens und startet sie sequentiell. Keine Verhaltensänderung an `chain()`. Additive Alternative mit nicht-überraschendem Verhalten.
- **`tween.then(nextTween): this`**: Gibt `this` zurück statt `next`. Additiv neben `chain()`. Einfacher, aber ähnlicher Name wie Promise-`then()` — potenziell verwirrend.

**Empfehlung:** `TweenManager.sequence([...])` — sauberere Semantik, kein Namenskonflikt, klar abgegrenzt von `chain()`.

**Breaking?** Nein — rein additiv. `chain()` bleibt wie es ist; `sequence()` ist die ergonomische Alternative.

**Sollte jetzt entschieden werden?** Ja — die Wahl zwischen `sequence()` und `then()` ist eine kurze Entscheidung. Die Policy (`Scene.tweens` analog zu `Scene.inputs`) ist unkontrovers.

---

## 6. Vorgeschlagener Versions-Roadmap

### Bereits erledigt nach v0.8.4

- Vollständiges englisches Guide
- Redaktionelle Konsistenz-Pass
- Source/API-Verifikation der Guide-Kapitel
- Release-Note-Automation
- Starke Docs/Site-Baseline
- **`handleInput` Konsumierungs-Kontrakt-Bugfix** (Commit `2a64088`)

### Nächster fokussierter 0.8.x-Release (0.8.5)

DX-Gewinne plus der Grundstein für 0.9.0-Breaking-Changes.

**Muss enthalten:**
- Manifest-Docs-Korrektur (stale API-Shape im Guide)
- `event.consume()` additiv implementieren (neben bestehendem `return true`, mit Dev-Mode-Deprecation-Hint) ← Design-Entscheidung 5.1 muss zuerst fallen
- Scene-Stacking-Preset-Konstanten (`ScenePresets.hud`, `ScenePresets.pauseMenu`, `ScenePresets.modal` etc.)
- Manifest-derived typed asset accessor (Accessor-Design muss zuerst festgelegt werden) ← Design-Entscheidung 5.3
- `View.screenToWorld()` / `View.worldToScreen()` Helfer
- `TextLayout.measure(text, style): { width, height }` Implementierung
- `Scene.tweens` Auto-dispose-Shortcut (analog zu `Scene.inputs`)
- Filter-Methoden fluent machen (`addFilter`, `removeFilter`, `clearFilters`, `setFilters` → `return this`)
- `Text.ready: Promise<void>` für Font-Bereitschaft

**Starke Kandidaten:**
- `Scene.root` Dev-Mode-Warning wenn Kinder vorhanden aber `render()` nicht aufgerufen
- Async `update`/`draw` Dev-Mode-Warning wenn Promise zurückgegeben wird
- `TweenManager.sequence([...])` Helfer
- Audio-Worklet-Source-Extraktion (643-Zeilen-Inline-JS-String → separate Datei)
- Skew-Transforms (`skewX`/`skewY` auf SceneNode)
- Verbesserte `loader.get`-Fehlermeldungen (Alias + Cache-State-Hinweis)
- Example-Descriptions-Cleanup (machine-generated → manuell)

**Optional wenn geringer Risiko:**
- Blend-Mode-Erweiterung (Overlay, HardLight, Difference)
- `ApplicationOptions`-Subsystem-Gruppierung — wenn Design-Entscheidung 5.2 früh fällt, könnte es in 0.8.5 landen; ansonsten geht es in 0.9.0

**Items, die warten müssen:** Alle, die von Design-Entscheidungs-Passes abhängen, die noch nicht stattgefunden haben (siehe §10).

### Optionaler zweiter pre-v0.9-Konsolidierungs-Release (0.8.6), falls nötig

Nur wenn 0.8.5 zu voll wird oder wenn ApplicationOptions-Gruppierung und Loader-Accessor-Design mehr Zeit brauchen als erwartet:
- `ApplicationOptions`-Subsystem-Gruppierung (wenn nicht in 0.8.5)
- Stack-aware Scene-Input-Binding-API (additive Alternative zu `this.inputs` für Pause/HUD-Pattern)
- Fluent-Policy-Cleanup (Entfernen von `return this` aus Scene-Graph-Mutator-Methoden)
- Export-Tiering (JSDoc `@stable` / `@advanced` / `@internal` Tags + CI-Report)

Alternativ landen diese Items direkt in 0.9.0 als erste Akte.

### v0.9.0 (API-Konsolidierung)

Breaking-Change-Batch. Alle für die Lebens-API-Stabilität nötigen Brüche in einem Release.

**Breaking Changes für diesen Release:**
- `ApplicationOptions`-Subsystem-Gruppierung (wenn noch nicht in 0.8.x)
- Entfernung des boolean-Return-Pfads aus `handleInput` (additiv in 0.8.5 eingeführt, hier entfernt)
- Fluent-Policy-Cleanup: Entfernen von `return this` aus Scene-Graph-Mutation-Methoden (Container.addChild, Scene.addChild etc.)
- Export-Tiering-Finalisierung (wenn nicht schon in 0.8.x)

**Additive Fertigstellungen für diesen Release:**
- Scene-Stacking-Vocabulary-Finalisierung (wenn Preset-Konstanten aus 0.8.5 nicht ausreichen, finales Enum-Design)
- Export-Tiering vollständig (alle Root-Exporte mit `@stable`/`@advanced`/`@internal` getaggt + CI-Report)
- Migrations-Guide 0.8.x → 0.9.0

**Nicht enthalten:** Neue Features, neue Subsysteme, Render-Architektur-Änderungen.

### Post-v0.9.0

- Extras-Pakete: Collision-World-Helpers, Tileset-Support, 9-Slice, Pathfinding
- `Sprite.tween()` / `View.tween()` / `Filter.tween()` Convenience-Entry-Points
- Microphone-/Live-Audio-Capture-Helpers
- WASM-Audio-Beschleunigung (BeatDetector Stage 2/3)
- RenderInstructions-Batching-Architektur (interne Engine-Optimierung)
- Playground/Site (1.0-Requirement)
- Große Showcase/Minigame-Beispiele mit polished Assets
- Profiling/Chrome-DevTools-tiefere-Integration

### Extras / Separates Paket-Track

- `@codexo/exojs/extras/collision` — leichte CollisionWorld mit Broadphase-Orchestrierung
- `@codexo/exojs/extras/tileset` — TileMap-Rendering (TMX/Tiled-Support)
- `@codexo/exojs/extras/9slice` — NineSliceSprite als Drawable
- `@codexo/exojs-pathfinding` (separates Paket) — A*/Dijkstra für navmesh/grid
- `@codexo/exojs-networking` (separates Paket, nach 1.0, wenn überhaupt) — WebSocket/WebRTC-Game-State

---

## 7. Kandidaten-Scope für den nächsten fokussierten 0.8.x-Release

### Muss enthalten

| Item | Grund |
|------|-------|
| Manifest-Docs-Korrektur | Korrektheitspflicht; stale API-Shape im Guide verwirrt jeden neuen Nutzer |
| `event.consume()` additiv (handleInput) | Grundstein für 0.9.0-Breaking-Change; muss in 0.8.5 eingeführt werden mit Dev-Mode-Deprecation auf `return true` |
| Scene-Stacking-Preset-Konstanten | Zwei-Achsen-9-Kombinationen-Vokabular ist dokumentierter Schmerz; additive Lösung existiert |
| Manifest-derived typed accessor | Höchste tägliche DX-Friction; alle drei Reviews identifizieren es; rein additiv |
| `View.screenToWorld()` / `View.worldToScreen()` | Near-universaler 2D-Game-Bedarf; konkretes Boilerplate in mehreren Beispielen bewiesen |
| `TextLayout.measure(text, style)` | Kritische Lücke für UI-Layout; ohne diese kann der Nutzer die Text-Größe vor dem Rendering nicht kennen |
| `Scene.tweens` auto-dispose | Analog zu `Scene.inputs`; löst Tween-Lifecycle-Problem ohne neue Surface auf anderen Typen |
| Filter fluent (addFilter etc.) | Inkonsistenz mit dem Rest der fluent API; ein-Zeile-pro-Methode-Fix |

### Starke Kandidaten

| Item | Grund |
|------|-------|
| `Scene.root` Dev-Mode-Warning | Entry-Barrier-Problem; stille Blank-Screen ist häufigste Anfänger-Verwirrung |
| Async `update`/`draw` Warning | Verhindert eine Klasse unsichtbarer Bugs; niedriger Implementierungsaufwand |
| `TweenManager.sequence([...])` | Behebt dokumentierte `chain()`-Ergonomie-Falle ohne Verhaltensänderung |
| Audio-Worklet-Source-Extraktion | 643-Zeilen-Inline-JS-String blockiert zukünftige Audio-Feature-Arbeit |
| `Text.ready: Promise<void>` | Beseitigt Fallback-Font-Rendering-Unsicherheit |
| Verbesserte `loader.get`-Fehlermeldungen | "Ich habe es geladen, warum bekomme ich es nicht?" ist der häufigste Loader-Support-Fall |
| Skew-Transforms | Einzige fehlende 2D-Affin-Primitive; kleine Implementierung |

### Optional bei geringem Risiko

| Item | Grund |
|------|-------|
| Blend-Mode-Erweiterung (Overlay, HardLight, Difference) | Creative-Coding-User werden sofort fragen; 2/3 Reviews stimmen zu |
| Example-Descriptions-Cleanup | Verbesserung der Example-Catalog-Discoverability |
| `ApplicationOptions`-Gruppierung | Wenn Design-Entscheidung 5.2 früh fällt; sonst 0.9.0 |

### Explizit warten, bis Design-Entscheidung gefallen ist

- `event.consume()`-Implementierung — wartet auf §5.1-Entscheidung (welche genau Form)
- Manifest-derived typed accessor — wartet auf §5.3-Entscheidung (API-Shape des Accessors)
- `ApplicationOptions`-Gruppierung — wartet auf §5.2-Entscheidung (genaue Gruppen-Grenzen)
- Fluent-Policy-Cleanup — wartet auf §5.4-Entscheidung (policy-Dokument)

---

## 8. Kandidaten pre-v0.9-Breaking/Konsolidierungs-Entscheidungen

Diese Punkte sollten vor v0.9.0 entschieden werden, weil Brüche jetzt günstig sind.

### Verfolgen

| Item | Begründung |
|------|-----------|
| **Scene input explicit consumption API (Option C)** | Der Inversionsbug ist evidenz, dass boolean-Return-Values für Konsumierung semantisch fragil sind. `event.consume()` ist DOM-vertraut, präzise, unambiguös. Migration ist zweistufig-phasiert: addiv in 0.8.5, Removal in 0.9.0. Interner Aufwand handhabbar. |
| **`ApplicationOptions`-Subsystem-Gruppierung** | Der erste API-Kontakt neuer Nutzer. 16 gemischte Flat-Felder widersprechen der „strukturierten Grenzen"-Identität. Skaliert schlecht mit mehr Features. Nach 1.0 ist das eine mehrere-tausend-Nutzer-Migration. Jetzt: rein intern. |
| **Fluent-Policy-Cleanup (Entfernen aus Scene-Graph-Mutations-Methoden)** | Kein Guide-Code, kein Beispiel, kein Recipe chainiert `addChild`/`removeChild`. `return this` dort ist toter Code mit falscher Affordance. Minimale praktische Breakage. |

### Mit gezieltem Design-Pass untersuchen

| Item | Begründung |
|------|-----------|
| **Scene-Stacking-Vocabulary finale Form** | Preset-Konstanten in 0.8.5 könnten ausreichen (additive). Wenn ein unified Enum langfristig sauberer ist, ist 0.9.0 der Moment. Entscheidung nach 0.8.5-Feedback. |
| **Export-Tiering-Mechanismus** | Wie genau werden JSDoc-Tags mit CI integriert? Welche Exports sind welchem Tier zugeordnet? Das braucht einen konkreten Inventur-Pass, aber ist eine Governance- nicht eine API-Design-Frage. |

### Ablehnen

| Item | Begründung |
|------|-----------|
| **`draw`/`render`-Verb-Rename** | Beide Cross-Examination-Reports unabhängig abgelehnt. Contributor-Klarheit durch Docs, nicht durch API-Break. |
| **`AudioManager`-Ownership-Refactoring** | `app.audio` existiert. Singleton spiegelt Browser-Realität wider. Kein user-sichtbares Problem. |
| **`CollisionWorld` in Core** | Detection-first Core ist die richtige Grenze. Extras-Pfad. |
| **Volle Tween-Integration** (`Sprite.tween()` etc.) | Kein demonstrierter Schmerz. `Scene.tweens` und `sequence()` lösen die echten Probleme. |

---

## 9. Extras / Separates Paket-Track

### Runtime-API-Scope vs. Ökosystem-Arbeit

**Core-Runtime-API** (Rendering, Audio, Input, Scene-Graph, Asset-Loading) — das ist und bleibt der ExoJS-Kern. Hier werden API-Stabilität und Identität gepflegt.

**Extras-Subpfad-Track** (innerhalb desselben npm-Pakets, niedrigere Stabilitätsversprechen):
- `@codexo/exojs/extras/collision` — CollisionWorld mit Broadphase-Orchestrierung, Signal-basierte Collision-Events, optionale Push-Out-Response. Baut auf Core's `Collidable`-Interface und SAT-Funktionen auf.
- `@codexo/exojs/extras/tileset` — TileMap-Rendering (TMX/Tiled). Baut auf Sprite-Batching auf.
- `@codexo/exojs/extras/9slice` — NineSliceSprite als Drawable-Subklasse. UI-Primitive.

**Separates Paket-Track** (eigene Semver, eigene Releases):
- `@codexo/exojs-pathfinding` — A*/Dijkstra für Grid/Navmesh. Rein algorithmisch, kein Render-Concern.
- `@codexo/exojs-networking` — nach 1.0, wenn je. WebSocket/WebRTC-Abstraktion. Eigene Complexity-Klasse.

**Nicht Core, nicht Extras** (Browser-API-Convenience):
- Microphone-/Webcam-Capture-Helpers (`getUserMedia`-Wrapper) — Extras, post-0.9.0
- WASM-beschleunigtes FFT für BeatDetector — Audio-interne Evolution, post-0.9.0

**Permanent außerhalb ExoJS-Scope:**
- Networking als Core — Ablehnung unverändert
- 3D-Meshes als Core — Ablehnung unverändert, „ExoJS ist ein 2D-Runtime" ist Identität, keine Einschränkung
- Compute-Shaders für Mainstream-Nutzung — Post-0.9.0 als `@experimental`, nicht Core

**Extras-Paket-Governance** (muss definiert sein, bevor das erste Extras-Paket ausgeliefert wird):
- Peer-Dependency-Range-Versprechen (z.B. `exojs: >=0.9.0 <1.0.0`)
- Ob Extras-Pakete eigene Semver oder Core-Minor-Tracking verwenden
- Wer Support übernimmt
- Qualitätsstandard für Erstauslieferung (nicht in Alpha; erster öffentlicher Release muss production-quality sein)

---

## 10. Empfohlene unmittelbare nächste Schritte

Kurze, geordnete Liste. Jeder Schritt ist eine Voraussetzung für den nächsten.

**1. API-Entscheidungs-Dokument: Scene Input Propagation API (§5.1)**
- Bestätigt oder widerlegt Option C (`event.consume()`) mit einem konkreten API-Shape-Vorschlag
- Definiert den `SceneInputEvent`-Extension-Mechanismus für das `_consumed`-Flag
- Legt Deprecation-Timing fest (0.8.5 additiv, 0.9.0 Removal)
- **Blockiert:** 0.8.5-Implementierung von `handleInput`-Ergonomie

**2. API-Entscheidungs-Dokument: ApplicationOptions-Gruppierung (§5.2)**
- Legt die genauen Gruppen-Grenzen fest (insbesondere: gehört `backend: BackendConfig` in `rendering` oder bleibt es Top-Level?)
- Definiert die vollständige neue Interface-Form
- **Blockiert:** Alle `ApplicationOptions`-Änderungen in 0.8.5 oder 0.9.0

**3. API-Entscheidungs-Dokument: Loader Asset Accessor (§5.3)**
- Definiert den API-Shape des manifest-derived typed accessors
- Klärt: TypeScript-Generics-basiert oder Runtime-Dispatch? Wie wird der Return-Typ von `loadBundle`/`registerManifest` typisiert?
- **Blockiert:** Loader-Ergonomie-Implementierung in 0.8.5

**4. Fluent Policy-Entscheidung (§5.4)**
- Kurze Entscheidungsdokumentation (kein langer Design-Prozess nötig)
- Legt fest: welche Methoden bekommen `return this`, welche verlieren es
- **Blockiert:** Fluent-Cleanup-Implementation

**5. 0.8.5-Scope einfrieren**
- Sobald die obigen Entscheidungs-Passes abgeschlossen sind, genauen 0.8.5-Scope festlegen
- Was landet in 0.8.5, was in 0.9.0 direkt
- Sequenz (Muss, Stark, Optional) aus §7 ist der Ausgangspunkt

**6. 0.8.5 implementieren und ausliefern**

**7. 0.9.0-Scope mit Blick auf 0.8.5-Feedback finalisieren**
- Sind Preset-Konstanten ausreichend oder braucht es ein unified Enum?
- Welche Breaking Changes sind definitiv in 0.9.0 (ApplicationOptions-Gruppierung, event.consume()-Removal)
- Export-Tiering-Inventur

**8. 0.9.0 implementieren und ausliefern**

---

## 11. Schlussempfehlung

### Was jetzt tun

**Vier fokussierte API-Entscheidungs-Passes** kommen zuerst, vor jeder Implementierung. Sie sind kurz und konkret (Stunden, keine Tage), aber sie müssen zuerst fallen:
1. Scene Input Propagation: Commit zu Option C oder expliciter Ablehnung mit Begründung
2. ApplicationOptions: Genaue Gruppen-Grenzen festlegen
3. Loader Accessor: TypeScript-Mechanismus und API-Shape definieren
4. Fluent Policy: Schreibe die Richtlinie nieder

**Dann 0.8.5 implementieren.** Nicht zögern. Die Entscheidungen sind gut vorbereitet. Die Implementierung danach ist mechanisch.

**Dann 0.9.0 — fokussiert, eng, keine neuen Features.** Alle Breaking Changes in einem Release. Migrations-Guide mitliefern.

### Was jetzt nicht tun

- Keine `draw`/`render`-Verb-Umbenennung. Nicht in pre-0.9.0.
- Keine `AudioManager`-Ownership-Refactoring. Das Problem existiert auf User-Ebene nicht.
- Keine volle Tween-Integration (`Sprite.tween()` etc.). Kein demonstrierter Schmerz.
- Keinen weiteren breiten Review-Zyklus starten. Drei unabhängige Reviews, eine Synthese, eine faktische Verifikation, zwei Cross-Examination-Rounds — die Inputs sind erschöpfend. Die Arbeit ist jetzt Entscheidung und Implementierung, nicht weitere Analyse.
- Keine neuen Features in 0.9.0 — es ist ein API-Konsolidierungs-Release.

### Ob v0.9.0 nach diesen Entscheidungen beschleunigt werden sollte

**Ja.** Sobald die vier Design-Passes abgeschlossen sind und 0.8.5 ausgeliefert ist, sollte 0.9.0 mit enger Scope-Disziplin schnell folgen. Die Architektur ist in besserer Form, als die ursprünglichen Reviews suggerierten — zwei der größten angeblichen Must-Fix-Items (Transformable, SceneNode.render) waren bereits 2020 in 0.5.0 gelöst. Was übrig bleibt, ist handhabbar und gut verstanden.

ExoJS ist bereit, ein stabiles Produkt zu werden. Der Pfad ist: vier kurze Design-Passes → 0.8.5 (DX + Grundstein) → 0.9.0 (Breaking-Changes-Batch + API-Freeze) → Stabilisierung in 0.9.x → 1.0.

Die Identität ist intakt. Die Architektur ist solide. Die Oberfläche braucht Glättung — und alle rauen Stellen sind bereits identifiziert.
