# CLAUDE.md: BITS Digital CodeForge V1.0

## What this project is
A challenge submission. I was given a deliberately buggy single-file web app,
a "Grading Console". An instructor uploads an Excel file of student marks,
selects a course, views analytics, sets grade cutoffs, reviews the grade
distribution, and exports final grades as CSV. It is NOT a real BITS tool;
it is a prototype built for this challenge.

The challenge has three stages:
1. **Debug**: done. See BUG_FIX_LOG.md (#1–#30), tagged `stage-1-complete`
   (#31–#35 came from the Stage 2B review).
2. **Reimagine**: at least 3 meaningful enhancements that solve real
   instructor problems ("more features ≠ better product").
3. **Deploy**: publicly usable on GitHub Pages.

Submission checklist: bugs fixed, 3+ meaningful enhancements, completed Bug Fix
Log, public deployment, GitHub repo, and documented use of AI tools.
Evaluated on: debugging, functionality, product thinking, creativity, UX,
technical execution, deployment.

## Current stage
**FINAL FIXES**, then deploy.
No new features. The job now is to remove visual noise and make the product
feel finished. If a change adds ink rather than removing it, ask me first.

## Technical constraints
- One self-contained `index.html` (HTML + CSS + JS inline). No framework, no
  bundler, no build step. It must work when opened directly and on GitHub Pages.
- Allowed external resources, and only these:
  - SheetJS, pinned: `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`
  - A vendored copy of the same SheetJS build at `assets/xlsx.full.min.js`,
    loaded only if the CDN copy fails (#38).
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
- **Per-course state:** each course keeps its own cutoffs, undo/redo history and
  download status for the life of the loaded file (`courseState`); switching
  course and back restores them, and a new upload clears them. The timer and
  attempt count still reset on every course switch.
- **Autosave** stores only cutoffs and download status per course (keyed by file
  name + a fingerprint of the course list) and the theme, never marks or BITS IDs.
  Uploading the same file restores it with a "Start over" option. All storage
  access is wrapped in try/catch.
- A course is "Downloaded" while its cutoffs match the last download. Changing
  them afterwards makes it "Changed since download" (not "In progress"), the
  completion message is replaced by a prompt to download again, and moving the
  cutoffs back to the downloaded values restores "Downloaded" (#37).
- Reset never asks for confirmation; it is one undo step with an inline Undo.
- **The CSV export format does not change**: same header block, same columns,
  same grade labels, BOM, formula-injection guard and filename pattern.
- Invalid input is reported inline with specific, row-level messages. Never use `alert()`.

## Design system (applies to every component)
Subject: a tool an instructor uses to make consequential decisions about
students' grades. The feel is calm, precise and institutional, like a
well-made mark sheet, not a marketing dashboard or an infographic. The chart
is the centrepiece: its colour is the one place the product is allowed to be
beautiful, and everywhere else stays quiet.

**Core principle: colour is information, not decoration.** The screen is
neutral by default. Colour appears in exactly two roles:
1. **Grade encoding:** the "Aurora" palette, a perceptually ordered ramp from
   violet (A) through blue and teal to green (E), built in OKLCH. Grades are
   ordinal, so their colours are ordered too: one continuous sweep, never
   unrelated hues. It is used ONLY on the histogram bars and on the chart's
   legend, meaning the share bars and a small dot on grade chips. Nowhere else.
2. **Interaction:** the accent marks the primary action, focus rings, and a
   cutoff handle while it is hovered or dragged.
Focus on a student (hover, search, borderline) is shown by dimming every other
bar to 25% opacity and outlining the focused one, never by recolouring.
No reds, oranges or ambers in the grade palette: low grades must not read as
errors. Red (`--danger`) is for errors only.

**Colour tokens, light** (CSS custom properties on `:root`)
- `--ink #1c1a33` (text and all headings) · `--ink-muted #5f5b78` (labels,
  secondary text) · `--rule #e3e0ef` (borders) · `--rule-strong #c9c3de`
  (hover borders, axis, drop zone)
- `--canvas #f5f4fa` (page) · `--surface #ffffff` (panels)
- `--accent #5b3cc4` (BITS purple) · `--accent-soft #eeeafb` (quiet tint,
  e.g. a highlighted row or the drop zone on hover) · `--on-accent #ffffff`
- Grade palette "Aurora" (light): `--g-A #4e2999` · `--g-Am #3343a6` ·
  `--g-B #005aa3` · `--g-Bm #006d97` · `--g-C #007b8b` · `--g-Cm #00887e` ·
  `--g-D #0b936c` · `--g-E #4e9a52`. Every colour is ≥ 3:1 on the surface and
  on band-alt (the lowest is 3.25:1).
- `--bar #8f8ca0` remains only as a fallback before grades are assigned.
- `--cutoff-line` = `--ink-muted` at 60% (lines are neutral now that the bars
  carry colour; the accent appears only on the active handle).
- `--band-alt #f8f7fc` (a barely visible shade on alternate grade bands so
  they remain distinguishable; no other band tints)
- `--danger #b42318` · `--danger-soft #fef3f2` · `--danger-rule #f1c4bf`
- `--shadow`, `--backdrop` (review dialog only)
- The bell curve is thin, dashed and `--ink-muted`.

**Dark theme (E8).** The same tokens are redefined under `:root[data-theme="dark"]`
and under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`.
The two blocks must stay identical (a test compares them). No component may
name a colour of its own; a test fails on any hex/rgb outside the token blocks.
Canvas `#121120` · surface `#1b1a2e` · rule `#2e2c45` · rule-strong `#45425f` ·
ink `#ecebf5` · ink-muted `#a6a3bf` · accent `#9b87f0` · accent-soft `#2a2650` ·
on-accent `#121120` (white fails AA on the light accent) · bar `#6e6b88` ·
grade palette (dark; A is the brightest, so it stays the most prominent):
A `#c0aeff` · A- `#98b1ff` · B `#72b4f8` · B- `#52b5df` · C `#45b2c2` ·
C- `#3faea4` · D `#43a883` · E `#5a9f5d` (all ≥ 5:1 on the dark surface and band-alt) ·
band-alt `#201f35` · danger `#f97066` · danger-soft `#3a1d22` · danger-rule `#6b2c2c`.
Tests enforce: bars ≥ 3:1 against the surface and the band-alt shade in both
themes, the grade palette's order (OKLCH hue decreasing from A to E), and all
text ≥ AA. Grade colours never carry text, so there's no text-on-grade contrast to manage.

**Components**
- **App bar:** logo, "Grading console", course name, grading time, and a single
  theme icon button (sun/moon) that opens a small Light / Dark / System menu,
  saved in `localStorage` (`gradingConsole:v1:theme`). Nothing else. The
  instructor name and student count live in the setup summary.
- **Logo:** in light mode, the full BITS Pilani Digital lockup. In dark mode,
  the seal alone followed by "BITS Pilani Digital" set as text in `--ink`.
  No plates or boxes behind the logo.
- **Chart:** one row of labels only, the cutoff handles ("A 80", 12px, 500
  weight, neutral border; accent on hover or drag; value only if labels
  collide). No band-letter row. Bars in their grade colour; cutoff lines in
  `--cutoff-line`; the active handle in the accent. Bars recolour live as
  cutoffs move (a 150ms fill transition, disabled under reduced motion).
- **Grade chips:** neutral: `--surface` background, 1px `--rule` border, `--ink`
  text, plus an 8px dot in the grade colour before the letter. Share bars in
  the distribution table use the grade colour, so the table doubles as the
  chart's legend.
- **Panel headers:** heading in `--ink`, weight 600. Secondary actions are
  quiet: icon buttons for undo/redo (with tooltip and `aria-label`), a text
  button for reset, and a compact search field with an icon.
- **No meta strings:** don't join facts with "·" in the UI. Use label/value
  pairs with spacing. Statuses in native `<select>` options go in
  parentheses, e.g. "Linear Algebra (Downloaded)".

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
  390px wide, in light AND dark, using `fixtures/demo_marks.xlsx`. Look at
  them and apply the subtraction test: if an element doesn't help the
  instructor decide, remove it or make it quieter. Fix anything that looks
  off before committing.
- Append a dated entry to `AI_USAGE.md` at the end of every session.

## Repo layout
```
index.html            the app (the only file that ships)
original/             untouched original source (read-only)
fixtures/             generated .xlsx test files + generate script + demo_marks.xlsx
tests/                Playwright tests
docs/screenshots/     before/after (and restraint/) screenshots for the submission
assets/               logo, favicon, OG image, vendored SheetJS fallback
BUG_FIX_LOG.md        bug log: Stage 1 (#1–#30), review fixes (#31–#39)
ENHANCEMENTS.md       Stage 2: problem → solution → how tested, per enhancement
AI_USAGE.md           honest record of AI-tool use
README.md             what it is, how to run, live URL
```

## Commands
- Serve locally: `npx serve .`
- Regenerate fixtures: `node fixtures/generate.js`
- Run tests: `npx playwright test`