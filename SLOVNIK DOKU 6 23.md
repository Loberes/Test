# Slovník — Technische Dokumentation

**Version:** 6.23 **Datei:** `index.html` (Single-File PWA) **Hosting:** GitHub Pages (statisch, kein Backend)

> **Hinweis zu dieser Revision:** Diese Aktualisierung basiert auf dem tatsächlich vorliegenden Code-Stand **v6.23** — jede hier beschriebene Änderung (v6.7–v6.23) wurde in diesem Chat direkt im Code umgesetzt und per `grep`/Funktionsansicht bzw. automatisiertem Playwright-Test am Ende nochmal gegen die reale Datei verifiziert, nicht aus dem Gedächtnis rekonstruiert. Vor der nächsten Änderung trotzdem wie gehabt: aktuelle Datei hochladen und `const VER=` gegenprüfen.

## Inhaltsverzeichnis

1. Architektur
2. SRS-System
3. Lernmodi
4. Kartentyp-Gewichtung (gestaffelt)
5. Kartenanzeige & mobiles Layout
6. Vokabel-Datenstruktur
7. Fehlertoleranz beim Tippen/Buchstabieren
8. localStorage-Schema
9. Externe Dateien
10. Sprachpaare & Packs
11. Übersetzung (MyMemory)
12. Import / Export
13. Statistik & Tages-Log
14. Mehrsprachige UI (I18N)
15. Artikel-Logik
16. Normalisierung (Eingabe)
17. Onboarding & Tutorial
18. Einstellungen
19. Deployment
20. Offene Punkte (besprochen, nicht umgesetzt)
21. Changelog

---

## Architektur

- Single HTML-Datei — CSS, JS und HTML in einer Datei
- Vanilla JS — kein Framework, kein Build-Step
- PWA-fähig — `apple-mobile-web-app-capable`, installierbar
- Externe JSON-Dateien für Vokabelpacks (lazy geladen per `fetch`)
- localStorage als einzige Persistenz-Schicht
- Maximale Browserkompatibilität: iOS Safari 15+, Chrome, Firefox

> **CSS-Variablen:** Alle im Stylesheet verwendeten `var(--xxx)` müssen im `:root`-Block definiert sein. Zwei Bugs in früheren Versionen (`--ac`, `--cy` fehlten) machten Fortschrittsbalken/Statistik-Balken unsichtbar, ohne JS-Fehler zu werfen — bei UI-Elementen, die "unsichtbar aber technisch da" sind, zuerst hier prüfen.

> **`overflow`-Falle bei `.card` (v6.9–v6.21, Root-Cause-Fix):** `overflow-x:hidden` wurde in v6.9 defensiv auf `.card` gesetzt (gegen horizontales Überlaufen eines Charts). Nebenwirkung, die erst über viele Versionen hinweg gefunden wurde: Setzt man `overflow-x` auf einen Wert ≠ `visible`, während `overflow-y` implizit `visible` bleibt, wird `overflow-y` von Browsern automatisch auf `auto` umgestellt (CSS-Spec-Verhalten, keine Fehlfunktion). Da `.card`-Elemente Flex-Kinder eines `flex-direction:column`-Containers sind, hebelt das zusätzlich die automatische Mindesthöhe von Flexbox aus (`min-height:auto` gilt nur bei `overflow:visible`) — Karten konnten dadurch kleiner gequetscht werden als ihr Inhalt brauchte, mit dem Rest unsichtbar/intern verschluckt statt sichtbar zu wachsen. **Merksatz für künftige ähnliche Bugs: Karte/Element zu klein trotz korrektem Inhalt und korrektem CSS-`height` → zuerst nach `overflow-x` ohne passendes `overflow-y` auf einem Flex-Kind suchen.** Fix in v6.21: `overflow-x:hidden` ersatzlos von `.card` entfernt.

---

## SRS-System

8 Stufen (Spaced Repetition System):

| Stufe | Name | Wartezeit | Farbe |
|---|---|---|---|
| 0 | Neu | sofort fällig | `#ef4444` |
| 1 | 1 Tag | 1 Tag | `#f97316` |
| 2 | 1 Woche | 7 Tage | `#f59e0b` |
| 3 | 1 Monat | 30 Tage | `#84cc16` |
| 4 | 2 Monate | 60 Tage | `#22c55e` |
| 5 | 6 Monate | 180 Tage | `#06b6d4` |
| 6 | 1 Jahr | 365 Tage | `#6366f1` |
| 7 | Gelernt | nie wieder | `#a855f7` |

- **Graduierung:** Karte steigt eine Stufe, wenn sie `repeatN`-mal korrekt beantwortet wurde (Standard: 2/3, einstellbar 1–10).
- **Bei falscher Antwort:** Ausmaß des Stufenabzugs hängt von Fehlertyp **und** Lernmodus ab — siehe Abschnitt 7 (Fehlertoleranz) und Abschnitt 3 (Gezielt üben).
- **Fälligkeit:** `(lastReviewed + days * 86400000) <= Date.now()`, geprüft über `isDue(v)` / `getDue()`.

