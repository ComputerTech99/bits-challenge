# AI Usage

## 2026-09-29: Stage 1 (Debug), Claude Code (Claude Opus 5.5)

I used Claude Code in the terminal, working from `CLAUDE.md` and a written Stage 1 brief listing 20 suspected bugs.

**What Claude Code did**
- **Repo setup:** initialised git, preserved the untouched source in `original/`, created the working copy `index.html`, and added `.gitignore` and `package.json` (dev tooling only).
- **Fixtures:** wrote `fixtures/generate.js` (SheetJS, seeded so the output is reproducible), which produces the 10 fixtures from the brief plus three extras it proposed: `messy_headers.xlsx` (header case/whitespace), `numeric_course.xlsx` (course codes stored as numbers) and `corrupt.xlsx` (an unreadable file).
- **Diagnosis:** for each of the 20 listed bugs it wrote a Playwright regression test first and ran it against the unfixed code to confirm the bug. Where a test couldn't show the symptom directly, it used a short throw-away script (e.g. the export with a blank instructor, and the export for a numeric course). It then audited the whole file and found five more bugs (#21–#25: unpinned SheetJS, Reset Range throwing before a course is open, the grading view getting out of sync with the dropdown, numeric/whitespace course codes, and uncaught errors on unreadable files), which were reproduced the same way.
- **Fixes:** one commit per bug (`fix: … (#N)`), each containing the code change, its regression test and its `BUG_FIX_LOG.md` row, with the full suite run before every commit.
- **Tests:** `tests/grading.spec.js` has 41 tests: an end-to-end happy path (upload → course → adjust range → export, with the expected grades computed independently from the fixture) and at least one regression test per bug. It passed 5 repeated runs (205/205). Canvas appearance, the file picker, the timer ring and the CSS animations have manual steps in the log.
- **Docs:** `BUG_FIX_LOG.md`, this file and `README.md`.

**Where the AI got things wrong, and how that was caught**
- The first draft of the #3 log row described a manual file-picker check that hadn't actually been done. It was reworded to state only what was verified.
- The first #17 test passed on the buggy code: a retrying assertion simply waited out the 250 ms pulse. It was rewritten to read the chips once, and the timer/animation tests were switched to a paused fake clock for the same reason. Mutation checks (temporarily undoing the #11 and #16 fixes) confirmed those tests fail without the fix.
- A test helper built CSS selectors from course names, which broke on names containing quotes. It was replaced with a value comparison.
- A histogram screenshot showed the 10 px bin labels still running together, so they were reduced to 9 px.

**Human review**
I reviewed every change (code, tests, fixtures and documentation) before accepting it, and I can explain each fix. Product decisions not already covered by `CLAUDE.md` were listed for me by Claude Code, and I confirmed them.

## 2026-09-29: Stage 1 follow-up (#26–#30), Claude Code (Claude Opus 5.5)

I gave Claude Code five further issues and a clean-up list, under the same rules as before (reproduce first, one commit per bug with its log row and regression test).

**What Claude Code did**
- **#26 bell-curve overflow:** added `clustered_marks.xlsx` and a test that records every point on the curve. The test reproduced the overflow (the curve's top was at y ≈ −925 and y ≈ −5.5). The fix scales the y-axis to max(tallest bin, curve peak). This changed the bar height for `large_class`, so the #12 bar-scaling test was updated to assert the new rule exactly (it didn't just get looser bounds).
- **#27 per-course timer/attempts/messages:** this implements my decision to reverse part of #11. The #11 test that asserted the timer carried on across courses was rewritten to the new rule, and the log says so.
- **#28 duplicate IDs:** added `duplicate_ids.xlsx`. Claude noticed that its first "different courses are fine" test used fixtures with no shared IDs, so it proved nothing. It added `cross_course_ids.xlsx` to make that check real.
- **#29 CSV formula injection** (OWASP single-quote prefix) and **#30** (UTF-8 BOM, Blob URL revoked after 40 s). For #30 the test helper now strips the BOM from the text it compares, and the BOM is asserted on the raw bytes.
- **Clean-up:** confirmed the root copy of the source was byte-identical to `original/` before deleting it, committed `CLAUDE.md`, and removed the LOCKED markers (kept the section names BASE / ANIMATIONS / TIMER as headers). Removed the "Reviewed, not changed" rows that these fixes resolved.
- **Tests:** 51 tests, 255/255 over 5 repeated runs.

**Where the AI got things wrong, and how that was caught**
- While rewriting the #11 test it accidentally deleted two shared test helpers. The next full run caught it (5 `ReferenceError`s), and the helpers were restored from the previous commit.
- The #30 edit first inserted an invisible literal BOM character into the source. Claude spotted it because a `grep` for `uFEFF` came back empty, and replaced it with the visible `﻿` escape.
- The commits for #1–#25 are missing the `Co-Authored-By` trailer. Rewriting that history was blocked and left for me to decide. The commits from this session include it.

**Human review**
I reviewed every change in this session (code, tests, fixtures and documentation) before accepting it.

## 2026-09-29: Stage 2 (Reimagine), Claude Code (Claude Opus 5.5)

I gave Claude Code the Stage 2 brief (E1–E4, a visual foundation, and a polish
pass). It planned in plan mode first and asked me three questions: the
borderline action rule, how to handle the lift/pulse tests, and the
`stage-1-complete` tag. I approved the plan before any code was written.

