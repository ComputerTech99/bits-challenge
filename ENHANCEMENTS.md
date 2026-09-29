# Stage 2 Enhancements

Every enhancement answers one question an instructor has while deciding cutoffs at
the end of a trimester:

| # | Instructor's question | Enhancement |
|---|---|---|
| E1 | "How do I set cutoffs without breaking the ranges?" | A cutoff editor that can't produce invalid ranges |

All grade calculations go through one function, `gradeFor(mark)`. The counts, the
distribution table, the chart, the borderline list and the CSV export can't
disagree. The CSV format is frozen: byte-for-byte golden tests compare the export
with what the Stage 1 app produced (`tests/golden/`).

---

## E1: A cutoff editor that can't produce invalid ranges

**Problem.** Stage 1 showed 16 dropdowns with 101 options each, a Min and a Max for
every grade, even though continuous bands are fully described by 7 numbers. That
made it easy to create a gap or an overlap and then be told off with an error.
Changing one grade meant checking its neighbours by hand. The instructor was doing
bookkeeping instead of deciding where the cutoffs should be.

**Solution.**
- **Seven cutoff controls:** "A from" … "D from". Each is a labelled number input
  with − / + buttons, the arrow keys, and typing. E always starts at 0 and A always
  ends at 100, shown as fixed text.
- **Derived ranges:** each band's range (e.g. "A-: 70–79") is shown read-only
  beside its control and updates live.
- **Constraints:** every cutoff is kept between the next-lower cutoff + 1 and the
  next-higher cutoff − 1 (and between 1 and 100), so every band keeps at least one
  mark. Arrow keys and valid typing apply immediately. An out-of-range value is
  clamped when the field loses focus, and an inline note says what happened ("A-
  must start between 61 and 79, so it was set to 79."). The −/+ buttons disable at
  their limits. Because an invalid configuration can't be reached, the old
  range-error message path is gone.
- **One source of truth:** a single `cutoffs` object, with `gradeFor(mark)`,
  `bandRange(g)` and `setCutoff(g, v)` (the only way cutoffs change) deriving
  everything else.
- **Distribution table:** the side panel shows every grade's range, student count
  and share, with each grade's ramp colour.
- **Reset and change counter:** "Reset cutoffs" restores the defaults after one
  confirmation, and is disabled when nothing differs from the defaults or no course
  is open. The action bar says how many cutoffs differ from the defaults.
- **Announcements, not animation:** grade-count changes are announced to screen
  readers through an `aria-live` region ("Grade counts changed: A from 5 to 4, A-
  from 2 to 3."). This replaces the Stage 1 card "lift" and chip "pulse"
  animations, which the design system rules out.

**Why this beats the obvious alternative.** The obvious fix would be to keep the
Min/Max dropdowns and improve the validation messages. But that still lets the
instructor build a broken configuration, then makes them repair it. With one
number per boundary, a gap or overlap simply can't be expressed. The instructor
only ever answers the real question ("where does A start?"), and everything else
follows from it.

**How it was tested.**
- `E1:` tests in `tests/grading.spec.js` cover the default derived ranges,
  clamping with the note, restoring an emptied field, arrow-key stepping that
  applies immediately, −/+ limits, and the change counter.
- A golden test sets A 78 / B- 52 through the new controls and checks that the
  CSV is byte-identical to the Stage 1 export for the same cutoffs.
- The ground-truth test (demo file, Introduction to Programming: Min 0, Max 100,
  Avg 60.78, Median 64, A 8 · A- 17 · B 10 · B- 13 · C 9 · C- 4 · D 1 · E 2) still
  passes.

---

## Stage 1 tests rewritten in Stage 2

When a Stage 2 change legitimately made a Stage 1 test obsolete, the test was
rewritten to check the same guarantee through the new UI. None was deleted.

| Test | Why it changed | What it checks now |
|---|---|---|
| #23b (no-instructor prompt) | `alert()` is banned by CLAUDE.md, so the prompt became inline (`fix:` commit). | No dialog. The inline message appears, focus moves to the name field, and typing clears it. The previous course is still cleared. |
| #15, #23b, #27b (retype the name mid-flow) | Setup collapses once a course is open, which hides the name field. | They click "Edit" first (`setInstructor` helper). Assertions unchanged. |
| Happy path (welcome text) | The welcome text no longer upper-cases the name. | Welcome text shows the name as typed. |
| #12 curve tests (stub context) | The curve became dashed, so the stub needs `setLineDash`. | Unchanged assertions. The stub gained a no-op `setLineDash`. |
| #8 ×2 (A ends at 100, E starts at 0) | E1 removed the Min/Max selects. | Typing A 150 clamps to 100 (A: 100–100), and nobody is dropped from the export. E has no input, and D can't go below 1 (E: 0–0). |
| #9 (single-mark band) | E1 | A from 100 gives A: 100–100 with no clamp note, and the export grades 100 as A and 80 as A-. |
| #10 ×2 (cascades) | E1: one number per boundary, so no cascade code. | Changing a cutoff updates both neighbouring derived ranges. |
| #16 (lift/pulse timing) | The design system forbids hover lifts and pulsing chips. | A count change is announced once via `aria-live`, and a change that moves nobody leaves the announcement alone. |
| #17 (no pulse on course switch) | As #16. | Switching course leaves the live region empty (no spurious announcement). |
| #19 ×2 (reset confirms once) | E1 | The same guarantees through "Reset cutoffs" and the cutoff inputs. |
| #22 (reset before a course) | E1: the button is now disabled until there is something to reset. | Disabled on a fresh page and after upload. A forced click causes no error and no dialog. |
| Happy path (adjust a range) | E1 | The cutoff is adjusted with the new input. Counts are read from the distribution table. |