---

## Lernmodi

### Schnell lernen

- Zeigt alle heute fälligen Vokabeln
- Kartenmodus wird gestaffelt nach SRS-Stufe gewählt (siehe Abschnitt 4), nicht mehr rein zufällig
- Bei Wörtern >12 Zeichen: Buchstaben-Modus-Anteil wird dem Tipp-Modus zugeschlagen
- Richtung: 1. Abfrage vorwärts (native→foreign), 2. Abfrage rückwärts (foreign→native), dann abwechselnd
- Gap-Logik: nach korrekter Antwort wandert die Karte `gapN` Positionen nach hinten (Standard 3, einstellbar 1–20)

### Gezielt üben (Deep Learn)

Auswahlbildschirm vor Sitzungsstart (`openDeepSelect()` / `dsRender()`):

- Filter-Chips pro SRS-Stufe (einzeln an-/abwählbar, "Alle"/"Keine")
- Schalter "Nur oft falsche Wörter" (`dsOften`, Filter: `wrong ≥ correct`)
- Live-Zähler passender Vokabeln, Start-Button erst aktiv bei ≥1 Treffer
- Zeigt nur die im Auswahlbildschirm gefilterten Vokabeln

Ablauf:

- **Phase 1:** Karte komplett aufgedeckt (Lernphase, reiner Flip-Kartentyp)
- **Phase 2:** Abfrage per Flip-Karte (in Deep Learn immer `ctype='flip'`, unabhängig von SRS-Stufe — anders als in Schnell lernen)
- **Aufsteigen nur wenn fällig:** SRS-Stufe wird nur erhöht, wenn die Karte auch fällig war (`isDue(S.vocab[vi])||LS.mode==='quick'` in `mark()`) — verhindert vorzeitiges Aufsteigen beim gezielten Üben nicht-fälliger Karten. Unverändert seit v6.5, mehrfach bestätigt korrekt.
- **Strafe bei falscher Antwort — seit v6.22 entschärft:** Vorher setzte jede falsche Antwort im Deep-Learn-Modus (Falsch-Button oder "Weiß ich nicht") die Stufe komplett auf 0 zurück, da der Flip-Kartentyp standardmäßig keinen abgestuften `stageDrop` an `mark()` übergab. Seit v6.22 wird im Deep-Learn-Modus (`LS.mode==='deep'`) sowohl beim Falsch-Button als auch bei "Weiß ich nicht" `mark(false,1)` statt `mark(false)` aufgerufen → **maximal −1 Stufe**, kein Totalreset mehr. Gilt ausschließlich für Deep Learn; normales Lernen (Schnell lernen) bleibt bei Totalreset für Flip-"Falsch" bzw. "Weiß ich nicht", das ist dort weiterhin gewollt.

### Karten-Typen

- **Flip-Karte:** Vorderseite antippen → Rückseite → Richtig/Falsch-Button (Selbsteinschätzung)
- **Tippen (Type):** Frage anzeigen → Antwort eintippen → Live-Auto-Check beim Tippen (bestätigt sofort bei Treffer, inkl. Akzent-Toleranz seit v6.8) → Enter oder ✓-Button für manuelle Bestätigung mit differenzierter Rückmeldung (siehe Abschnitt 7)
- **Buchstaben (Letters):** Buchstaben-Kacheln (aus dem Zielwort, gemischt) antippen um das Wort zusammenzusetzen; differenzierte Rückmeldung bei Fehlern (siehe Abschnitt 7)

"Weiß ich nicht"-Button: in allen drei Kartentypen unterhalb der Karte. Zeigt sofort die Lösung + Weiter-Button. In **Schnell lernen** weiterhin Totalreset auf Stufe 0; in **Gezielt üben** seit v6.22 nur −1 Stufe (siehe oben).

Kein Auto-Weiterblättern nach Antwort — alle Modi erfordern manuellen Weiter-Button.

---

## Kartentyp-Gewichtung (gestaffelt)

Die Wahrscheinlichkeit für Flip/Tippen/Buchstaben in Schnell lernen hängt von der SRS-Stufe der Karte ab (`ctypeWeights(stage)`, `pickCtype(stage, wlen)`):

| Stufe | Buchstaben | Umdrehen | Tippen |
|---|---|---|---|
| 0 (Neu) | 33% | 33% | 34% |
| 1 | 22% | 26% | 52% |
| 2 | 11% | 20% | 69% |
| 3 (1 Monat) | 0% | 13% | 87% |
| 4 | 0% | 7% | 93% |
| 5+ (6 Monate+) | 0% | 0% | **100%** |

Buchstaben-Modus verschwindet linear bis Stufe 3, Umdrehen-Modus linear bis Stufe 5. Ab Stufe 5 nur noch Tipp-Modus. Gilt nur für Schnell lernen — in Gezielt üben immer Flip (siehe Abschnitt 3).

---

## Kartenanzeige & mobiles Layout

