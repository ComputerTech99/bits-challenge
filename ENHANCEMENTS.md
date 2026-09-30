# Stage 2 Enhancements

Every enhancement answers one question an instructor has while deciding cutoffs at
the end of a trimester:

| # | Instructor's question | Enhancement |
|---|---|---|
| E1 | "How do I set cutoffs without breaking the ranges?" | A cutoff editor that can't produce invalid ranges |
| E2 | "Where do my cutoffs fall on this class's distribution?" | The histogram becomes the control surface |
| E3 | "Which students does moving a cutoff by one mark actually affect?" | Borderline students |
| E4 | "Am I sure about what I'm about to submit?" | Review before export |
| E5 | "What if I drag the wrong line?" | Undo, redo and reset where you need them |
| E6 | "Which of my courses are done, and will a refresh lose my work?" | Per-course progress and autosave |
| E7 | "A student asks: what did I get?" | Find a student |
| E8 | "I grade late at night, and the white page glares." | Dark mode |
| E9 | "Whose grade am I actually changing?" | Impact of changes in the review |

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

### Stage 2B follow-up: handles you can read

**Problem (from review).** The handles were bare lines with a small knob. You had to look at the
controls below to know which cutoff a line was and what value it had. Nothing told you the
lines could be dragged at all.

**Solution.**
- Each knob is now a pill labelled with its grade and value ("A 80"). The label updates live
  during a drag.
- Hovering or dragging makes the line and pill accent-coloured (a filled pill with white text).
  The cursor is `ew-resize`.
- Where two pills would touch (cutoffs close together, or a 390px screen), the later one drops
  to a second row. Labels never cover each other, and pills stay inside the plot at 0 and 100.
- A line of helper text under the panel title: "Drag a line or use the controls below to move a
  cutoff."

**How tested.** `E2+` tests:
- The labels read `A 80 … D 20` and follow a typed cutoff.
- During a mouse drag (button still down) the label reads the new value and the handle has its
  active state.
- Pill bounding boxes never overlap at 1440px or 390px, including with A- moved right next to A.

Screenshots checked at 1440 and 390.

### Stage 2B follow-up: where the default was

**Problem.** Once a line has been dragged, the chart no longer shows where it started, so
there's no way to see how far you've moved from the institute's defaults.

**Solution.** When a cutoff differs from its default, a faint dashed line (muted ink, 60%
opacity) marks the default position. Hovering it shows "default 80". It sits above the
tooltip columns so it can be hovered, and below the handles so it never blocks a drag. It
disappears once the cutoff is back at its default.

**How tested.** `E2+` default-marker test:
- All 7 markers are hidden at the defaults.
- Moving A to 78 shows only A's marker, drawn at the left edge of mark 80.
- Its label is invisible until hovered, then reads "default 80".
- Typing 80 again hides it.

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

## E4: Review before export

**Problem.** "Finalize & Download" committed every student's grade with one
blind click. The instructor never saw a final summary of what they were about to
submit: how many students got each grade, which cutoffs they had moved from the
defaults, or whether anyone was still sitting one mark below a boundary.

**Solution.**
- **Review first:** the action bar's primary button is now "Review grades". It
  opens a native `<dialog>` (`showModal()`), so it is modal, Esc closes it, and
  focus returns to the button afterwards. It is the only element in the app with
  a shadow.
- **What the dialog shows:**
  - course, instructor and student count;
  - each grade's range, count and share;
  - every cutoff changed from its default ("A: 80 to 78"), or "None. All cutoffs
    are at their defaults.";
  - the number of borderline students still just below a cutoff, stated as
    information ("You can still adjust the cutoffs before downloading"), not as
    a blocker.
- **Download:** "Download grades (CSV)" runs the unchanged Stage 1 export (same
  header block, columns, labels, BOM, formula guard and filename). It then closes
  the dialog and shows the per-course completion message.
- **Going back:** "Back to grading" closes the dialog and changes nothing.
- **Name check:** the instructor-name check from #15 now happens when the dialog
  is opened, with the same inline message style.

