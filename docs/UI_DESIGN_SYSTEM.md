# UI Design System — Modern Dashboard Skill
> Version 1.0 | Palette: Slate & Crimson | Stack: React + Tailwind CSS (or plain CSS custom properties)

---

## 1. Purpose

This skill instructs any model or AI coding agent to generate frontend components, layouts, and pages that conform to a modern, elegant SaaS dashboard aesthetic. All output must be consistent, production-ready, and respect both light and dark themes.

**Reference design:** Codename.com-style sales/analytics dashboard (image 2 from design brief).  
**Primary accent:** Crimson `#C3125C`  
**Philosophy:** Neutral base + single accent + whitespace + typography hierarchy. No gradients, no decorative shadows, no multiple accent colours.

---

## 2. Design Tokens

### 2.1 Colour — Light Theme

| Token | Value | Usage |
|---|---|---|
| `--bg-page` | `#f5f5f7` | Page/canvas background |
| `--bg-surface` | `#ffffff` | Cards, sidebar, topbar |
| `--bg-elevated` | `#ffffff` | Modals, popovers |
| `--bg-subtle` | `#f0f0f2` | KPI card fills, input backgrounds |
| `--border` | `#e8e8ea` | All borders (0.5px) |
| `--border-strong` | `#d0d0d4` | Hover/focus borders |
| `--text-primary` | `#111111` | Headings, values |
| `--text-secondary` | `#666666` | Labels, descriptions |
| `--text-tertiary` | `#aaaaaa` | Hints, timestamps, placeholders |
| `--accent` | `#C3125C` | CTAs, active nav, badges |
| `--accent-hover` | `#e0156a` | Accent hover state |
| `--accent-tint` | `#fbeaf0` | Accent background tint |
| `--accent-tint-border` | `#f4c0d1` | Accent tint border |
| `--success-bg` | `#eaf3de` | Positive trend pill bg |
| `--success-text` | `#3b6d11` | Positive trend pill text |
| `--danger-bg` | `#fcebeb` | Negative trend pill bg |
| `--danger-text` | `#a32d2d` | Negative trend pill text |
| `--inverse-bg` | `#111111` | Inverted "hero" KPI card |
| `--inverse-text` | `#ffffff` | Text on inverted card |
| `--inverse-muted` | `rgba(255,255,255,0.45)` | Muted text on inverted card |

### 2.2 Colour — Dark Theme

| Token | Value | Usage |
|---|---|---|
| `--bg-page` | `#0f0f10` | Page/canvas background |
| `--bg-surface` | `#18181c` | Cards, sidebar, topbar |
| `--bg-elevated` | `#1e1e24` | Modals, popovers |
| `--bg-subtle` | `#111115` | KPI card fills, input backgrounds |
| `--border` | `#2a2a2c` | All borders (0.5px) |
| `--border-strong` | `#3a3a3e` | Hover/focus borders |
| `--text-primary` | `#f0f0f2` | Headings, values |
| `--text-secondary` | `#888888` | Labels, descriptions |
| `--text-tertiary` | `#444444` | Hints, timestamps, placeholders |
| `--accent` | `#C3125C` | CTAs, active nav, badges |
| `--accent-hover` | `#ff4488` | Accent hover state |
| `--accent-tint` | `#2a0a18` | Accent background tint |
| `--accent-tint-border` | `#C3125C40` | Accent tint border |
| `--success-bg` | `#0e2006` | Positive trend pill bg |
| `--success-text` | `#7ec244` | Positive trend pill text |
| `--danger-bg` | `#200808` | Negative trend pill bg |
| `--danger-text` | `#f09595` | Negative trend pill text |
| `--inverse-bg` | `#C3125C20` | Accent-tinted "hero" KPI card |
| `--inverse-text` | `#ff99bb` | Text on inverted card |
| `--inverse-muted` | `#ff669966` | Muted text on inverted card |

### 2.3 Typography

