# Stage 2 Enhancements

Every enhancement answers one question an instructor has while deciding cutoffs at
the end of a trimester:

| # | Instructor's question | Enhancement |
|---|---|---|
| E1 | "How do I set cutoffs without breaking the ranges?" | A cutoff editor that can't produce invalid ranges |
| E2 | "Where do my cutoffs fall on this class's distribution?" | The histogram becomes the control surface |
| E3 | "Which students does moving a cutoff by one mark actually affect?" | Borderline students |

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

## E2: The histogram becomes the control surface

**Problem.** The chart and the cutoffs lived in separate panels, and the chart
grouped marks into 10-mark bins. The instructor couldn't see where a cutoff fell
on the distribution, and the bins hid exactly the detail that matters: a 10-mark
bin can't show whether the students near 80 are at 79 or at 71.

**Solution.**
- **One bar per mark:** an inline SVG histogram with one bar per mark (0–100), so
  a 79/80 boundary is exact. Each bar is coloured by the grade that mark currently
  receives (the grade ramp, via `gradeFor`).
- **Axes:** integer y-ticks with faint gridlines, and x-ticks every 10 marks.
- **Bands:** each grade band is shaded with a very light tint, with its letter
  at the top.
- **Draggable cutoffs:** every cutoff is a vertical line with a draggable handle
  (pointer events, snapping to whole marks). A drag goes through the same
  `setCutoff()` as the inputs, so it obeys the E1 limits and updates the counts,
  colours and ranges live. The handles are `aria-hidden`; the E1 inputs are the
  keyboard route to the same action.
- **Tooltips:** hovering a mark shows e.g. "79 marks: 1 student (A-)". The chart
  is one tab stop; ←/→ (and Home/End/PageUp/PageDown) move between marks and
  show the same tooltip, announced through `role="status"`.
- **Bell curve:** dashed `--ink-muted`, drawn as expected students per mark
  (n × pdf) through the bar centres, on a y-scale shared with the bars. The
  scale is max(tallest bar, curve peak), keeping the #26 fix. The curve is
  skipped when std = 0.
- **Stats and screen-reader text:** the stats row adds Std dev (population,
  matching the curve), and a visually hidden text summary gives screen-reader
  users the distribution and per-grade counts.
- **Implementation:** the chart is built once per course (and on resize).
  Cutoff changes only move and recolour existing elements, so a handle is never
  destroyed mid-drag, and the bars grow once when a course opens (reduced motion
  respected).

**Why this beats the obvious alternative.** The obvious step is to keep a static
chart and draw the cutoff lines on it. That answers "where do my cutoffs fall",
but the instructor still has to look back and forth between the chart and a
form. Making the lines draggable puts the decision where the evidence is. Per-mark
bars mean a one-mark move visibly changes which bars take which colour.

**How it was tested.**
- `E2:` tests cover the following.
  - Bar colours: they follow a cutoff move (mark 79 turns from A- to A).
  - Dragging: dragging the A handle to 78 changes the cutoff and the A count
    (checked against the fixture). Dragging A- past A stops at 79, and dragging D
    to 0 stops at 1.
  - Tooltips: the text is correct on hover and when read by keyboard.
  - The handles are aria-hidden.
  - Std dev and the hidden summary are correct.
- The Stage 1 chart tests were rewritten for the SVG (see below). A mutation
  check confirmed the clustered-marks test fails without the shared-scale fix.
- **UX bug found by testing:** the first version gave each handle a 20px
  invisible grab strip. That swallowed hover on the bars on either side of every
  cutoff, which are the marks an instructor most wants to inspect. The strip is
  now 6px and the knob is the main grab target.

---

## E3: Borderline students

**Problem.** The real grading decision is rarely "is 80 the right number". It's
"what about the three students on 78 and 79?". Those students were invisible. To
find them, an instructor had to sort the spreadsheet by hand and cross-check
every cutoff.

**Solution.**
- **Borderline panel:** for each cutoff, lists the students within N marks below
  it (N = 1, 2 or 3; default 2), with their BITS ID and mark, e.g. "3 students
  1–2 marks below A (starts at 80): 20247096 (79), 20246509 (78), 20247485 (78)".
- **Adjacent grade only:** a group only includes students in the grade
  immediately below that cutoff. A student can't appear in two groups, and a
  group can never contain a whole neighbouring band.
- **Empty groups hidden:** cutoffs with nobody near are hidden. If there are none
  at all, the panel says so ("No students are within 2 marks below any cutoff.").
- **One action per group:** "Lower A to 78 (+3 students)". It moves the cutoff to
  the lowest listed mark through `setCutoff()`, so everything updates at once. It
  is disabled, with a reason linked by `aria-describedby`, when it would leave
  the next grade down with no marks ("A- starts at 79, so A can't move down to
  79.").
- **Linked highlight:** hovering a student dims every other bar in the histogram,
  so theirs stands out.
- **Decision (confirmed):** the action lowers the cutoff to the lowest listed
  mark, so everyone listed moves up. That is one button per cutoff, not one per
  mark.

**Why this beats the obvious alternative.** The obvious alternative is a
sortable student table. It holds the same data, but the instructor would have to
work out which rows matter and what to do about them. The panel answers the
actual question ("who is one mark away, and what happens if I include them?").
It also turns the answer into a single, bounded, reversible action.

**How it was tested.**
- `E3:` tests compare the listed students per cutoff with an independent
  calculation from the demo file (N = 2, then N = 1 and 3), and check that
  cutoffs with nobody near are hidden.
- The action is tested to move the cutoff and the counts (A 8 → 11, A- 17 → 14).
  After the move, the next students below A take the group's place.
- The disabled case (A- at 79) is tested, with its reason text and
  `aria-describedby`.
- Hovering a student highlights exactly their bar.
- The empty state is tested on `identical_marks.xlsx`.

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
| #2 (canvas blank after re-upload) | E2 replaced the canvas with SVG. | The SVG chart is empty after a re-upload. |
| #12 ×6 (canvas histogram) | E2: SVG, one bar per mark. | Bars stay inside the plot and use the space. The x-axis is labelled every 10 (it was "0–9 … 90–100" bins). The curve passes through the bar centres and equals n × pdf for 1-mark bins (it was n × 10 × pdf for 10-mark bins). No curve and no NaN when std = 0. A re-upload during the opening animation leaves no stale chart. |
| #26 ×2 (clustered curve) | E2 | The curve's highest point stays inside the plot area (read from the SVG path instead of recorded canvas calls). |