**Why this beats the obvious alternative.** The obvious alternative is a
`confirm("Download grades?")` box. That adds a click but no information, and
people learn to dismiss it without reading. The review shows the few facts that
actually change the decision: the distribution, what was changed, and who is
still on a boundary. It doesn't block the download on any of them.

**How it was tested.**
- `E4:` tests check that the dialog's course, instructor, count, per-grade table
  (equal to the side panel), changed-cutoff list and borderline count match the
  live state, and that the no-changes case is handled.
- Esc and "Back to grading" each close the dialog with the cutoffs, counts and
  completion message untouched, no download, and focus back on "Review grades".
  The next download still counts as the first attempt.
- A download closes the dialog, and a second download says "second attempt" with
  identical bytes.
- **Byte-identity:** all four golden CSVs (three courses with default cutoffs,
  plus A 78 / B- 52) are now downloaded through the dialog and still match the
  Stage 1 exports byte for byte.

---

## E5: Undo, redo and reset where you need them

**Problem.** Dragging a cutoff makes experimenting easy, and so it is also easy to lose a good
state: a slip moves A by five marks and there is no way back except remembering the old
numbers. The only reset was in the bottom bar, far from the chart, and it wiped every cutoff at
once. So the safe choice was not to experiment at all.

**Solution.**
- **Undo and Redo** in the header of "Distribution and cutoffs", next to **Reset to defaults**.
  Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z do the same. The shortcut is ignored in text fields (the name,
  and later the search box), which keep their own undo. In a cutoff input the app's undo is the
  useful one.
- **Sensible steps:**
  - A whole drag is one step.
  - A burst of edits to the same cutoff (−/+ clicks, arrow keys, typing) with under 600ms between
    them is one step.
  - "Lower A to 78" and each reset are one step each.
  - A new change clears the redo trail.
- **Per course.** The stacks live in each course's state (#31), so undo in one course never
  touches another.
- **"Reset to 80" per cutoff.** It sits under a cutoff's range once that cutoff has moved and
  restores only that one. If the neighbouring cutoffs block the default, the cutoff goes as close
  as it can and a note says why. Focus moves to the input, because the link hides itself.