**Neu seit v6.22**, betrifft alle vier Kartenansichten (Flip, Tippen, Buchstaben, Deep-Learn-Phase-1):

### Kartenkopf: Flagge + SRS-Stufe

Jede Karte zeigt oben eine kleine Flagge der gerade angezeigten Sprache (`flagFor(langCode)`, Lookup-Tabelle `LFLAG`) und rechts daneben einen farbigen Stufen-Badge (`cardTop(langCode, stage)`) — gleiche Farblogik wie `SRS_C` in der Vokabelliste/Statistik.

### Artikel — Platzierungsfehler behoben

**Vorher:** Der Artikel (`card.article`, gehört immer zur nativen/deutschen Seite) wurde in `renderFlip` unabhängig davon gezeigt, welche Sprache gerade sichtbar war — bei Richtung Deutsch→Zielsprache erschien er fälschlich neben dem fremdsprachigen Wort (z. B. neben dem slowakischen Wort, wo ein Artikel keinen Sinn ergibt).

**Nachher:** Artikel wird ausschließlich auf der Seite gezeigt, die aktuell die native Sprache ist (`qSide==='native'` bzw. `aSide==='native'`), unabhängig von Frage/Antwort-Position. Gilt für Flip (Front und Rückseite), Tippen und Buchstaben (jeweils nur bei der Frage, da dort kein Antwort-Reveal existiert).

### Notiz — jetzt einklappbar

**Vorher:** Notiz (`getNotes(card, side)`) wurde direkt als Text mit 💡-Präfix angezeigt, sobald vorhanden — potenzieller Spoiler.

**Nachher:**

- **Flip-Karte:** `noteBlock(notes)` — kleiner runder 💡-Button unten rechts auf der Karte, Text erscheint als Popup (`.note-pop`, CSS-Klasse `.open` togglet Sichtbarkeit) erst nach Antippen (`toggleNote(uid)`). `event.stopPropagation()` verhindert, dass der Klick gleichzeitig die Karte umdreht.
- **Tippen/Buchstaben:** `noteBlockInline(notes)` — Inline-Chip "💡 Hinweis" unter der Frage statt absolut positioniertem Button, da diese Container variable Höhe haben (Absolut-Positionierung hätte mit Eingabefeld/Buttons weiter unten kollidieren können). Gleiche Klick-Logik (`toggleNote`).

### Mobile Tastatur — kein Layout-Sprung mehr (neu seit v6.23)

**Vorher:** Beim Fokussieren des Eingabefelds im Tipp-Modus öffnete sich die virtuelle Tastatur, der Browser verkleinerte dadurch den sichtbaren Viewport, und die (vorher vertikal zentrierte) Karte sprang neu in die Mitte des jetzt kleineren Bereichs — beim Schließen der Tastatur wieder zurück. Sichtbares Hin-und-Her-Springen.

**Nachher, zwei Änderungen zusammen:**

