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