```css
/* Scale — two weights only: 400 and 500. Never 600, 700. */
--font-sans: 'Inter', 'DM Sans', system-ui, sans-serif;

/* Page title */     font-size: 20px; font-weight: 500;
/* Section title */  font-size: 16px; font-weight: 500;
/* Card title */     font-size: 13px; font-weight: 500;
/* Body */           font-size: 13px; font-weight: 400;
/* Label/muted */    font-size: 12px; font-weight: 400;
/* Micro/badge */    font-size: 11px; font-weight: 500;
/* Hint */           font-size: 11px; font-weight: 400;
/* KPI value */      font-size: 22–28px; font-weight: 500;
```

Rules:
- Sentence case everywhere. Never ALL CAPS or Title Case in body/nav.
- Section labels (nav groups) may use UPPERCASE at 10–11px with `letter-spacing: 0.06em`.
- Line height: `1.5` for body, `1.2` for headings and values.

### 2.4 Spacing — 8pt grid

Use only these values: `4 8 12 16 20 24 32 40 48 64px`.  
No arbitrary values like `13px` or `22px`.

### 2.5 Border Radius

| Usage | Value |
|---|---|
| Cards, sidebar, modals | `12px` |
| Inputs, buttons (rect) | `8px` |
| Pills, chips, pill buttons | `999px` |
| Avatars | `50%` |
| Logo/icon blocks | `8px` |
| Badges/counters | `20px` |

### 2.6 Borders

- Default: `0.5px solid var(--border)` — always `0.5px`, never `1px`.
- Hover: `0.5px solid var(--border-strong)`.
- Featured/active card: `2px solid var(--accent)` — only exception to 0.5px rule.
- No box-shadows except focus rings: `0 0 0 3px var(--accent-tint)`.

---

## 3. Layout System

### 3.1 Shell Structure

```
┌─────────────────────────────────────────┐
│  TOPBAR (48px height, bg-surface)        │
├──────────┬──────────────────────────────┤
│ SIDEBAR  │  PAGE MAIN                   │
│ (220px)  │  (flex: 1, bg-page)          │
│ bg-surf  │                              │
│          │  PAGE HEADER (title + actions)│
│          │  ─────────────────────────── │
│          │  PAGE BODY (content area)    │
└──────────┴──────────────────────────────┘
```

### 3.2 Topbar

```jsx
// Height: 48px | bg: var(--bg-surface) | border-bottom: 0.5px solid var(--border)
// Padding: 0 20px | display: flex | align-items: center | gap: 12px

<topbar>
  [Logo block 28×28px, border-radius 8px]
  [Wordmark 14px/500]
  [Search input — pill shape, max-width 240px, bg-subtle]
  [spacer flex:1]
  [Avatar stack — 26px avatars, -8px overlap, 2px white border]
  [Icon button: notifications (with dot indicator if unread)]
  [Icon button: settings]
  [User avatar / profile]
</topbar>
```

- Search input must be pill-shaped (`border-radius: 999px`), `background: var(--bg-subtle)`, with a search icon inside left.
- Icon buttons: `background: transparent`, `border: 0.5px solid var(--border)`, `border-radius: 8px`, `padding: 6px`, icon 16px.
- Notification dot: `width: 7px; height: 7px; border-radius: 50%; background: var(--accent)` positioned `top: -2px; right: -2px` with a `2px` white/surface border.

### 3.3 Sidebar

```jsx
// Width: 220px (expanded), 52px (collapsed icon rail)
// bg: var(--bg-surface) | border-right: 0.5px solid var(--border)
// padding: 16px 10px | display: flex | flex-direction: column | gap: 2px

<sidebar>
  [Nav section label — 10px uppercase, text-tertiary, padding-top 12px]
  [Nav items — see 3.3.1]
  ...
  [spacer flex:1]
  [Help / logout at bottom]
</sidebar>
```

#### 3.3.1 Nav Item

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}
.nav-item:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}
.nav-item.active {
  background: var(--accent-tint);
  color: var(--accent);
  font-weight: 500;
}
/* Icon inside nav item: font-size 16px, inherits color */
/* Badge counter: margin-left auto, accent-tint bg, accent text */
```

#### 3.3.2 Collapsed Icon Rail (52px)

- Only icons, no labels.
- Active icon: `background: var(--accent)`, icon `color: #fff`, `border-radius: 8px`.
- Notification dot on bell icon when unread.
- Tooltip on hover (native `title` attribute is fine).