1. **Viewport-Meta-Tag** um `interactive-widget=overlays-content` ergänzt:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=overlays-content">
   ```
   Weist unterstützte Browser an, die Tastatur über den Inhalt zu legen statt den Viewport zu verkleinern — verhindert das auslösende Neu-Layout. Unterstützt ab iOS Safari 17.4+ und aktuellem Chrome; auf älteren Browsern ohne Wirkung (kein Rückschritt, nur kein Vorteil).
2. **`.lbody` von vertikal zentriert auf oben verankert umgestellt:** `justify-content:center` → `justify-content:flex-start` mit festem `padding-top:24px`, zusätzlich `overflow-y:auto` als Sicherheitsnetz falls Karte + Tastatur zusammen nicht mehr in den sichtbaren Bereich passen. Dadurch hängt die Karte an einer festen Position unterhalb der Kopfzeile, unabhängig von der tatsächlichen Höhe des sichtbaren Bereichs — einheitlich für alle drei Kartentypen (Flip/Tippen/Buchstaben), da sie alle denselben `.lbody`-Container nutzen.

> Bewusst **kein** `overflow-x:hidden` o.ä. an `.lbody` ergänzt — siehe die `.card`-Warnung in Abschnitt 1, dieselbe Falle wäre hier genauso möglich gewesen. Nur `overflow-y:auto` gesetzt (Browser setzt dadurch `overflow-x` implizit auf `auto` mit, das ist hier unkritisch, da `.lbody` keinen horizontalen Inhalt hat, der überlaufen könnte).

---

## Vokabel-Datenstruktur

```json
{
  "native": "Hund",
  "foreign": "pes",
  "article": "der",
  "synonymsNative": ["Köter", "Vierbeiner"],
  "synonymsForeign": ["psík"],
  "notesNative": "Eselsbrücke: treu wie ein Hund",
  "notesForeign": "Hinweis für Rückwärts-Abfrage",
  "stage": 3,
  "lastReviewed": 1751234567890,
  "created": 1751234000000,
  "stats": { "correct": 12, "wrong": 2 }
}
```

Unverändert in diesem Chat. Feldnamen sind camelCase (`notesNative`, nicht `notes_native`).

- **Rückwärtskompatibilität:** Altes `synonyms`- und `notes`-Feld (ungetrennt) wird über `getNotes(card, side)` / `getSyns(card, side)` als Fallback unterstützt.
- **`created`:** Zeitstempel bei Vokabel-Erstellung, für "Neue Wörter"-Statistik-Metrik.
- **Synonyme:** Werden je nach Abfragerichtung als korrekte Antwort akzeptiert.

---

## Fehlertoleranz beim Tippen/Buchstabieren

> **Korrektur gegenüber der v6.6-Dokumentation:** Die vorherige Doku-Version beschrieb den Buchstaben-Modus fälschlich bereits als dreistufig (−1 Akzent / −2 Buchstabenfehler / 0 komplett falsch) unter v6.6. Tatsächlich hatte der Buchstaben-Modus zu diesem Zeitpunkt **keine** eigene Akzent-Stufe (nur −2/0). Die Akzent-Stufe wurde in **v6.7** ergänzt — und dabei bewusst als **volle Toleranz (kein Abzug)** umgesetzt, nicht als −1. Der folgende Abschnitt beschreibt den tatsächlich verifizierten Stand (v6.23).

Kernfunktionen: `editDistance(a,b)` (Damerau-Levenshtein — zählt benachbarte Buchstabendreher als 1 Fehler, nicht 2), `norm(s)` (Diakritika-frei, klein geschrieben), `mark(ok, stageDrop)` (optionaler dritter Zustand neben voll richtig/falsch).

**Live-Tippen (`autoChk`, während der Eingabe, vor Bestätigung):**

- Exakter Treffer **oder** Treffer ohne Akzente (`norm()`-Vergleich) → sofortige automatische Bestätigung, volle Punktzahl
- Seit **v6.8**: zeigt bei reinem Akzent-Treffer zusätzlich den Hinweis "Richtig: `<korrekte Schreibweise>`" (vorher nur bei manueller Bestätigung, `autoChk` war hier bis v6.7 nicht mit aktualisiert worden — Ursache eines zwischenzeitlichen Bugs, bei dem Live-Tippen strenger war als der ✓-Button)
- Artikel-Check: falscher Artikel blockiert die automatische Live-Bestätigung (muss manuell über ✓ bestätigt werden)

**Tipp-Modus, explizite Bestätigung (`chkType`, ✓-Button/Enter):**

- Exakt **oder** nur Diakritika anders → **voll richtig, kein Stufenabzug**, Hinweis auf korrekte Schreibweise bei Akzentfehler
- Wort exakt, nur Artikel falsch → **−2 Stufen**
- Echter Buchstabenfehler (Editierdistanz 1) → **−2 Stufen**
- Komplett anderes Wort → **Stufe 0** (Totalreset)
- Bei jedem nicht-exakten Ergebnis wird die korrekte Lösung angezeigt (eigene Eingabe **nicht** mehr separat aufgeführt — seit **v6.9** entfernt, da im Eingabefeld ohnehin sichtbar)

**Buchstaben-Modus (`renderLetters` / `pickL`) — seit v6.7 gleiche Toleranz-Logik wie Tippen:**

- Exakt **oder** nur Diakritika anders (`norm(typed)===norm(target)`) → **voll richtig, kein Stufenabzug**, Hinweis auf korrekte Schreibweise
- Buchstabenfehler oder -dreher (Editierdistanz 1) → **−2 Stufen**
- Komplett falsch → **Stufe 0**
- Eigene Eingabe wird hier nicht angezeigt (Buchstaben-Kacheln sind ohnehin sichtbar), nur die Lösung bei Fehlern

**"Weiß ich nicht"** (alle Kartentypen) bleibt in **Schnell lernen** immer Totalreset auf Stufe 0. In **Gezielt üben** seit v6.22 nur −1 Stufe (siehe Abschnitt 3).

### Verwechslungs-Erkennung (neu seit v6.23, nur Tipp-Modus)

Bei `tier==='wrong'` (komplett falsche Antwort, kein Typo/Akzent-Fall) prüft `checkConfusion(typed, aSide, card)` zusätzlich, ob der getippte Text **exakt** (`normKeepAccents`-Vergleich) der Übersetzung einer **anderen** Vokabel auf derselben Sprachseite entspricht — z. B. „pes" getippt, obwohl „mačka" gefragt war, aber „pes" ist die hinterlegte Übersetzung von „Hund".

- Trifft das zu, bekommt die **andere** Vokabel ebenfalls **−1 Stufe** (`Math.max(0, stage-1)`) — unabhängig davon, welchen Fehlertyp die aktuell abgefragte Karte selbst hat (die bleibt beim bisherigen Totalreset, unverändert).
- Es wird **nur die Stufe angepasst**, keine `stats.correct`/`stats.wrong`-Zähler, kein Log-Eintrag für die andere Vokabel, kein `lastReviewed`-Update.
- Kein Treffer, wenn der getippte Text ein **Synonym der aktuell abgefragten Karte** ist — dieser Fall erreicht `checkConfusion` gar nicht erst, da er schon vorher als `tier==='exact'`/`'diacritic'` (richtig) klassifiziert wurde.
- **Kein** Abgleich gegen Synonyme der *anderen* gefundenen Vokabel — nur deren Haupt-Übersetzungsfeld zählt (bewusste Entscheidung, um den Umfang klein zu halten).
- Warnhinweis im Feedback (`confusionWarn(typed, meaning)`, alle 3 UI-Sprachen): z. B. „⚠️ 'pes' ist deine Übersetzung für 'Hund' – wurde vorsichtshalber ebenfalls eine Stufe zurückgestuft."
- Die Stufenänderung an der anderen Vokabel wird erst persistiert, wenn als Nächstes `mark()` aufgerufen wird (`saveVocab()` läuft dort ohnehin) — bricht der Nutzer die Sitzung vorher ab, geht die Anpassung verloren. Bekanntes, akzeptiertes Randfall-Risiko, keine eigene Speicherung dafür eingebaut.

*Getestet (Playwright, automatisiert): Diakritika-Toleranz live und beim Bestätigen in beiden Modi, Buchstabendreher-Erkennung, Stufenabzug, Deep-Learn-Strafe (3→2 statt 3→0), Artikel-Platzierung auf Karten (Flagge/Level/Notiz), Karten-Höhen mit echten und leeren Daten, Verwechslungs-Erkennung (Hund 4→3 bei "pes"-Eingabe für "Katze", Warnhinweis korrekt angezeigt).*

---

## localStorage-Schema

| Key | Inhalt |
|---|---|
| `sv6_vocab_{native}_{target}` | Array aller Vokabeln für ein Sprachpaar |
| `sv6langs` | Array der Sprachpaare `[{native, target, label}]` |
| `sv6pair` | Aktives Sprachpaar `{native, target, label}` |
| `sv6set` | Einstellungen (theme, tts, repeatN, gapN, uiLang, …) |
| `sv6log` | Array von Lern-Events: `{t: timestamp, ok: bool, w: wordKey}` |
| `sv6tut` | `1` wenn Tutorial abgeschlossen |
| `sv6_tc_{lang}` | Übersetzungs-Cache pro Zielsprache |
| `sv6_tf_{lang}` | Fail-Cache für Übersetzungen (7 Tage) |

> **`sv6_hidden`** (Array ausgeblendeter häufiger Wörter) **existiert seit v6.10 nicht mehr** — das komplette "Häufige Vokabeln"-Feature auf der Home-Seite wurde entfernt (siehe Abschnitt 10). Der zugehörige State (`S.freqPage`, `S.freqHid`), die Funktionen (`renderFreq`, `freqPg`, `hideFreqW`, `addFreqW`) und das `FREQ`-Wortarray wurden ersatzlos entfernt.

> `sv6_daylog` existiert seit längerem nicht mehr als eigener Key (durch `buildDayData(nDays)` ersetzt, live aus `sv6log` berechnet). Seit **v6.10** ergänzt um `buildMonthData(spanDays)` für die Monats-Aggregation bei langer Historie — siehe Abschnitt 13.

Log-Eintrag-Format: Objekte `{t, ok, w}`. `logT(e)` liest den Timestamp (Rückwärtskompatibilität für alte Log-Arrays).

---

## Externe Dateien

Unverändert in diesem Chat. Alle Pack-/Suggest-JSON-Dateien liegen im selben Verzeichnis wie `index.html`, Lazy Loading beim Öffnen des Packs-Tabs bzw. beim ersten Tippen im Hinzufügen-Tab. Details siehe vorherige Doku-Version (Pack-Format, Suggest-Format, Fallback-Pfade unverändert).

---

## Sprachpaare & Packs

Eingebaute Packs (DE→SK 18 Packs/1308 Wörter, DE→EN, DE→HU, EN→SK, SK→DE/SK→EN gespiegelt, SK→KO 18 Kategorien/551 Wörter) unverändert.

> **"Häufige Wörter (DE)" — entfernt seit v6.10.** Vorherige Doku beschrieb 120 häufige deutsche Wörter im Home-Tab mit Ausblend-Funktion. Auf Nutzerwunsch komplett aus der App entfernt: HTML-Sektion, Render-Funktion, `FREQ`-Array (~110 Wörter), zugehörige i18n-Keys (`freqWords`, `freqOnlyDe`, `freqAllLearned`, `learnBtnPlus`, `page`) in allen drei Sprachen, sowie `SK.hid`-Nutzung. Kein Ersatz vorgesehen.

---

## Übersetzung (MyMemory)

Unverändert in diesem Chat.

---

## Import / Export

Unverändert in diesem Chat.

---

## Statistik & Tages-Log

Dieser Abschnitt hat in diesem Chat die mit Abstand meisten Iterationen durchlaufen (v6.9 → v6.21). Zusammengefasst der **finale, verifizierte Stand**:

### Datengrundlage

- `buildDayData(nDays)` aggregiert weiterhin live aus `sv6log`.
- **Neu seit v6.10:** `buildMonthData(spanDays)` — wenn die tatsächliche Datenspanne (`getDataSpanDays()`, gedeckelt auf 365 Tage wegen Log-Pruning) mehr als ~186 Tage (6 Monate) beträgt, aggregiert die "Alle"-Ansicht automatisch auf Monats-Balken (max. 13) statt Tages-Balken zu zeigen. Vermeidet unleserlich viele/dünne Tages-Balken bei langer Nutzungshistorie.
- "Wörter gelernt" zählt weiterhin eindeutige Wörter pro Tag, nicht Abfrage-Versuche.

### Chart-Darstellung — Verlauf und finaler Stand

Kurzer Verlauf zur Einordnung, falls in künftigen Chats wieder an diesen Stellen gearbeitet wird:

1. v6.9: `min-width:0` auf Chart-Spalten eingeführt (behob horizontales Überlaufen bei vielen Tagen, führte aber zu quasi unsichtbaren Balken bei "Alle").
2. v6.10–v6.13: diverse feste Höhen (90px → 130px → 150px) und horizontales Scrollen (`overflow-x:auto` auf einem Wrapper-Div) probiert.
3. v6.14/15: temporäres Diagnose-Panel direkt in der App eingebaut, um echte `getBoundingClientRect()`-Werte auf dem Gerät des Nutzers abzulesen (kein Mac/Devtools nötig) — danach wieder entfernt.
4. v6.18: horizontales Scrollen auf Nutzerwunsch wieder komplett entfernt.
5. v6.19: sichtbarer Hintergrund/Rahmen an Chart-Containern ergänzt, damit die Box-Grenzen auch bei kaum sichtbaren (fast leeren) Balken erkennbar sind.
6. v6.20: **alle festen Pixel-Höhen entfernt** — Chart- und SRS-Container wachsen seither rein aus ihrem Inhalt (Balkenhöhe + Padding), analog zur (immer korrekt funktionierenden) Tages-Detail-Karte.
7. **v6.21 — eigentliche Ursache gefunden und behoben:** siehe Root-Cause-Fix in Abschnitt 1 (`overflow-x:hidden` auf `.card`). Erst danach war das Problem tatsächlich vollständig gelöst; Schritte 1–6 waren Symptombekämpfung an einer Stelle, deren echte Ursache eine CSS-Eigenschaft an ganz anderer Stelle war.

**Aktueller Stand:** kein horizontales Scrollen, keine festen Höhen, kein Diagnose-Panel mehr im Code. Charts (Tages-/Monats-Balken, SRS-Stufen-Verteilung) sizen sich rein aus Inhalt + `.card` wächst jetzt korrekt mit.

### Statistik-Tab (UI, unverändert)

- KPI-Kacheln: Streak (mit Bestserie), Wörter gelernt, Ø pro Lerntag, Richtig-Quote, Bester Tag
- Zeitraum-Filter: 7 / 14 / 30 Tage / Gesamt
- Metrik-Tabs: Wörter · Richtig · Falsch · Quote · Neu
- Balkendiagramm: farbig nach Metrik, antippen → Detail-Popup für den Tag
- Tagesliste, SRS-Stufen-Verteilung

### Streak

Unverändert in diesem Chat (`calcStreak()`, `calcBestStreak()`, Badge dauerhaft sichtbar).

---

## Mehrsprachige UI (I18N)

Unverändert in diesem Chat (DE/EN/SK, `I18N`-Dictionary, `t(key)`, `data-i18n`, `setUL()`/`applyI18N()`). Einzelne i18n-Keys wurden im Zuge der "Häufige Vokabeln"-Entfernung gelöscht (siehe Abschnitt 10).

---

## Artikel-Logik

Automatische Extraktion (`splitArticle`) und Artikel-Check beim Tippen (`chkType`) unverändert (falscher Artikel bei sonst korrektem Wort → −2 Stufen, siehe Abschnitt 7).

**Neu seit v6.22:** zusätzliche Artikel-**Anzeige**-Logik auf den Lernkarten selbst (nicht zu verwechseln mit dem Artikel-Check der Eingabe) — siehe Abschnitt 5.

---

## Normalisierung (Eingabe)

Unverändert in diesem Chat. `norm(s)` und `editDistance(a,b)` (Damerau-Levenshtein) wie zuvor dokumentiert.

---

## Onboarding & Tutorial

Unverändert in diesem Chat.

---

## Einstellungen

Unverändert in diesem Chat.

---

## Deployment

Unverändert in diesem Chat. Dateistruktur, `.nojekyll`-Pflicht, GitHub-Pages-Settings wie zuvor.

> **Wichtiger Hinweis aus diesem Chat:** Änderungen, die hier im Chat an der Datei vorgenommen werden, wirken sich **nicht automatisch** auf die Live-Version unter `loberes.github.io/Test/` aus. Die aktualisierte `index.html` muss jedes Mal manuell ins GitHub-Repo hochgeladen werden. Mehrfach in diesem Chat Ursache von Verwirrung ("Fix wirkt nicht"), wenn stattdessen der alte Live-Stand getestet wurde.

---

## Offene Punkte (besprochen, nicht umgesetzt)

Die beiden Punkte aus der vorherigen Doku-Revision (Verwechslungs-Erkennung, Tastatur-Sprung) sind seit **v6.23 umgesetzt** — siehe Abschnitt 5 (Mobile Tastatur) bzw. Abschnitt 7 (Verwechslungs-Erkennung) sowie Changelog unten. Aktuell offen:

1. **Datei-Aufteilung (HTML/CSS/JS getrennt), aber weiterhin als eine Datei ausliefern:** Nutzer wollte wissen, ob die App wartbarer strukturiert werden kann (separate `index.html`/`style.css`/`script.js`), ohne den Upload-Workflow zu verkomplizieren (weiterhin nur eine Datei zu GitHub hochladen). Zip-Ansatz verworfen (GitHub Pages entpackt keine `.zip` automatisch, wäre nur ein Download, kein Deploy). Stattdessen vorgeschlagen: intern in getrennten Teilen pflegen, daraus aber weiterhin automatisch eine einzelne `index.html` zusammenbauen — für den Nutzer keine Ablauf-Änderung. **Zustimmung des Nutzers stand bei Chat-Ende noch aus** (er ist stattdessen direkt zur Doku-Bitte übergegangen) — vor Umsetzung nochmal nachfragen/bestätigen lassen.

---

## Changelog

### v6.23
- **Verwechslungs-Erkennung beim Tippen** (nur Tipp-Modus): Bei komplett falscher Antwort prüft `checkConfusion()`, ob das Getippte exakt der Übersetzung einer anderen Vokabel (gleiche Sprachseite) entspricht. Falls ja: diese andere Vokabel bekommt −1 Stufe plus Warnhinweis im Feedback (`confusionWarn()`, alle 3 UI-Sprachen). Nur Stufenanpassung, keine Statistik-Zähler. Die abgefragte Karte selbst bleibt unverändert beim bisherigen Totalreset. Details siehe Abschnitt 7.
- **Kein Tastatur-Sprung mehr beim Tippen:** Viewport-Meta um `interactive-widget=overlays-content` ergänzt (Tastatur legt sich über den Inhalt statt Layout zu verkleinern, iOS Safari 17.4+/aktuelles Chrome). Zusätzlich `.lbody` von vertikal zentriert (`justify-content:center`) auf oben verankert (`justify-content:flex-start`, festes `padding-top`) umgestellt, einheitlich für alle Kartentypen — Karte bleibt an fester Position, unabhängig vom sichtbaren Bereich. Details siehe Abschnitt 5.

### v6.22
- **Wortkarten-Konzept umgesetzt** (vorher als separates Konzept-HTML visualisiert und vom Nutzer freigegeben):
  - Artikel-Anzeige auf Lernkarten korrigiert: klebt jetzt an der nativen/deutschen Seite (`qSide==='native'`/`aSide==='native'`), unabhängig von Front/Rückseite oder Abfragerichtung — vorher teils fälschlich neben dem fremdsprachigen Wort.
  - Notiz standardmäßig eingeklappt (💡-Button bei Flip, Inline-Chip bei Tippen/Buchstaben), Text erst nach Antippen sichtbar (`toggleNote()`).
  - Sprach-Flagge + farbiger SRS-Stufen-Badge neu auf allen vier Kartenansichten (Flip, Tippen, Buchstaben, Deep-Learn-Phase-1) — `cardTop()`, `LFLAG`.
- **Gezielt üben (Deep Learn) entschärft:** falsche Antwort (Falsch-Button oder "Weiß ich nicht") setzt Stufe nur noch um −1 zurück statt Totalreset auf 0 — ausschließlich in diesem Modus, `mark(false,1)` statt `mark(false)`. Normales Lernen unverändert. Verfrühtes Aufsteigen war bereits vorher korrekt über `isDue()` verhindert.

### v6.21 — Root-Cause-Fix Statistik-Kartengröße
- `overflow-x:hidden` von `.card` entfernt. War in v6.9 defensiv ergänzt worden, verursachte über den CSS-Mechanismus "impliziertes `overflow-y:auto`" + "ausgehebelte Flexbox-Mindesthöhe" die eigentliche Ursache für sämtliche "Karte zu klein/kollabiert"-Symptome seit v6.9, betraf alle `.card`-Elemente app-weit (nicht nur Statistik). Gefunden über Firefox-Devtools-Screenshots des Nutzers (`div.card 448×40px` trotz Inhalt, der ~250px braucht). Siehe ausführliche Erklärung in Abschnitt 1.

### v6.20
- Alle festen Pixel-Höhen (150px Tages-Chart, 130px SRS-Chart, 175px Wrapper) entfernt. Container wachsen seither ausschließlich aus ihrem Inhalt (Balkenhöhe + Padding), analog zur immer korrekt funktionierenden Tages-Detail-Karte. `height:100%` bei den Balken-Spalten-Wrappern ebenfalls entfernt (war nur im Zusammenspiel mit fester Container-Höhe sinnvoll).

### v6.19
- Sichtbarer Hintergrund (`var(--b3)`) und Rahmen an Tages-Chart- und SRS-Chart-Container ergänzt, damit die volle Box-Fläche auch bei kaum sichtbaren (nahezu leeren) Balken erkennbar bleibt.

### v6.18
- Horizontales Scrollen des Tages-Charts (aus v6.10) auf Nutzerwunsch wieder vollständig entfernt. Zurück zu `flex:1`-Spalten über die volle Kartenbreite, kein Scroll-Wrapper mehr.

### v6.14–v6.17
- v6.14: temporäres Diagnose-Panel auf der Statistik-Seite eingebaut (zeigt live `getBoundingClientRect()`-Werte direkt in der App an), um ohne Mac/Devtools echte Messwerte vom Gerät des Nutzers zu bekommen.
- v6.15: Diagnose-Panel nach Auswertung wieder entfernt (Zwischenstand: Werte maßen sich als korrekt — stellte sich in v6.21 als unvollständige Diagnose heraus, da das eigentliche `.card`-Problem erst mit befüllten/größeren Karten sichtbar wurde).
- v6.16: SRS-Chart-Höhe 90px → 130px (Home und Statistik gemeinsam, geteilte CSS-Klasse), Legende großzügiger.
- v6.17: Statistik-SRS-Karte mit zusätzlichem Innen-/Außenabstand versehen.

### v6.9–v6.13
- v6.9: "Deine Eingabe"-Zeile aus dem Fehler-Feedback entfernt (Tippen und Buchstaben) — redundant, da im Eingabefeld bereits sichtbar. Statistik-Chart-Spalten auf `min-width:0` umgestellt (Ursprung der langen Größen-Debugging-Serie, siehe v6.21).
- v6.10: **"Häufige Vokabeln"-Feature komplett entfernt** (Home-Tab) — HTML, `renderFreq`/`freqPg`/`hideFreqW`/`addFreqW`, `FREQ`-Array, State, i18n-Keys. Monats-Aggregation (`buildMonthData`) für Statistik "Alle" bei >6 Monaten Historie ergänzt. SRS-Chart-Höhe 60px → 90px.
- v6.11: Tages-Chart-Höhe 110px → 150px, Balken-Skalierung angepasst, Tagesliste-Zeilenabstand vergrößert.
- v6.12: `100vh` → zusätzlich `100dvh`-Fallback bei `#app`/`#mscr` (mobile Viewport-Robustheit). `min-height`/`flex-shrink:0` als Sicherheitsnetz an Chart-Containern.
- v6.13: `.st-chart-wrap` zusätzliche `min-height:175px`.

