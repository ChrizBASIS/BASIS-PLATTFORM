# BASIS Dashboard — Styleguide

Verbindlich für alle Entwickler, Designer und KI-Agenten (inkl. Nico).

---

## 1. Design-Philosophie

**Brutalist. Kantig. Direkt.**

- `border-radius: 0` überall — keine Rundungen
- Keine `box-shadow` — nur Borders
- 2px Gaps zwischen Grid-Cards
- Noise-Texture + Grid-Overlay auf Body
- Hover = Farbinversion (Card wird Accent, Text wird Black)
- Mono-Labels für Kategorien/Tags

---

## 2. Farben (CSS Custom Properties)

### Dark Mode (default, `[data-theme="dark"]`)

| Token           | Wert                       | Verwendung                  |
|-----------------|----------------------------|-----------------------------|
| `--bg`          | `#080808`                  | Body-Hintergrund            |
| `--surface`     | `#1A1A1A`                  | Cards, Panels, Inputs       |
| `--surface-2`   | `#2A2A2A`                  | Hover, sekundäre Flächen    |
| `--border`      | `rgba(245,240,232,0.08)`   | Trennlinien                 |
| `--text`        | `#F5F0E8`                  | Primärtext                  |
| `--text-dim`    | `rgba(245,240,232,0.55)`   | Sekundärtext                |
| `--text-muted`  | `rgba(245,240,232,0.3)`    | Tertiärtext, Platzhalter    |
| `--accent`      | `#E8FF3A`                  | Akzent (immer gleich!)      |
| `--on-accent`   | `#080808`                  | Text auf Accent-Fläche      |
| `--positive`    | `#22c55e`                  | Erfolg, +Trends             |
| `--negative`    | `#ff4444`                  | Fehler, −Trends             |
| `--warning`     | `#eab308`                  | Warnungen                   |

### Light Mode (`[data-theme="light"]`)

| Token           | Wert                       |
|-----------------|----------------------------|
| `--bg`          | `#F5F0E8`                  |
| `--surface`     | `#FFFFFF`                  |
| `--surface-2`   | `#EDE8DD`                  |
| `--border`      | `rgba(8,8,8,0.1)`          |
| `--text`        | `#080808`                  |
| `--text-dim`    | `rgba(8,8,8,0.6)`          |
| `--text-muted`  | `rgba(8,8,8,0.3)`          |
| `--accent`      | `#E8FF3A`                  |
| `--on-accent`   | `#080808`                  |
| `--positive`    | `#16a34a`                  |
| `--negative`    | `#dc2626`                  |
| `--warning`     | `#ca8a04`                  |

**Regel:** `--accent` ist IMMER `#E8FF3A`. Text auf Accent ist IMMER `#080808`.

---

## 3. Typografie

| Element       | Font           | Size                    | Weight | Letter-spacing |
|---------------|----------------|-------------------------|--------|----------------|
| H1            | Inter          | `clamp(28px, 5vw, 64px)` | 900  | `-0.03em`      |
| H2            | Inter          | `clamp(24px, 4vw, 48px)` | 800  | `-0.025em`     |
| H3            | Inter          | `20px`                  | 800    | `-0.01em`      |
| Body          | Inter          | `14px`                  | 400    | `normal`       |
| Body small    | Inter          | `13px`                  | 400    | `normal`       |
| Mono Label    | JetBrains Mono | `11px`                  | 600    | `0.2em`        |
| Mono Dim      | JetBrains Mono | `11px`                  | 600    | `0.15em`       |
| Mono Tiny     | JetBrains Mono | `10px`                  | 500    | `0.12em`       |
| KPI Value     | Inter          | `36-48px`               | 900    | `-0.04em`      |

Mono Labels sind **immer** uppercase.

---

## 4. Spacing

- Sections: `padding: 40px`
- Cards intern: `padding: 40px 32px` (große), `padding: 24px 20px` (kompakt)
- Grid-Gaps: `2px` zwischen Cards (Brutalist-Grid)
- Section-Gaps: `80px` vertical
- Sidebar: `width: 260px`, `border-right: 1px solid var(--border)`

---

## 5. Komponenten-Regeln

### Card
- Background: `var(--surface)`
- Border: keiner (nur durch 2px Gap sichtbar)
- Hover: `background: var(--accent)` + alle Texte werden `var(--on-accent)`
- Kein Schatten, keine Rundung

### Button (Primary)
- `background: var(--accent)`, `color: var(--on-accent)`
- `padding: 14px 32px`, `font-weight: 800`, `font-size: 13px`
- `letter-spacing: 0.08em`, `text-transform: uppercase`
- Hover: `background: var(--text)` oder Farbinversion

### Button (Outline)
- `background: transparent`, `border: 1.5px solid var(--border)`
- `color: var(--text)`
- Hover: `background: var(--accent)`, `color: var(--on-accent)`

### Badge/Tag
- `border: 1px solid rgba(232,255,58,0.3)`, `color: var(--accent)`
- `padding: 4px 12px`, `font: Mono 11px`, uppercase

### Input
- `background: var(--surface)`, `border: 1px solid var(--border)`
- `padding: 12px 16px`, `font-size: 14px`
- Focus: `border-color: var(--accent)`
- Kein border-radius

### Accent Border
- Wichtige Panels bekommen `border-left: 3px solid var(--accent)`

### Status Dot
- `width: 6px`, `height: 6px`, kein border-radius (quadratisch!)
- Farbe nach Status: accent/positive/negative/warning
- `animation: pulse 1.5s infinite` für aktive Stati

---

## 6. Token-Verbrauch Widget

Jeder Kunde sieht seinen Verbrauch:
- Balken-Anzeige: verbrauchte/verfügbare Tokens
- Pro Agent aufgeschlüsselt
- Aktueller Monat + historisch
- Balken: `background: var(--surface)`, gefüllter Teil `var(--accent)`
- Bei >80%: Warnung mit `var(--warning)`
- Bei >95%: `var(--negative)`

---

## 7. Dark/Light Mode

- Toggle im Header (Sun/Moon Icon)
- Gespeichert in `localStorage`
- System-Preference als Default (`prefers-color-scheme`)
- CSS über `[data-theme="dark"]` / `[data-theme="light"]` auf `<html>`
- Noise-Overlay nur in Dark Mode sichtbar (`opacity: 0.03` → `0` in Light)
- Grid-Overlay in Light: `rgba(8,8,8,0.03)` statt accent

---

## 8. Nicht erlaubt

- ❌ `border-radius` > 0
- ❌ `box-shadow`
- ❌ Gradients auf Flächen
- ❌ Opacity-Tricks für Hintergründe (außer Overlays)
- ❌ Tailwind-Utility-Klassen für Layout (inline styles bevorzugt, wie KI Akademie)
- ❌ Emojis in UI-Elementen (nur in Agent-Definitionen intern)
- ❌ Comic-hafte oder freundliche Icons
