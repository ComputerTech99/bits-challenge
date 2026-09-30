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

## 2026-09-30: Stage 2C (restraint pass), Claude Code (Claude Opus 5.5)

**What I asked for:** A pass that removes visual noise with no behaviour changes: one neutral bar tone, one chart label row, neutral chips, a quieter app bar with a theme menu, a dark-mode logo without a plate, icon undo/redo and a compact search, ink headings, and no "·" meta strings. One `style:` commit per item, with screenshots at 1440 and 390 in light and dark after each one.

**What the AI did**
- Planned in plan mode. I approved the plan, then the AI committed my CLAUDE.md principle ("colour is information, not decoration") and eight `style:` commits.
- Took CLAUDE.md's exact tokens (`--bar`, `--bar-focus`, `--band-alt`) over the brief's "~55% ink-muted", and checked their contrast before writing code: bars 3.1–3.3:1, focused vs neutral bars 2.2–2.8:1.
- Rewrote the tests that asserted colours or the old controls to test the same behaviour through `data-grade`, the theme menu and the new summary. Each rewrite is listed in ENHANCEMENTS.md, and none was deleted. Tests: 144 → 149.
- Added `scripts/compose-restraint.mjs` for the before/after side-by-sides in `docs/screenshots/restraint/`, and a `theme-menu` screenshot state.
- Went beyond the brief in one place, deliberately: CLAUDE.md bans "·" anywhere in the UI, so the search results and the review's impact list were restructured too (the latter as a small table), not just the setup summary.

**Where the AI got things wrong, and how that was caught**
- **Crowded labels at 390px.** The first value-only pills still staggered into two rows. Measuring the real geometry showed 28px needed against 27.7px available, so the padding was tightened to fit.
- **App bar at 360px in dark.** The seal, name and "Grading console" wrapped, and the theme button dropped a line. Measuring showed a 1px overflow, fixed with narrow-screen spacing.
- **Two script slips.** A token regex left two `--g-*-on` lines behind. A replacement aborted because one string was a substring of another, which also skipped a test edit. The failing test caught the second one.

**Human review**
I approved the plan before implementation. [To complete: my review of the Stage 2C commits.]

## 2026-09-30: Stage 2D (chart colour), Claude Code (Claude Opus 5.5)

**What I asked for:** The "Aurora" grade palette on the histogram bars (violet A to green E, ordered in OKLCH) with a 150ms recolour; neutral cutoff lines with the accent only on the active handle; focus shown by dimming the other bars to 25% and outlining the focused one, never by recolouring; a grade-coloured dot on chips and grade-coloured share bars. One `style:` commit per item, tests for contrast, palette order and the focus state, and screenshots at 1440 and 390 in light and dark.

**What the AI did**
- Planned in plan mode; I approved the plan, then four `style:` commits.
- Used the exact CLAUDE.md token values. One `[data-grade]` → `--grade` map feeds the bars, share bars and chip dots, so the chart and its legend can't disagree.
- Interpreted "focused" handle as "its cutoff is being edited", because the handles are `aria-hidden` and keyboard users move cutoffs through the editor inputs.
- Put all three focus sources (chart hover/keyboard, borderline hover, search) through the existing `applyHighlight()` instead of a separate `.active` recolour.
- Tests: 149 → 162. New tests cover per-grade fills, live recolour, the 150ms/reduced-motion transition, OKLCH hue order with no red/orange/amber hues (light and dark), neutral lines and the lit handle, dimming for hover/search/borderline (light and dark), and chip dots and share bars. Rewrites are listed in ENHANCEMENTS.md; none was deleted.
- Screenshots in `docs/screenshots/colour/`.

**Where the AI got things wrong, and how that was caught**
- **Obsolete assertion.** Item 1 broke the Stage 2C check that a focused bar was ≥ 2:1 from "the neutral bar", because no bar is neutral any more. It was pointed at the `--bar` token for one commit, then replaced by the dimming tests in item 3.
- **Flaky hover test.** Hovering a bar during its grow-in animation failed about 1 time in 3 ("outside of the viewport"). Repeating the test 15 times exposed this; it now hovers the bar's full-height hit column, which is what a real pointer lands on.
- **A script slip.** A replacement aborted because one token line was a substring of its indented copy; the assertion in the edit script caught it before anything was written.