### 3.4 Page Layout

```jsx
// Padding: 24px | display: flex | flex-direction: column | gap: 20px

<page>
  <page-header>
    <div> // left
      <h1>Page title</h1>          // 20px/500, text-primary
      <p>Subtitle / date range</p> // 13px/400, text-secondary
    </div>
    <div> // right — action bar
      [ghost buttons: Filters, Export]
      [accent CTA button]
    </div>
  </page-header>

  <content-area>
    // KPI row, then cards grid
  </content-area>
</page>
```

---

## 4. Component Specifications

### 4.1 KPI / Metric Card

```css
/* Surface variant (standard) */
.kpi-card {
  background: var(--bg-subtle);
  border-radius: 8px;
  padding: 12px 16px;
}
/* Label */  font-size: 11px; color: var(--text-tertiary);
/* Value */  font-size: 22px; font-weight: 500; color: var(--text-primary);
/* Trend pill */ margin-top: 4px; (see 4.2)

/* Inverted/hero variant (one per section max) */
.kpi-card-hero {
  background: var(--inverse-bg);
  border-radius: 8px;
  padding: 12px 16px;
}
/* Label */  color: var(--inverse-muted);
/* Value */  color: var(--inverse-text);
```

### 4.2 Trend Pill

```jsx
// Positive
<span style="background: var(--success-bg); color: var(--success-text);
             font-size: 11px; font-weight: 500; padding: 2px 8px;
             border-radius: 999px; display: inline-flex; align-items: center; gap: 3px;">
  <TrendingUpIcon size={11} /> 7.9%
</span>

// Negative — swap --success-* for --danger-*
// Neutral — background: var(--bg-subtle); color: var(--text-secondary); border: 0.5px solid var(--border)
```

### 4.3 Card

```css
.card {
  background: var(--bg-surface);
  border: 0.5px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
}
.card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 12px;
}
```

### 4.4 Filter Chip

```css
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--bg-subtle);
  border: 0.5px solid var(--border);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 150ms ease;
}
.chip:hover { border-color: var(--border-strong); color: var(--text-primary); }
.chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
/* Dismissible chip: add × icon at end, font-size 11px */
```

### 4.5 Avatar

```css
.avatar {
  width: 28px; height: 28px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 500;
  flex-shrink: 0;
}
/* Colour pairs — bg / text */
/* Pink:   #fbeaf0 / #993556 */
/* Blue:   #e6f1fb / #185fa5 */
/* Amber:  #faeeda / #854f0b */
/* Green:  #eaf3de / #3b6d11 */
/* Dark:   #111111 / #ffffff  (for brand/workspace logo) */

/* Avatar stack: each after first gets margin-left: -8px; border: 2px solid var(--bg-surface) */
```

### 4.6 Button System

```css
/* Primary / Accent */
.btn-accent {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 999px;   /* pill shape */
  padding: 8px 20px;
  font-size: 13px; font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease;
}
.btn-accent:hover { background: var(--accent-hover); }

/* Dark / inverse */
.btn-dark {
  background: var(--text-primary);
  color: var(--bg-surface);
  border: none;
  border-radius: 999px;
  padding: 8px 20px;
  font-size: 13px; font-weight: 500;
}

/* Ghost */
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 0.5px solid var(--border);
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background 150ms ease;
}
.btn-ghost:hover { background: var(--bg-subtle); color: var(--text-primary); }

/* Icon-only */
.btn-icon {
  background: transparent;
  border: 0.5px solid var(--border);
  border-radius: 8px;
  padding: 7px;
  font-size: 16px;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.btn-icon:hover { background: var(--bg-subtle); }

/* Active press state for all buttons */
button:active { transform: scale(0.97); }
```

### 4.7 Inline Source/Referral List with Progress Bars