**What Claude Code did**
- **Safety nets first:**
  - It added my demo file with a ground-truth test (Introduction to Programming:
    Min 0, Max 100, Avg 60.78, Median 64, A 8 · A- 17 · B 10 · B- 13 · C 9 ·
    C- 4 · D 1 · E 2), confirmed against the Stage 1 app.
  - It captured "golden" CSV exports from the Stage 1 app (three courses with
    default cutoffs, plus A 78 / B- 52). Every later commit had to reproduce them
    byte for byte.
- **Foundation (3 `style:` commits + 1 `fix:`):** design tokens and IBM Plex, the
  app bar, panel grid and sticky action bar; a labelled setup panel with a drop
  zone, sample-file link and collapse/Edit; the empty state and error callouts.
  It also replaced a leftover `alert()` with an inline prompt.
- **E1–E4, one `feat:` commit each** with its ENHANCEMENTS.md entry and tests:
  - E1: the cutoff editor, with `gradeFor()` as the single grading function;
  - E2: the interactive SVG histogram;
  - E3: the borderline students panel;
  - E4: the review dialog.
- **Polish:** screenshots of 7 states × 3 widths, reviewed and fixed; a keyboard
  and screen-reader pass; the welcome line cut as redundant.
- **Tests:** 51 → 91 Playwright tests. Every Stage 1 test that the redesign made
  obsolete was rewritten to check the same guarantee through the new UI. None
  was deleted, and each rewrite is listed in ENHANCEMENTS.md.

**Where the AI got things wrong, and how that was caught**
- A CSS cut used an ambiguous anchor and duplicated part of the stylesheet. It
  was caught by counting rules, reverted, and redone with exact anchors.
- The E2 cutoff handles had 20px invisible grab strips that swallowed hover on
  the bars either side of every cutoff. A test caught it, and the strips were
  narrowed to 6px.
- After E4 moved "Download" into the dialog, three tests still checked that the
  old button was enabled. They were passing vacuously, because the button now
  sat inside a closed dialog. They were repointed to "Review grades".
- One test's expected numbers were computed by hand and were wrong. They were
  re-derived from the fixture rather than copied from the app's output.
- The demo file was in `~/Downloads`, not the repo root. It was copied (not
  moved), so the original stays where I left it.

**Human review**
I reviewed every change in this session (code, tests, fixtures, screenshots and
documentation) before accepting it.

## 2026-09-29 to 2026-09-30: Stage 2B (fixes from review + E5–E9), Claude Code (Claude Opus 5.5)

I gave Claude Code a review-driven brief:
- 4 bugs
- 4 chart follow-ups
- features E5–E9
- final checks

It explored the code in plan mode, wrote a plan listing the decisions CLAUDE.md didn't cover, and
waited for my approval before changing anything.

**What Claude Code did**
- **Bugs #31–#35, one `fix:` commit each.**
  - Each bug got a failing test first, run against the previous commit's `index.html` (served from
    a scratch folder) to prove it reproduced.
  - #31: cutoffs kept per course.
  - #32: wider, touch-safe drag handles. A touch test showed CSS `touch-action` alone didn't stop
    Chromium scrolling mid-drag, so a scoped `touchstart` guard was added and shown to be needed.
  - #33: context shown once, in the app bar.
  - #34: y-axis headroom.
  - #35: reset without `confirm()`, after undo existed.
- **Chart follow-ups.**
  - Labelled handle pills that stagger when crowded.
  - Default-position markers.
  - The per-letter colour system: the proposed A-, B- and C- failed WCAG checks, so their
    lightness was tuned and the values recorded in CLAUDE.md.
- **E5–E9, one `feat:` commit each,** each with its ENHANCEMENTS.md entry and tests:
  - E5: undo, redo and reset
  - E6: progress and autosave, never marks or IDs
  - E7: find a student
  - E8: dark mode through tokens only
  - E9: impact list and grading time in the review
- **Checks.**
  - Screenshots at 1440 and 390 after every visual change, looked at and fixed. For example, the
    search results first stacked five lines above the chart and were reflowed inline.
  - A keyboard-only walkthrough test and touch emulation at 390px.
  - The Stage 1 ground-truth and golden CSV tests pass unchanged.
- **Tests:** 94 → 144. Each Stage 1/2 test changed by this work is listed in ENHANCEMENTS.md
  under "tests rewritten". None was deleted.

**Where the AI got things wrong, and how that was caught**
- **A factual error in the Stage 1 log.** The first #31 test re-uploaded the identical file and
  failed, because no `change` event fires for the same file. That showed the log's claim that
  Playwright always dispatches `change` was wrong, and the row was corrected.
- **Test bugs, not app bugs.**
  - A new contrast test composited colours with decimals that the old `contrast()` helper
    mis-parsed, reporting false failures. Fixed by rounding.
  - An E9 test assumed A could be set to 70. The app correctly clamped it to 71.
- **Code slips caught before committing.**
  - A width fallback that could never apply.
  - A CSS `isolation` rule that has no effect in SVG.
  - A lost newline in the stylesheet.
- **A UI wobble.** A theme-switch click in a test kept failing Playwright's stability check. A
  real mouse click worked, but the cause was the selected label turning bold and shifting its
  neighbours, so the weight was made constant.
- **Process.** One shell command hung (a stray `cat` waiting on input) and was stopped. An
  attempt to use `git stash` for a before/after check was declined by me and replaced with
  serving the old file from a scratch folder.

**Human review**
I approved the plan before implementation. [To complete: my review of the Stage 2B commits.]