**Open point for me:** at 390px a bar is ~3px wide, so the 1.5px ink outline covers most of a focused bar's fill; in dark it reads as a near-white bar.

**Human review**
I approved the plan before implementation. [To complete: my review of the Stage 2D commits.]

## 2026-09-30: Final fixes (#36–#50), Claude Code (Claude Opus 5.5)

**What I asked for:** No new features. Fix the four items carried over from the Stage 2D review (#36 flaky clock tests, #37 "Changed since download", #38 SheetJS fallback, #39 link previews, last) and the review of the colour build (#40 re-selecting a file, #41 squashed chip dots, #42 wrapping ranges, #43 mobile layout, #44 handle labels inside the plot, #45 focus outline on narrow bars, #46 the browser's blue clear button). Then quiet the steppers, stats and borderline actions (#47–#49) and run the suite in WebKit and Firefox (#50). One commit per item, a failing test first, and screenshots at 1440 and 390 in light and dark.

**What the AI did**
- The session broke after #40 (Step 0, #36, #37, #38 and #40 were committed). I pasted the prompt again; it read the git log and the bug log to see where it had stopped, planned the rest in plan mode, and I approved the plan.
- Reproduced each bug with a Playwright test that failed on the previous commit before fixing it (for #42 the wrap only showed with the system-font fallback; for #44 the A- label was already inside the plot at 390px with default cutoffs).
- Tests: 171 at the start of the resumed session → 191 per engine now. Rewritten tests (the Stage 2D focus outline → caret, and the WebKit keyboard changes) are listed in ENHANCEMENTS.md; none was deleted.
- Screenshots in `docs/screenshots/final/`; the link-preview image in `assets/og-image.png`.

**Per-browser results (`npx playwright test`, final commit)**

| Engine | Passed | Skipped | Failed |
|---|---|---|---|
| Chromium | 191 | 0 | 0 |
| WebKit | 189 | 2 | 0 |
| Firefox | not run | | |

- WebKit's 2 skips are the `#32` touch-drag tests, which need the Chrome DevTools Protocol.
- WebKit found one real bug, logged in #50: focus wasn't returned to "Review grades" after the review closed, because Safari doesn't focus a button on click.
- Firefox: Playwright 1.63's Firefox build won't launch on this Mac (macOS 27.0). It exits with "Could not find profile folder", also when started by hand with a fresh profile, a different `HOME`, or outside the sandbox. The project is in the config for any machine where it launches.

**Where the AI got things wrong, and how that was caught**
- **An untestable assertion.** The first #46 test read `getComputedStyle(input, "::-webkit-search-cancel-button")`, which returns the input's own style. The test failed against the fix. It now checks that the hiding rule is in the page's styles.
- **An icon that didn't follow hover.** The magnifier's `.search svg` rule also caught the new clear icon and pinned it to `--ink-muted`. The #46 hover assertion caught it.
- **Assuming Tab reaches buttons everywhere.** Four keyboard tests failed in WebKit. Two were the real focus bug. The others were Safari's Tab behaviour and its select type-ahead window, handled in the tests (Option+Tab, a pause before type-ahead) rather than skipped.
- **Wrong server directory for ad-hoc captures.** A scratch Playwright config started `serve` in the scratch folder, so the page never loaded. It was fixed by setting the server's `cwd`.

**Decisions CLAUDE.md didn't cover:** a colliding handle label hides its whole pill, not only the text; the hovered or dragged handle always keeps its label. The action bar stays sticky, and its height is reserved with `scroll-padding-bottom`: no extra page padding, because a sticky bar sits in the page flow at the bottom. `theme-color` matches `--surface` (the app bar), not `--canvas`. The OG image hides the sticky bar so the x-axis shows.

**Human review**
I approved the plan before implementation. [To complete: my review of the final-fixes commits.]