```jsx
// Used in: Revenue by source, platform breakdown
<div className="source-item">
  <div className="source-header">
    <div className="dot" style={{ background: color }} />
    <span className="source-name">{name}</span>
    <span className="source-value">{value}</span>
    <span className="source-pct badge">{pct}%</span>
  </div>
  <div className="progress-track">
    <div className="progress-fill" style={{ width: pct + '%', background: color }} />
  </div>
</div>

/* Track: height 4px, border-radius 2px, background var(--bg-subtle) */
/* Fill:  height 4px, border-radius 2px, background: category colour or accent */
```

### 4.8 Data Table Row

```css
/* Use CSS Grid, not <table>, for flexibility */
.table-header {
  display: grid;
  grid-template-columns: 1fr 80px 80px 60px;
  gap: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 0 0 6px;
  border-bottom: 0.5px solid var(--border);
}
.table-row {
  display: grid;
  grid-template-columns: 1fr 80px 80px 60px;
  gap: 8px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 0.5px solid var(--border);
}
.table-row:last-child { border-bottom: none; }
.table-row:hover { background: var(--bg-subtle); border-radius: 8px; }
```

### 4.9 Tooltip

```css
.tooltip {
  background: #111111;      /* Always dark regardless of theme */
  color: #ffffff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  pointer-events: none;
}
.tooltip-label { color: rgba(255,255,255,0.45); font-size: 11px; margin-bottom: 3px; }
.tooltip-value { color: #fff; font-weight: 500; }
```

### 4.10 Navigation Badge / Counter

```css
.nav-badge {
  margin-left: auto;
  background: var(--accent-tint);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 999px;
}
/* Dark mode: background var(--accent-tint) already handles it via token */
```

### 4.11 Empty State

```jsx
<div className="empty-state">
  <Icon size={28} color="var(--text-tertiary)" />
  <p className="empty-title">No reports yet</p>
  <p className="empty-sub">Create your first one to get started.</p>
  <button className="btn-ghost">New report</button>
</div>

/* Container: border: 1.5px dashed var(--border-strong);
   border-radius: 12px; padding: 32px; text-align: center;
   display: flex; flex-direction: column; align-items: center; gap: 8px */
```

### 4.12 Section Label (nav groups, column headers)

```css
.section-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: 12px 10px 4px;
}
```

### 4.13 Folder / Tree Navigation

```jsx
// Collapsible with chevron icon
// Indent children by padding-left: 20px
// Active item: color var(--accent), NOT background — just text colour change in tree context
// Unread badge: same nav-badge component
```

### 4.14 Keyboard Shortcut Badge

```css
.kbd {
  background: var(--bg-subtle);
  border: 0.5px solid var(--border-strong);
  border-radius: 5px;
  padding: 2px 6px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-secondary);
}
```

---

## 5. Interaction & Motion

```css
/* Standard transition — apply to all interactive elements */
transition: background 150ms ease, color 150ms ease, border-color 150ms ease, opacity 150ms ease;

/* Scale press for buttons */
button:active { transform: scale(0.97); transition: transform 80ms ease; }

/* Hover on cards (optional, subtle) */
.card:hover { border-color: var(--border-strong); }

/* Focus ring — replaces default outline */
*:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-tint), 0 0 0 1px var(--accent);
}

/* Page transitions (Next.js / React Router) */
/* Fade in: opacity 0 → 1 over 200ms ease */
/* No slide — slides feel heavy at dashboard scale */

/* Skeleton loading */
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.skeleton {
  background: linear-gradient(90deg,
    var(--bg-subtle) 25%,
    var(--border) 50%,
    var(--bg-subtle) 75%);
  background-size: 800px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 6px;
}
```

---

## 6. Theme Implementation (CSS custom properties)