- **Reset notice with Undo.** After "Reset to defaults", an inline notice ("Cutoffs reset to
  defaults. Undo") appears and focus moves to its Undo. Any other change hides it, because its
  Undo would then undo something else.
- The bottom bar keeps only the change counter and "Review grades".

**Why this design.** Undo makes a destructive action cheap, and that is better than asking
"Are you sure?" first: the confirmation is removed in #35. The history is snapshot-based, and
every change still goes through `setCutoff()`, so undo can't produce a state the editor couldn't
produce.

**How tested.** `E5` tests:
- Undo and redo through two typed changes, with counts that match; a new change clears redo.
- A drag through six values is one step.
- Three quick − clicks are one step, and a click after an 800ms pause is a new one.
- Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z work, and do nothing to the cutoffs in the name field.
- The per-cutoff reset affects only that cutoff and can be undone.
- The reset notice's Undo restores both changed cutoffs, and focus lands on it.
- Stacks are per course.
- The bottom bar has only "Review grades".

## E6: Per-course progress and autosave

**Problem.** A marks file usually holds several courses. The instructor grades them one by one
and has to remember which ones have been downloaded. A refresh, a closed tab or a crashed
browser threw away every cutoff decision.

**Solution.**
- **Status per course.** Each course option shows "Not started", "In progress" or "Downloaded"
  (for example "Linear Algebra · In progress"). The setup summary reads "1 of 3 courses
  downloaded". A course is Downloaded while its cutoffs match the ones last downloaded. Change
  them afterwards and it goes back to In progress, because the file you have no longer matches.
  Undo back to the downloaded cutoffs and it shows Downloaded again.
- **Autosave.** Each course's cutoffs and download status are saved to `localStorage` after
  every change and download. The key is the file name plus an FNV-1a fingerprint of the sorted
  course names.
- **Restore.** When the same file is uploaded again, the saved state comes back with a notice:
  "Restored your cutoffs from earlier. Start over". "Start over" forgets the saved entry and
  returns every course to defaults.
- **Privacy.** Marks and BITS IDs are never stored. Only the courses you've touched are saved,
  so an untouched file stores nothing. Restored cutoffs are used only if they form a set the
  editor could have produced.
- **Resilience.** Every storage call is wrapped in try/catch. With storage blocked the app works
  the same and simply doesn't remember. The README says what is stored.

**Why this design.** Autosave with a restore notice keeps the instructor in control without
asking anything up front. The status is derived from the cutoffs rather than tracked as a flag,
so it can never contradict what's on screen.

**How tested.** `E6` tests:
- Statuses and the "N of 3" summary through change, download, change and undo.
- A refresh and re-upload restores both courses' cutoffs and statuses, with the notice.
- "Start over" clears the entry, and a later reload restores nothing.
- A different file with the same course names doesn't pick up the saved state.
- The stored JSON contains no BITS ID from the file and only grade-to-cutoff maps; an untouched
  file stores nothing.
- With a `localStorage` getter that throws, grading and download still work with no page errors.

## E7: Find a student

**Problem.** While grading, instructors get "what did I get?" and "am I near the cutoff?"
questions. Answering one meant scanning the chart or opening the spreadsheet in another window.

**Solution.**
- A "Find a student" field under the header of "Distribution and cutoffs".
- Typing a BITS ID shows each match as "20247096 · 79 · A-", with the grade chip.
  - Matching is trimmed and case-insensitive (`2023a7ps0002p` finds `2023A7PS0002P`).
  - From 4 characters any part of the ID matches. Below that only an exact ID does, with the hint
    "Type at least 4 characters of the BITS ID."
- Up to 5 matches are listed, the exact match first, then "and N more. Type more of the ID to
  narrow it down."
- No match says "No student with that ID in Introduction to Programming."
- Every matching student's bar is highlighted and the rest dim. This shares one highlight
  function with the borderline list's hover, so leaving a borderline name brings the search
  highlight back.
- The shown grade follows the cutoffs as they change, because the result is recomputed through
  `gradeFor()` on every render.
- Results are in an `aria-live` region. Ctrl/Cmd+Z in the field is the field's own undo, not the
  cutoffs'.

**Why this design.** It answers the question where the instructor is already looking (the chart
of the course they're grading), and shows the grade under the current cutoffs, which is what
the student will get.

**How tested.** `E7` tests:
- An exact ID shows mark and grade and highlights bar 79.
- Moving A to 79 updates the listed grade to A.
- Clearing the field removes the results and the highlight.
- Trimmed, case-insensitive and partial matching, and the under-4 hint.
- A 10-match search lists 5 plus "and 5 more", and highlights every matching mark.
- An unknown ID, or an ID that is only in another course, gives the "No student…" line naming
  the course.

## E8: Dark mode

**Problem.** Grading happens in long sessions, often in the evening, and a bright white
page is tiring. Many instructors already run their OS in dark mode, and the app ignored that.

**Solution.**
- It follows `prefers-color-scheme` by default. A **Light / Dark / System** switch in the app bar
  (real radio buttons, so arrow keys work) overrides it. The choice is saved with E6's guarded
  storage and applied by a tiny script in `<head>` before first paint, so there's no flash.
- **Tokens only.** Dark mode redefines the CSS custom properties and nothing else. First every
  hard-coded colour was replaced with a token:
  - `#c9c3de` became `--rule-strong`
  - white on buttons and chips became `--on-accent` and `--g-X-on`
  - the error pinks became `--danger-soft` and `--danger-rule`
  - the dialog shadow and backdrop, and the tooltip, got tokens too
  - `<dialog>` now has an explicit surface background
  - `color-scheme` switches native controls
- **Retuned colours.**
  - The dark grade colours are lightened so every bar keeps 3:1 against its band. A-, B- and C-
    chips switch to dark text for AA.
  - The accent is lighter (`#9b87f0`), so primary buttons get dark text, because white on it would
    be about 2.9:1.
  - The logo sits on a light rounded plate.

**How tested.** `E8` tests:
- Follows the system by default.
- Light and Dark override the system and survive a reload, and System goes back to following it.
- The switch works with arrow keys.
- The computed dark tokens are identical whether chosen or inherited from the system, so the two
  CSS blocks can't drift.
- No hex or rgb colour appears outside the token blocks, in CSS or script.
- In both themes, every chip is AA, every bar is 3:1 against its band, and body and muted text
  are AA on panels.
- The logo plate is light in dark mode.

Screenshots of every state were taken in dark as well as light.

## E9: Impact of changes in the review dialog

**Problem.** Lowering A to 78 is a decision about three specific students, but the review only
showed totals ("A: 11") and the changed cutoffs. The instructor couldn't see *who* the change
affects without working it out by hand.

**Solution.**
- A new review section, "Students whose grade differs from the default cutoffs". Each row reads
  "20247096 · 79 · A- to A" (ID, mark, default grade to new grade), highest mark first.
- At most 10 rows, then a "Show all N" button. Expanding keeps focus on the list, and reopening
  the review starts collapsed.
- When nothing differs, one line says so.
- Both grades come from `gradeFor()`, which now takes an optional cutoffs argument
  (`gradeFor(mark, DEFAULT_CUTOFFS)`). There is still exactly one grading rule.
- The review shows "Grading time: 4 min 12 s", and the app-bar clock is now labelled
  "Grading time".
  - A download freezes the clock, and the review reads the same frozen value via
    `gradingElapsed()`.
  - The completion message keeps its Stage 1 wording.
- The CSV format is unchanged; the golden byte-for-byte tests still pass.

**How tested.** `E9` tests:
- A 78 in Introduction to Programming lists exactly the students scoring 78–79, with
  `20247096 · 79 · A- to A` first. The expected list is computed independently from the fixture.
- With the defaults, the "no student" line shows.
- A at 71 changes 15 students: 10 are shown, then "Show all 15" expands to all of them with focus
  on the list, and reopening collapses it again.
- With a paused clock moved on 252s, the review reads "Grading time: 4 min 12 s", and the app bar
  says "Grading time".

## Visual redesign

The four enhancements sit on a new foundation built to the CLAUDE.md design
system. The feel is a calm, institutional mark sheet, and the one bold element
is the histogram with its grade bands.

- **Layout.** An app bar (the BITS Pilani Digital logo and "Grading console",
  plus instructor · course · class size · timer once grading starts) sits above
  a setup panel. The setup panel collapses to a
  one-line summary with "Edit" once a course is open, keeping the course switcher
  visible. The workspace is the chart, cutoff editor and stats on the left, with
  the grade distribution and borderline students on the right. It stacks into
  one column below 1024px and works at 360px. A sticky action bar holds the
  change counter, "Reset cutoffs" and "Review grades".
- **Visual system.**
  - Colour tokens on `:root`, including a one-hue grade ramp (A darkest to E
    lightest) used for bars, bands and chips. White text sits on the four
    darkest steps and ink on the rest, and every step passes WCAG AA (tested).
  - IBM Plex Sans with a system-font fallback, and tabular numbers.
  - An 8px spacing grid; 1px-bordered panels with no shadows; 40px controls.
    The only shadow is on the review dialog.
- **Setup.**
  - Every input has a visible label.
  - A drop zone wraps the real file input (click, or drag and drop), shows the
    file name and student count once parsed, and carries the format guidance
    and a "Download a sample file" link.
  - The name is kept exactly as typed.
- **Empty and error states.** Before a course is open, the analysis area says
  what to do next. Upload errors keep their row-level messages, shown in a
  `--danger` callout. `alert()` is gone: choosing a course without a name gives
  an inline prompt and moves focus to the name field.
- **Logo.** `assets/logo.png` is trimmed and scaled to 2× its 48px display
  height by `scripts/make-logo.mjs`, then inlined as a ~10 KB WebP data URI.
  The app stays a single self-contained `index.html`. The logo is the page's
  `<h1>`, with `alt="BITS Pilani Digital"`. The browser tab uses the seal alone
  as a 64px favicon on a transparent background (the full lockup is unreadable
  at tab size), also inlined. Its seal keeps its own brand colours;
  the "nothing else is ever red" rule applies to UI colour, not to the logo.
- **Motion.** The bars grow once when a course opens, and the dialog fades in.
  Nothing else animates (no hover lifts, no pulsing chips), and
  `prefers-reduced-motion` disables both.
- **Polish pass ("remove one accessory").**
  - The welcome line ("Welcome, Dr Rao. Review the cutoffs…") repeated the name
    already in the app bar and setup summary and didn't help anyone decide, so
    it was cut.
  - Screenshot review also led to:
    - lighter band tints;
    - outlines on the two palest ramp steps so their bars stay visible;
    - dimming the other bars when a borderline student is hovered (a dark bar's
      outline was invisible);
    - an adaptive cutoff-editor grid (it overflowed at 1024px);
    - stacked dialog buttons on phones (a label wrapped inside a 40px button).
- **Keyboard and screen readers.**
  - A keyboard-only walkthrough goes from name entry to a downloaded CSV, and
    runs as a test.
  - The −/+ stepper buttons are out of the tab order, because ↑/↓ in the input
    does the same. That cuts the editor from 21 tab stops to 7.
  - Errors are `role="alert"`; the completion message and chart tooltip are
    `role="status"`; count changes and clamp notes are `aria-live`.
  - Every control has a visible `:focus-visible` ring.

| | Before (Stage 1) | After (Stage 2) |
|---|---|---|
| Desktop, course open | ![before](docs/screenshots/before/loaded-1440.png) | ![after](docs/screenshots/after/loaded-1440.png) |
| Phone, course open | ![before](docs/screenshots/before/loaded-390.png) | ![after](docs/screenshots/after/loaded-390.png) |
| Empty state | ![before](docs/screenshots/before/empty-1440.png) | ![after](docs/screenshots/after/empty-1440.png) |

All seven states (empty, upload error, loaded, cutoff moved, borderline, dialog
open, downloaded) at 1440, 1024 and 390px are in `docs/screenshots/after/`. They
are regenerated with
`SHOTS_OUT=docs/screenshots/after npx playwright test -c playwright.screenshots.config.js scripts/screenshots.spec.js`.

---

## Stage 1 tests rewritten in Stage 2

When a Stage 2 change legitimately made a Stage 1 test obsolete, the test was
rewritten to check the same guarantee through the new UI. None was deleted.

| Test | Why it changed | What it checks now |
|---|---|---|
| #23b (no-instructor prompt) | `alert()` is banned by CLAUDE.md, so the prompt became inline (`fix:` commit). | No dialog. The inline message appears, focus moves to the name field, and typing clears it. The previous course is still cleared. |
| #15, #23b, #27b (retype the name mid-flow) | Setup collapses once a course is open, which hides the name field. | They click "Edit" first (`setInstructor` helper). Assertions unchanged. |
| Happy path (welcome text) | The welcome text no longer upper-cases the name. Later, the polish pass cut the welcome line. | The name is shown as typed (`Dr Rao`) in the app bar. |
| #2, #23a (welcome cleared on reset) | The welcome line was cut in the polish pass. | The same guarantee, "no per-course context survives a reset", checked as the app-bar context being hidden. |
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
| `download()` helper (used by most CSV tests) | E4: downloads go through the review dialog. | Opens the dialog and clicks "Download grades (CSV)". Every CSV assertion is unchanged. |
| #2, #8, #9, #23 ×2, happy path (Download enabled/disabled) | E4: the gate is now "Review grades". Left on `#download`, these would have passed vacuously, because that button now lives in a closed dialog. | The same enabled/disabled guarantees on `#reviewBtn`. |
| #15 (export blocked without a name) | E4 | The block happens when opening the review: inline message, no dialog, no download. |
| #18 (ordinals) | E4 | 23 finalizes through the dialog. |
| #27b (blocked export clears on re-upload) | E4 | The blocked attempt clicks "Review grades". |
| setup: collapses to a summary (summary text) | Stage 2B, #33: the summary no longer repeats the instructor, who is shown in the app bar. | The summary reads `demo_marks.xlsx · 148 students · 3 courses`. Collapse, Edit and focus are checked as before. |
| setup: collapses to a summary (summary text), again | E6 adds progress to the summary. | `demo_marks.xlsx · 148 students · 0 of 3 courses downloaded`. The course count is part of the progress. |
| #31b (a new upload clears every course's cutoffs) | E6 restores a file's saved cutoffs when the *same* file is uploaded again, which this test used to do. | The same in-memory guarantee through a different file with the same course names (`valid_basic` then `clustered_marks`). Restoring the same file is covered by the E6 tests. |
| a11y: keyboard walkthrough (first Tab) | E8 added the theme switch to the app bar, which comes before the setup. | The first Tab lands on the theme switch (one stop for the radio group), the second on the name field. The rest is unchanged. |
| #19 ×2 (reset asks once / dismiss keeps cutoffs) | E5 moved the button to the chart panel header as "Reset to defaults" (`#resetAll`). Then #35 removed the `confirm()`. | The guarantee that a reset never costs you your cutoffs, now through undo: (a) one click resets every cutoff and no dialog appears; (b) the notice's Undo restores the cutoffs. |
| #22 (reset inert before a course) | E5: the button is inside the chart panel, which is hidden until a course is open. | Hidden and disabled on a fresh page and after an upload. A dispatched click causes no error and no dialog. |
| E1: the action bar counts changes | E5: the reset button left the action bar. | Same counts. The enabled/disabled check now uses `#resetAll`. |

## Stage 2C: restraint pass

**Problem.** By the end of Stage 2B the screen had turned loud. There were eight grade hues on the bars, eight band tints, rainbow chips, purple headings, a second row of band letters above the handle labels, and an app bar with six things in it. Colour was everywhere, so none of it pointed anywhere.

**Principle (CLAUDE.md).** Colour is information, not decoration. The screen is neutral by default. The accent marks only what is interactive (the primary action, focus rings, cutoff lines and handles) or what the user is focused on right now (a hovered, searched or borderline student's bar, or a changed grade in the review). No behaviour changes; every step is a `style:` commit.

| # | Change |
|---|---|
| 1 | **Chart colour.** Every bar is one neutral `--bar` tone. Only focused bars (hovered or keyboard-read, found by the search, hovered in the borderline list) use `--bar-focus`. The eight band tints are gone; every other band has a barely visible `--band-alt` shade. Cutoff lines use the accent. The bell curve is unchanged. |
| 2 | **One label row.** The band-letter row is gone. The handle pills ("A 80", 12px, weight 500, neutral border) now sit in that row above the plot instead of over the bars. They turn accent (border and text, no fill) only on hover or drag. If any two full labels would touch, every pill shows its value only ("80"). If even values touch (adjacent cutoffs on a narrow chart), the later pill drops just inside the plot. |
| 3 | **Neutral chips.** Every grade chip is `--surface` with a 1px `--rule` border and `--ink` text; the letter carries the meaning. The eight `--g-*` tokens and their chip-text tokens are gone. The distribution table (sidebar and review) shows share as a slim `--bar` bar, scaled to the largest grade, before the % figure. The bar is `aria-hidden`; the number is what's read. |
| 4 | **App bar.** Logo, "Grading console", the course name, the grading time and nothing else. The instructor and class size moved into the setup summary, which is now label/value pairs (File, Instructor, Class size, Downloaded) instead of a "·" string. The Light / Dark / System segmented control became one sun/moon icon button that opens a small menu (WAI-ARIA menu button: `menuitemradio` items, arrows, Enter, Escape, closes on an outside click, focus returns to the button). The icon shows the theme in effect. At narrow widths the button stays top-right, beside the logo. |
| 5 | **Dark-mode logo.** No light plate. In dark, the lockup (whose dark type would vanish) is replaced by the BITS seal alone, which reads fine on dark, followed by "BITS Pilani Digital" set as text in `--ink`. The seal is `assets/seal-96.png` (2× its 40px size; `scripts/make-logo.mjs` now writes it), inlined. The heading's accessible name is "BITS Pilani Digital" in both themes. Below 420px the seal is 32px and the name 14px, so logo, name, "Grading console" and the theme button stay on one line down to 360px. |
| 6 | **Chart panel header.** Undo and Redo are icon buttons sharing one outline, each with an `aria-label` and a small tooltip on hover and keyboard focus. "Reset to defaults" is a quiet text button. "Find a student" is a compact search field with a magnifier icon (`aria-label`, placeholder "Find by BITS ID"), aligned right in the same header row. Results appear on their own line under the header only when there are any. Below 600px the search takes a full-width row under the other tools. |
| 7 | **Headings.** Every panel and dialog heading is `--ink`, weight 600; purple is reserved for the accent. `--accent-strong` is removed (nothing else used it). New test: every `h2`/`h3`, including the review dialog's, is ink and 600 in both themes. |
| 8 | **No meta strings.** Nothing in the UI joins facts with "·". The setup summary is label/value pairs (step 4). Course options read "Linear Algebra (Downloaded)". Search results show the ID, "79 marks" and the grade chip, separated by space. The review's impact list became a small table (BITS ID, Mark, Default, New), hidden when empty; the new grade is the one accent in it, because a changed grade is what the review is about. New test: no visible text or `<option>` in the grading flow or the review contains "·". |

### Tests rewritten in Stage 2C

| Test | Why it changed | What it checks now |
|---|---|---|
| E2: one bar per scored mark (was "coloured by the grade") | 2C-1: bars no longer carry a grade colour. | Bar 79 has `data-grade="A-"`, and `"A"` once A starts at 79. |
| a11y: bar contrast (was "3:1 against its grade band") | 2C-1: one bar tone over the surface or the alternate band shade. | Bar ≥ 3:1 against the surface and against every shaded band. All bars share one fill. |
| E2+: handle labels never overlap at 1440/390 | 2C-2: labels collapse to values when they would collide. | Still no overlap, before and after A- moves next to A. Added: full "A 80…" labels at 1440, values only at 390. |
| a11y: chip text AA (was "every grade-ramp step") | 2C-3: chips are neutral. | Chip text ≥ 4.5:1, and all eight chips share one background and text colour. New test: share bars are scaled to the largest grade and `aria-hidden`. |
| setup: collapses to a summary (summary text) | 2C-4: label/value pairs, and the instructor and class size moved in. | `dt`s read File, Instructor, Class size, Downloaded; `dd`s read `demo_marks.xlsx`, `Dr Rao`, `64`, `0 of 3 courses`. |
| app bar shows instructor, course, class size and timer | 2C-4 | The app bar shows the course and timer (not the instructor); the summary shows the instructor and class size 64. |
| #33 instructor and course shown once | 2C-4 | Still once each: the course in the app bar, the instructor in the setup summary. |
| happy path (name as typed); E6 progress (×3) | 2C-4 | Read `#sumInstructor` and `#sumProgress` ("1 of 3 courses") instead of the old strings. |
| E8: default, override and reload; dark tokens | 2C-4: radios became a menu. | Same guarantees through `chooseTheme()` (open the button, pick a `menuitemradio`); the checked item is read from `aria-checked`. |
| E8: keyboard (was "arrow keys move the radio") | 2C-4 | Enter opens on the current choice, Escape closes and returns focus, ArrowUp+Enter picks Dark and updates the button's label. New: an outside click closes the menu without changing the theme. |
| a11y: keyboard walkthroughs (first Tab; theme at the end) | 2C-4 | The first Tab lands on `#themeBtn`; the Stage 2B walkthrough changes the theme with Enter, ArrowUp, Enter. |
| E8: the logo sits on a light plate in dark | 2C-5: the plate is gone. | Light shows the lockup only. Dark shows the seal (`alt=""`, 96px source) and the name as text in `--ink`, with no background behind any of them, and the heading is named "BITS Pilani Digital" in both. |
| E5: the bottom bar keeps the change count and Review grades only | 2C-6 (extended, not rewritten) | Also checks that the search box is in the chart header, and that keyboard focus on the icon-only Undo shows its "Undo" tooltip. |
| E6 course-status tests (option labels, ×11 assertions) | 2C-8 | Same statuses, read as "Course (Status)". |
| E7 search results (×4) and the Stage 2B walkthrough | 2C-8 | Same ID, mark and grade per result, as "20247096 79 marks A". |
| E9 impact tests (×4) and the Stage 2B walkthrough | 2C-8: the list became a table. | Rows compared as ID, mark, default grade and new grade (same students, same order, same 10-then-Show-all behaviour, same focus after Show all). Added: the header row, the new grade in the accent (the ID isn't), and the table hidden when nobody changed. |
| E8: chips AA and bars 3:1 per theme | 2C-1 | Same bar check in light and dark. Added: a searched (focused) bar is ≥ 2:1 from the neutral bar and clearly violet. |

## Stage 2D: chart colour

**Problem.** The restraint pass made the screen calm, but it also made the chart grey: eight grades looked identical, so the instructor had to read the handle labels to see where one grade ended and the next began.

**Principle (CLAUDE.md).** The chart is the one place colour is allowed to be beautiful, and only as information. Grades are ordinal, so their colours are one ordered sweep (the "Aurora" ramp, violet A → blue → teal → green E, ordered by OKLCH hue), with no reds, oranges or ambers so low grades never read as errors. Grade colour appears only on the histogram bars and their legend (share bars and a dot on grade chips). Everything else stays neutral. Every step is a `style:` commit.

| # | Change |
|---|---|
| 1 | **Aurora bars.** Eight `--g-*` tokens per theme (A is the brightest in dark, so it stays the most prominent). Each bar is filled by its `data-grade`, so it recolours the moment a cutoff moves past it, with a 150ms fill fade that is off under reduced motion. `--bar` stays only as the fallback before grades are assigned. Every grade colour is ≥ 3:1 on the surface and on the band shade in both themes. |
| 2 | **Neutral cutoff lines.** Lines use `--cutoff-line` (`--ink-muted` at 60%) now that the bars carry the colour. A handle's line, pill border and label take the accent only while it is hovered, dragged, or its cutoff is being edited in the cutoff editor (the handles are `aria-hidden`, so editing the input is how a keyboard user "focuses" one). New test: all lines share one non-accent stroke at rest; hovering or editing B lights B's handle only. |

### Tests rewritten in Stage 2D

| Test | Why it changed | What it checks now |
|---|---|---|
| a11y: bar contrast (was "one neutral tone, all bars share one fill") | 2D-1: bars carry grade colours. | Every distinct bar fill is ≥ 3:1 against the surface and every shaded band (light here, both themes in the E8 test). New tests: each bar's fill is its grade's `--g-*` colour, eight distinct colours; bar 79 turns from A- to A colour when A moves to 78; the fill transition is 150ms and 0s under reduced motion; OKLCH hue strictly falls from A to E, with no red/orange/amber hue, in light and dark. |
| E8: chips AA and bars 3:1 per theme | 2D-1: there is no neutral bar left to compare a focused bar with. | The focused bar is compared with the `--bar` token instead (replaced by the dimming check in 2D-3). |
