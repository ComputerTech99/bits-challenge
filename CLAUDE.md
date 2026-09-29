# CLAUDE.md: BITS Digital CodeForge V1.0

## What this project is
A challenge submission. I was given a deliberately buggy single-file web app,
a "Grading Console". An instructor uploads an Excel file of student marks,
selects a course, views analytics (histogram, bell curve, min/max/avg/median),
configures grade ranges, sees the grade distribution, and exports final grades
as CSV. It is NOT a real BITS tool; it is a prototype built for this challenge.

The challenge has three stages:
1. **Debug**: find, fix and document the intentional bugs.
2. **Reimagine**: add at least 3 meaningful enhancements that solve real
   instructor problems ("more features ≠ better product").
3. **Deploy**: make it publicly usable at a URL (GitHub Pages).

Submission checklist: bugs fixed, 3+ meaningful enhancements, completed Bug Fix
Log, public deployment, GitHub repo, and documented use of AI tools.
Evaluated on: debugging, functionality, product thinking, creativity, UX,
technical execution, deployment.

## Current stage
**STAGE 1: DEBUG.** Do not build Stage 2 features until this line changes.

## Technical constraints
- One self-contained `index.html` (HTML + CSS + JS inline). No framework, no
  bundler, no build step. It must work when opened directly and on GitHub Pages.
- The only external dependency is SheetJS, pinned:
  `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`.
  Ask before adding any other library.
- Dev-only tooling (fixture generator, Playwright tests) may use npm, but the
  shipped app must not depend on it.
- `original/` holds the untouched source file. Never edit anything in it.

## Input data contract
- Excel (.xlsx; also accept .xls), first sheet only.
- Required columns: BITS ID, Course, Total Marks (0–100). Match headers
  case-insensitively and trimmed, and also accept the brief's variants
  "Student's BITS ID" and "Total Marks (out of 100)".
- Students receiving NC (did not appear) are excluded from the file by the user.
- Grade order: A, A-, B, B-, C, C-, D, E.
- Default ranges: A 80–100 | A- 70–79 | B 60–69 | B- 50–59 | C 40–49 |
  C- 30–39 | D 20–29 | E 0–19.

## Product decisions already made (do not reopen these without asking me)
- Decimal marks are rounded half-up with `Math.round` on load (79.5 → 80,
  80.2 → 80). The original guidance text "80.2 → 81" is wrong and gets corrected.
- Single-mark bands (e.g. 100–100) are valid: the rule is min ≤ max.
- Bands must cover the full scale: A max = 100, E min = 0, no gaps or overlaps.
- Every uploaded student must receive exactly one grade. No student may be
  silently dropped from the export.
- The grading timer starts on the first course selection, not on page load.
- Invalid uploads are rejected with a readable, row-level error shown inline
  (not via `alert()`).

## How to work
- **Reproduce before you fix.** Every bug gets reproduced with a fixture or a
  precise UI action before any code changes.
- **One commit per bug:** `fix: <short description> (#N)`, where N is the
  row number in BUG_FIX_LOG.md. Update the log in the same commit as the fix.
- **Minimal, readable diffs.** I must be able to explain every change in an
  interview. Prefer plain code over clever code, and add a short comment only
  where the reason isn't obvious.
- **No silent behaviour changes.** If a fix requires a product decision not
  covered above, stop and ask me, or make the smallest reasonable choice and
  flag it in your summary.
- **Preserve the look** during Stage 1: same layout, colours and copy (except
  corrected text).
- Run the tests before every commit. If a test fails, fix it; never delete or
  weaken a test to make it pass.
- Append a dated entry to `AI_USAGE.md` at the end of every session describing
  what Claude Code did.

## Repo layout
```
index.html            the app (the only file that ships)
original/             untouched original source (read-only)
fixtures/             generated .xlsx test files + generate script
tests/                Playwright tests
BUG_FIX_LOG.md        Stage 1 log (exact format below)
ENHANCEMENTS.md       Stage 2 summary (created in Stage 2)
AI_USAGE.md           honest record of AI-tool use
README.md             what it is, how to run, live URL
```

## Commands
- Serve locally: `npx serve .`
- Regenerate fixtures: `node fixtures/generate.js`
- Run tests: `npx playwright test`

## Bug Fix Log format (required by the challenge; use exactly these columns)
| # | Bug / Issue Identified | How You Reproduced It | Root Cause | Fix Implemented | How You Tested the Fix |
|---|---|---|---|---|---|

Root Cause must explain *why* the bug happened in plain language, not restate
the symptom. Only log bugs that were actually reproduced. Anything reviewed
but deliberately left unchanged goes in a separate "Reviewed, not changed"
section with the reasoning.