```css
/* globals.css */
:root {
  --bg-page: #f5f5f7;
  --bg-surface: #ffffff;
  --bg-subtle: #f0f0f2;
  --border: #e8e8ea;
  --border-strong: #d0d0d4;
  --text-primary: #111111;
  --text-secondary: #666666;
  --text-tertiary: #aaaaaa;
  --accent: #C3125C;
  --accent-hover: #e0156a;
  --accent-tint: #fbeaf0;
  --accent-tint-border: #f4c0d1;
  --success-bg: #eaf3de;
  --success-text: #3b6d11;
  --danger-bg: #fcebeb;
  --danger-text: #a32d2d;
  --inverse-bg: #111111;
  --inverse-text: #ffffff;
  --inverse-muted: rgba(255,255,255,0.45);
}

[data-theme="dark"] {
  --bg-page: #0f0f10;
  --bg-surface: #18181c;
  --bg-subtle: #111115;
  --border: #2a2a2c;
  --border-strong: #3a3a3e;
  --text-primary: #f0f0f2;
  --text-secondary: #888888;
  --text-tertiary: #444444;
  --accent: #C3125C;
  --accent-hover: #ff4488;
  --accent-tint: #2a0a18;
  --accent-tint-border: rgba(195,18,92,0.25);
  --success-bg: #0e2006;
  --success-text: #7ec244;
  --danger-bg: #200808;
  --danger-text: #f09595;
  --inverse-bg: rgba(195,18,92,0.12);
  --inverse-text: #ff99bb;
  --inverse-muted: rgba(255,102,153,0.4);
}

/* Optionally also support OS preference */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* same as [data-theme="dark"] above */
  }
}
```

```jsx
// ThemeToggle.jsx — minimal implementation
const [theme, setTheme] = useState('light')
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme)
}, [theme])
```

---

## 7. Grid & Responsive Rules

```css
/* Dashboard content grid */
.page-grid {
  display: grid;
  gap: 16px;
}

/* KPI row: always 3–4 columns on desktop */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

/* Card grid: 2 columns on desktop, 1 on mobile */
.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 768px) {
  .card-grid { grid-template-columns: 1fr; }
  .sidebar { display: none; } /* collapse to drawer */
  .topbar { padding: 0 12px; }
}
```

---

## 8. Absolute Rules (Never Violate)

1. **One accent colour.** `#C3125C` (or the project's chosen accent). Nothing else gets a strong colour.
2. **0.5px borders only.** Never `1px`. Exception: `2px` for a single featured card border.
3. **Two font weights only.** `400` and `500`. Never `600` or `700`.
4. **No box-shadows** except focus rings.
5. **No gradients** on surfaces or backgrounds.
6. **8pt spacing grid.** Only use `4, 8, 12, 16, 20, 24, 32, 40, 48, 64px`.
7. **Sentence case** on all UI text. Section group labels may be uppercase at 10–11px.
8. **All numbers displayed must be rounded** — no floating point artifacts.
9. **All interactive elements must have a hover, focus, and active state.**
10. **Dark mode must be tested for every component.** Never hardcode `#333` or `#fff` — always use token variables.
11. **Semantic HTML.** Use `<button>` not `<div onClick>`. Use `<nav>`, `<main>`, `<aside>` for layout regions.
12. **Icons via Tabler outline set** (or Lucide). Outline only, 16–20px, `aria-hidden="true"` on decorative icons.

---

## 9. Agent Instructions

When generating components or pages based on this skill:

- **Always import and apply CSS tokens** via `var(--token-name)`. Do not hardcode hex values.
- **Always generate both theme variants** unless told otherwise. Verify dark mode manually.
- **Always include hover, focus-visible, and active states** on interactive elements.
- **Always use the 8pt grid** for all margin, padding, and gap values.
- **When generating a layout**, produce: topbar + sidebar + page header + content area as separate components.
- **When generating a card**, include: title, divider, body content, and an optional footer action row.
- **When generating a data list**, use CSS Grid rows, not `<table>`, unless the data is tabular with sortable columns.
- **When asked for a "dashboard page"**, default to: KPI row (3–4 cards) + 2-column card grid (chart/list + table) + page header with CTA.
- **When choosing avatar colours**, rotate through: pink (`#fbeaf0/#993556`), blue (`#e6f1fb/#185fa5`), amber (`#faeeda/#854f0b`), green (`#eaf3de/#3b6d11`). Never use the accent colour for avatars.
- **Skeleton loaders** must be included for any async data section.
- **Empty states** must be included for any list or table that can have zero items.

---

*End of UI Design System Skill v1.0*