### v6.7–v6.8
- v6.7: Diakritik-Toleranz (volle Punktzahl, kein Abzug) auf den **Buchstaben-Modus** ausgeweitet — vorher nur im Tipp-Modus vorhanden (die v6.6-Doku hatte hier fälschlich bereits eine `−1`-Akzent-Stufe für Buchstaben behauptet, die es zu diesem Zeitpunkt noch nicht gab). Hinweis auf korrekte Schreibweise ("Richtig: …") bei Akzent-Treffern ergänzt, in beiden Modi.
- v6.8: Live-Tipp-Erkennung (`autoChk`) auf dieselbe Diakritik-Toleranz wie die manuelle Bestätigung (`chkType`) gebracht — war zuvor nicht mit aktualisiert worden und dadurch strenger als der ✓-Button (Ursache eines vom Nutzer gemeldeten Inkonsistenz-Bugs).

### v6.6
- Fehlertoleranz-Feinjustierung im **Tipp-Modus**: Diakritika-Fehler zählen als voll richtig (kein Abzug); nur noch zwei Stufen dort: voll richtig (inkl. Akzentfehler) vs. −2 (echter Buchstabenfehler/-dreher/falscher Artikel) vs. Totalreset (komplett falsch). Live-Tippen (`autoChk`) zu diesem Zeitpunkt noch **nicht** mit aktualisiert (siehe v6.8-Fix oben — in der Zwischenzeit lieferte das eine reale Inkonsistenz zwischen Live-Tippen und manueller Bestätigung).

### v6.5 und früher

Siehe vorherige Doku-Version (`SLOVNIK_DOKU_6_6.md`) — Kernpunkte: abgestufte Fehlerbewertung erstmals eingeführt (v6.5), CSS-Variablen-Bug `--ac` gefixt (v6.4), Notizen/Synonyme sprachgetrennt (v6.3), neue Sprachpaare SK→DE/SK→EN (v6.2), Statistik-Zählweise auf eindeutige Wörter umgestellt (v6.1), Koreanisch ergänzt (v6.0), und weiter zurück bis v3.4 (siehe dortige Zusammenfassung).

---

*Dokumentation zuletzt aktualisiert: August 2026, basierend auf Code-Stand **v6.23**, gegen die reale Datei verifiziert (nicht rekonstruiert).*
