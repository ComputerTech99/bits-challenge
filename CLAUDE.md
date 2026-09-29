# CLAUDE.md: BITS Digital CodeForge V1.0

## What this project is
A challenge submission. I was given a deliberately buggy single-file web app,
a "Grading Console". An instructor uploads an Excel file of student marks,
selects a course, views analytics, sets grade cutoffs, reviews the grade
distribution, and exports final grades as CSV. It is NOT a real BITS tool;
it is a prototype built for this challenge.

The challenge has three stages:
1. **Debug**: done. See BUG_FIX_LOG.md (#1–#30), tagged `stage-1-complete`.
2. **Reimagine**: at least 3 meaningful enhancements that solve real
   instructor problems ("more features ≠ better product").
3. **Deploy**: publicly usable on GitHub Pages.

Submission checklist: bugs fixed, 3+ meaningful enhancements, completed Bug Fix
Log, public deployment, GitHub repo, and documented use of AI tools.
Evaluated on: debugging, functionality, product thinking, creativity, UX,
technical execution, deployment.

## Current stage
**STAGE 2: REIMAGINE.** The task list is in STAGE2_PROMPT.md.

## Technical constraints
- One self-contained `index.html` (HTML + CSS + JS inline). No framework, no
  bundler, no build step. It must work when opened directly and on GitHub Pages.
- Allowed external resources, and only these:
  - SheetJS, pinned: `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`
  - Google Fonts (IBM Plex Sans), with a system-font fallback so the app
    still looks right offline.
  Ask before adding anything else.
- Dev-only tooling (fixture generator, Playwright tests) may use npm, but the
  shipped app must not depend on it.
- `original/` holds the untouched source file. Never edit anything in it.

## Input data contract (unchanged from Stage 1)
- Excel (.xlsx; also accept .xls), first sheet only.
- Required columns: BITS ID, Course, Total Marks (0–100), with the header
  normalisation already in place.
- Students receiving NC (did not appear) are excluded from the file by the user.
- Grade order: A, A-, B, B-, C, C-, D, E.
- Default cutoffs: A 80 · A- 70 · B 60 · B- 50 · C 40 · C- 30 · D 20 · E 0.

## Product decisions (do not reopen these without asking me)
- Decimal marks are rounded half-up on load.
- Bands are continuous and cover 0–100: A always ends at 100, E always starts
  at 0. Single-mark bands are valid.
- Every uploaded student gets exactly one grade; nobody is silently dropped.
- Duplicate BITS IDs within a course are rejected; the same ID across courses is fine.
- The timer, attempt count and completion message are per course. The timer
  stays (it is original functionality) but is visually secondary.
- **The CSV export format does not change**: same header block, same columns,
  same grade labels, BOM, formula-injection guard and filename pattern.
- Invalid input is reported inline with specific, row-level messages. Never use `alert()`.

## Design system (applies to every component)
Subject: a tool an instructor uses to make consequential decisions about
students' grades. The feel is calm, precise and institutional, like a
well-made mark sheet, not a marketing dashboard. Spend visual boldness in
ONE place: the histogram with its grade bands. Everything else stays quiet.

**Colour tokens** (CSS custom properties on `:root`)
- `--ink #1c1a33` (text) · `--ink-muted #5f5b78` · `--rule #e3e0ef` (borders)
- `--canvas #f5f4fa` (page) · `--surface #ffffff` (panels)
- `--accent #5b3cc4` (BITS purple: primary action, focus, active cutoff)
- `--accent-strong #312e81` (headings, app title)
- `--danger #b42318` (errors ONLY; nothing else is ever red)
- Grade ramp, one hue from dark to light, used for bars, chips and bands:
  A `#2e1f7a`, A- `#3f2c9c`, B `#5b3cc4`, B- `#7a61d1`, C `#9a86dd`,
  C- `#b7a8e8`, D `#d0c6f1`, E `#e6e0f8`. Text on each ramp step must meet
  WCAG AA; use white text on the four darkest steps and ink on the rest.
- The bell curve is `--ink-muted`, dashed. Never red.

**Type**: IBM Plex Sans throughout (400/500/600). Scale 12 / 14 / 16 / 20 / 24px.
All numbers use `font-variant-numeric: tabular-nums`. Values are heavier than
their labels, never the other way round. Sentence case everywhere: no
ALL-CAPS labels, no uppercasing of user input.

**Space and shape**: 8px spacing grid (4px allowed for tight pairs). Panels
use a 1px `--rule` border, 12px radius and no drop shadows. Inputs and buttons
are 40px tall with 8px radius. There is one shadow, and only on the review dialog.

**Motion**: only in response to the user (a band shifting while a cutoff is
dragged, the dialog opening) plus the bars growing once on first render.
No hover lifts on cards and no pulsing chips. Honour `prefers-reduced-motion`.

**Copy**: plain verbs, sentence case, and buttons that say exactly what happens
("Download grades (CSV)", not "Submit"). No arrow glyphs appended to buttons.
Errors state what's wrong and how to fix it, without apologising.

**Quality floor**: works from 360px to 1600px wide; every control has a
visible label and a visible `:focus-visible` ring; everything works by
keyboard; errors and grade-count changes are announced via `aria-live`.

## How to work
- Plan before building: use plan mode and get my approval first.
- **One commit per enhancement:** `feat: <description> (E#)`, with its row
  in ENHANCEMENTS.md and its tests in the same commit. Pure styling commits
  use `style: …`.
- Keep the code readable. I must be able to explain every change in an
  interview. Route all grade calculations through ONE function so the chart,
  counts, borderline list and export can never disagree.
- Run the full test suite before every commit. When a Stage 2 change
  legitimately makes a Stage 1 test obsolete (e.g. tests that drive the old
  Min/Max selects), rewrite it to test the same behaviour through the new
  UI, and never delete a test just to get the suite passing. Note each
  rewrite in ENHANCEMENTS.md.
- After each visual change, take Playwright screenshots at 1440, 1024 and
  390px wide using `fixtures/demo_marks.xlsx`, look at them, and fix
  anything that looks off before committing.
- Append a dated entry to `AI_USAGE.md` at the end of every session.

## Repo layout
```
index.html            the app (the only file that ships)
original/             untouched original source (read-only)
fixtures/             generated .xlsx test files + generate script + demo_marks.xlsx
tests/                Playwright tests
docs/screenshots/     before/after screenshots for the submission
BUG_FIX_LOG.md        Stage 1 log (#1–#30)
ENHANCEMENTS.md       Stage 2: problem → solution → how tested, per enhancement
AI_USAGE.md           honest record of AI-tool use
README.md             what it is, how to run, live URL
```

## Commands
- Serve locally: `npx serve .`
- Regenerate fixtures: `node fixtures/generate.js`
- Run tests: `npx playwright test`