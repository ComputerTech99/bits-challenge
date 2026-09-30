# BITS Digital CodeForge: Grading Console

A single-file web app (`index.html`) that helps an instructor decide fair grade
cutoffs for a course and submit the grades. It was built for the BITS Digital
CodeForge challenge and is a prototype, not an official BITS tool.

**Live URL:** _coming soon (GitHub Pages)_

**Try it:** [download the sample marks file](fixtures/demo_marks.xlsx) (3
courses, 148 students), open the app, enter a name, and drop the file onto the
upload area.

## What it does
- **Upload** an Excel file (`.xlsx` or `.xls`) with the columns BITS ID, Course
  and Total Marks. Bad rows are rejected with row-level messages (missing or
  out-of-range marks, duplicate IDs in a course, and so on).
- **See the distribution:** one bar per mark, coloured by the grade it currently
  gets, with grade bands, a bell curve, and Min / Max / Avg / Median / Std dev.
- **Set cutoffs** by dragging the lines on the chart or using the seven "from"
  controls. Ranges are always continuous from 0 to 100, so an invalid set can't
  be entered.
- **Check borderline students:** everyone within 1–3 marks below a cutoff, with
  a one-click "Lower A to 78 (+3 students)".
- **Undo, redo and reset** next to the chart (also Ctrl/Cmd+Z and
  Shift+Ctrl/Cmd+Z). A whole drag is one step, each changed cutoff has its own
  "Reset to 80", and "Reset to defaults" can be undone from an inline notice.
- **Track progress across courses:** each course shows Not started, In progress
  or Downloaded, and cutoffs are kept per course. They survive a refresh when you
  upload the same file again (see "What it stores" below).
- **Find a student** by BITS ID (from 4 characters, partial and
  case-insensitive) to see their mark and current grade, with their bar
  highlighted.
- **Dark mode** that follows your system, with a Light / Dark / System switch.
- **Review, then download.** A review dialog summarises the grade counts, the
  cutoffs changed from the defaults, exactly which students' grades differ from
  the defaults (for example "20247096 · 79 · A- to A"), the grading time, and anyone
  still on a boundary before the CSV downloads. The CSV format is identical to Stage 1.

## What it stores on your computer
To survive a refresh, the app saves each course's **cutoffs and download status**
in your browser's `localStorage`, keyed by the file name and a fingerprint of the
course names. It never stores **marks or BITS IDs**: those stay only in the page's memory
and are gone when you close it. Nothing is sent anywhere. Upload the same file again
and your cutoffs come back, with a "Start over" option. If the browser blocks storage
(for example in some private windows), the app works the same but doesn't remember.

Details: [ENHANCEMENTS.md](ENHANCEMENTS.md) (Stage 2),
[BUG_FIX_LOG.md](BUG_FIX_LOG.md) (bugs #1–#35),
[AI_USAGE.md](AI_USAGE.md) (how AI tools were used).

## Run it locally
There's no build step. The only runtime dependencies are SheetJS 0.18.5 and IBM
Plex Sans from CDNs, with a system-font fallback. Open `index.html` directly, or
serve the folder:

```sh
npx serve .
```

## Develop and test
Node is only needed for the dev tooling:

```sh
npm install
npx playwright install chromium
node fixtures/generate.js   # regenerate the .xlsx test fixtures
npx playwright test         # run the Playwright suite (starts its own server)
```

Screenshots for the docs are generated with
`SHOTS_OUT=docs/screenshots/after npx playwright test -c playwright.screenshots.config.js scripts/screenshots.spec.js`
(add `SHOTS_THEME=dark` for the dark set).
