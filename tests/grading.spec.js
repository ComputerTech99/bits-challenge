// Regression tests for the Stage 1 bug fixes. Test names reference the
// row number in BUG_FIX_LOG.md.
const { test, expect } = require("@playwright/test");
const { openApp, upload, startGrading, stat, download, courseOptions, gradeCounts, setInstructor, cutoffInput, typeCutoff, rangeText, finalize } = require("./helpers");

const XLSX = require("xlsx");
const { fixture } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

// Install a fake clock that only moves when the test advances it.
async function pausedClock(page) {
  await page.clock.install({ time: new Date(2026, 0, 1, 9, 0, 0) });
  await page.goto("/");
  await page.clock.pauseAt(new Date(2026, 0, 1, 9, 0, 1));
}

test("#1 Min and Max stats show the right values", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await expect(stat(page, "Min")).toHaveText("0");
  await expect(stat(page, "Max")).toHaveText("100");
});

test("#2 course list is deduplicated and fully reset on re-upload", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  expect(await courseOptions(page)).toEqual(["", "CS F211", "MATH F112"]);
  await page.waitForTimeout(600); // let the histogram animation finish

  await upload(page, "valid_second.xlsx");
  await expect(page.locator("#course option")).toHaveCount(3);
  expect(await courseOptions(page)).toEqual(["", "BIO F110", "ECON F211"]);
  await expect(page.locator("#course")).toHaveValue("");
  await expect(page.locator("#grades")).toBeEmpty();
  await expect(page.locator("#gradeSummary")).toBeEmpty();
  await expect(page.locator("#appContext")).toBeHidden(); // Stage 2: the welcome line was cut; no per-course context survives
  await expect(page.locator("#reviewBtn")).toBeDisabled();
  for (const label of ["Min", "Max", "Avg", "Median"]) {
    await expect(stat(page, label)).toHaveText("—");
  }
  await expect(page.locator("#hist > *")).toHaveCount(0); // Stage 2: SVG chart, was a canvas pixel check
});

test("#3 file input accepts both .xlsx and .xls", async ({ page }) => {
  const accept = (await page.locator("#file").getAttribute("accept")).split(",").map(s => s.trim());
  expect(accept).toEqual(expect.arrayContaining([".xlsx", ".xls"]));
});

test("#4 cancelling the file dialog does not throw or discard loaded data", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  // Chrome fires "change" with an empty FileList when a re-opened dialog is cancelled.
  await page.locator("#file").setInputFiles([]);
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
  expect(await courseOptions(page)).toEqual(["", "CS F211", "MATH F112"]);
  await expect(page.locator("#course")).toHaveValue("CS F211");
});

test("#5 headers from the brief are recognised", async ({ page }) => {
  await startGrading(page, "brief_headers.xlsx", "CS F211");
  await expect(stat(page, "Min")).toHaveText("45");
  await expect(stat(page, "Max")).toHaveText("85");
  const { text } = await download(page);
  expect(text).toContain("2023A7PS0001P,85,A");
});

test("#5 headers are matched case-insensitively and trimmed", async ({ page }) => {
  await startGrading(page, "messy_headers.xlsx", "CS F211");
  await expect(stat(page, "Max")).toHaveText("85");
});

test("#5 a missing required column is reported inline", async ({ page }) => {
  await upload(page, "missing_column.xlsx");
  await expect(page.locator("#uploadError")).toContainText("Total Marks");
  expect(await courseOptions(page)).toEqual([""]);
});

test("#6 invalid rows reject the upload with row-level errors", async ({ page }) => {
  await upload(page, "bad_data.xlsx");
  const err = page.locator("#uploadError");
  await expect(err).toContainText("Row 3: marks missing");
  await expect(err).toContainText('Row 4: marks "abc" is not a number');
  await expect(err).toContainText("Row 5: marks -5 is outside 0–100");
  await expect(err).toContainText("Row 6: marks 104 is outside 0–100");
  await expect(err).toContainText("Row 7: course missing");
  await expect(err).toContainText("Row 8: BITS ID missing");
  await expect(err).not.toContainText("Row 2:");
  await expect(err).not.toContainText("Row 9:");
  expect(await courseOptions(page)).toEqual([""]);
});

test("#6 a file with headers but no students is rejected", async ({ page }) => {
  await upload(page, "empty.xlsx");
  await expect(page.locator("#uploadError")).toContainText("no student rows");
  expect(await courseOptions(page)).toEqual([""]);
});

test("#6 a valid upload after a rejected one clears the error", async ({ page }) => {
  await upload(page, "bad_data.xlsx");
  await expect(page.locator("#uploadError")).not.toBeEmpty();
  await upload(page, "valid_basic.xlsx");
  await expect(page.locator("#course option")).toHaveCount(3);
  await expect(page.locator("#uploadError")).toBeEmpty();
});

test("#7 decimal marks are rounded half-up and every student is exported", async ({ page }) => {
  await startGrading(page, "decimals.xlsx", "CS F211");
  const { text } = await download(page);
  expect(text).toContain("2023A7PS0001P,80,A");  // 79.5
  expect(text).toContain("2023A7PS0002P,80,A");  // 80.2
  expect(text).toContain("2023A7PS0003P,49,C");  // 49.49
  expect(text).toContain("2023A7PS0004P,20,D");  // 19.5
  expect(text).toContain("2023A7PS0005P,65,B");
  await expect(page.locator(".file-guidance")).toContainText("80.2 → 80");
  await expect(page.locator(".file-guidance")).not.toContainText("80.2 → 81");
});

test("#8 bands always cover 0–100: A ends at 100 even when a higher cutoff is typed", async ({ page }) => {
  // Stage 2 (E1): the Min/Max selects are gone; A's top is fixed at 100 by construction.
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await expect(rangeText(page, "A")).toHaveText("A: 80–100");
  await typeCutoff(page, "A", 150);
  await expect(cutoffInput(page, "A")).toHaveValue("100");
  await expect(rangeText(page, "A")).toHaveText("A: 100–100");
  await expect(page.locator("#reviewBtn")).toBeEnabled();
  const { text } = await download(page);
  expect(text.trim().split("\n").slice(4)).toHaveLength(20); // nobody dropped
});

test("#8 bands always cover 0–100: E starts at 0 and D cannot go below 1", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await expect(page.locator("#cut-E")).toHaveCount(0); // E has no editable start
  await expect(rangeText(page, "E")).toHaveText("E: 0–19");
  await typeCutoff(page, "D", 0);
  await expect(cutoffInput(page, "D")).toHaveValue("1");
  await expect(rangeText(page, "E")).toHaveText("E: 0–0");
  const { text } = await download(page);
  expect(text).toContain("2023A7PS0001P,0,E\n");
});

test("#9 a single-mark band (A = 100–100) is valid", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "A", 100);
  await expect(rangeText(page, "A")).toHaveText("A: 100–100");
  await expect(rangeText(page, "A-")).toHaveText("A-: 70–99");
  await expect(page.locator("#cutoffNote")).toBeEmpty(); // allowed, so no clamp note
  await expect(page.locator("#reviewBtn")).toBeEnabled();
  const { text } = await download(page);
  expect(text).toContain("2023A7PS0006P,100,A\n");
  expect(text).toContain("2023A7PS0005P,80,A-\n");
});

test("#10 lowering a cutoff grows the band below's neighbour above it", async ({ page }) => {
  // Stage 1 checked that a Max edit moved the next-higher Min; with one cutoff
  // per boundary, both neighbouring ranges must follow any edit.
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "A-", 75);
  await expect(rangeText(page, "A")).toHaveText("A: 80–100");
  await expect(rangeText(page, "A-")).toHaveText("A-: 75–79");
  await expect(rangeText(page, "B")).toHaveText("B: 60–74");
});

test("#10 raising a cutoff shrinks the band above it and grows the one below", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "B", 55);
  await expect(rangeText(page, "B")).toHaveText("B: 55–69");
  await expect(rangeText(page, "B-")).toHaveText("B-: 50–54");
});

test("#11 timer starts on the first course selection, not on page load", async ({ page }) => {
  await pausedClock(page);
  await page.clock.fastForward("05:00");
  await expect(page.locator("#timerText")).toHaveText("00:00");

  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await expect(page.locator("#timerText")).toHaveText("00:00");
  await page.clock.fastForward(65_000);
  await expect(page.locator("#timerText")).toHaveText("01:05");
});

test("#11 timer runs a single interval and stops on finalize", async ({ page }) => {
  // Originally asserted the timer carried on across course changes; since #27
  // each course has its own timer, so a switch restarts it from 00:00.
  await pausedClock(page);
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.clock.fastForward(10_000);
  await page.selectOption("#course", "MATH F112");
  await expect(page.locator("#timerText")).toHaveText("00:00");
  await page.clock.fastForward(10_000);
  await expect(page.locator("#timerText")).toHaveText("00:10");

  await download(page);
  const frozen = await page.locator("#timerText").textContent();
  await page.clock.fastForward(30_000);
  await expect(page.locator("#timerText")).toHaveText(frozen);
});

// Reads the SVG histogram: bars, curve points and the plot area.
async function chartGeometry(page) {
  return page.evaluate(() => {
    const svg = document.getElementById("hist");
    const num = (el, a) => Number(el.getAttribute(a));
    const hits = [...svg.querySelectorAll("rect.hit")];
    const path = svg.querySelector("path.curve");
    return {
      bars: [...svg.querySelectorAll("rect.bar")].map(b => ({
        mark: Number(b.dataset.mark), x: num(b, "x"), w: num(b, "width"), y: num(b, "y"), h: num(b, "height"), grade: b.dataset.grade })),
      curve: path ? path.getAttribute("d").match(/[ML][^ML]+/g).map(p => p.slice(1).trim().split(" ").map(Number)) : [],
      hitX: hits.map(h => num(h, "x")),
      step: hits.length ? num(hits[0], "width") : 0,
      plotTop: hits.length ? num(hits[0], "y") : 0,
      plotBottom: hits.length ? num(hits[0], "y") + num(hits[0], "height") : 0,
      xTicks: [...svg.querySelectorAll(".axes text[text-anchor=middle]")].map(t => t.textContent),
      attrs: [...svg.querySelectorAll("*")].flatMap(el => [...el.attributes].map(a => a.value)),
    };
  });
}

// Marks of one course in a fixture, for computing expectations independently.
function fixtureMarks(file, course) {
  return XLSX.utils.sheet_to_json(XLSX.readFile(fixture(file)).Sheets.Marks)
    .filter(r => String(r.Course).trim() === course).map(r => Math.round(r["Total Marks"]));
}

// Stage 2 (E2): the canvas became an SVG with one bar per mark. The #12 tests
// keep their guarantees, restated for 1-mark bins.
test("#12 bars are scaled to fit the chart and stay inside it", async ({ page }) => {
  await startGrading(page, "large_class.xlsx", "CS F211");
  const g = await chartGeometry(page);
  expect(g.bars.length).toBeGreaterThan(0);
  for (const b of g.bars) {
    expect(b.y).toBeGreaterThanOrEqual(g.plotTop - 0.01);
    expect(b.y + b.h).toBeLessThanOrEqual(g.plotBottom + 0.01);
  }
  const tallest = Math.max(...g.bars.map(b => b.h));
  expect(tallest).toBeGreaterThan(0.5 * (g.plotBottom - g.plotTop)); // uses the space
  expect(Math.min(...g.curve.map(([, y]) => y))).toBeGreaterThanOrEqual(g.plotTop - 0.01);
});

test("#12 x-axis is labelled every 10 marks, 0 to 100", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  expect((await chartGeometry(page)).xTicks).toEqual(["0", "10", "20", "30", "40", "50", "60", "70", "80", "90", "100"]);
});

test("#12 bell curve passes through the bar centres", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  const g = await chartGeometry(page);
  expect(g.curve).toHaveLength(101);
  for (const m of [0, 5, 50, 95, 100]) expect(g.curve[m][0]).toBeCloseTo(g.hitX[m] + g.step / 2, 1);
  for (const b of g.bars) expect(b.x + b.w / 2).toBeCloseTo(g.hitX[b.mark] + g.step / 2, 1);
});

test("#12 bell curve is drawn as expected students per mark (n × pdf)", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  const marks = fixtureMarks("valid_basic.xlsx", "CS F211");
  const n = marks.length, mean = marks.reduce((a, b) => a + b) / n;
  const std = Math.sqrt(marks.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const g = await chartGeometry(page);
  const bar = g.bars[0], count = marks.filter(m => m === bar.mark).length;
  const pxPerStudent = bar.h / count;
  for (const m of [20, Math.round(mean), 80]) {
    const pdf = Math.exp(-0.5 * ((m - mean) / std) ** 2) / (std * Math.sqrt(2 * Math.PI));
    expect(g.curve[m][1]).toBeCloseTo(g.plotBottom - n * pdf * pxPerStudent, 1);
  }
});

test("#12 no curve (and no NaN) when every mark is identical", async ({ page }) => {
  await startGrading(page, "identical_marks.xlsx", "CS F211");
  const g = await chartGeometry(page);
  expect(g.curve).toEqual([]);
  expect(g.bars).toHaveLength(1);
  expect(g.attrs.filter(v => v.includes("NaN"))).toEqual([]);
});

test("#12 a re-upload during the opening animation leaves no stale chart", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await upload(page, "valid_second.xlsx"); // inside the bars' grow animation
  await expect(page.locator("#course option")).toHaveCount(3);
  await page.waitForTimeout(600);
  await expect(page.locator("#hist > *")).toHaveCount(0);
});

test("#13 stats show — instead of undefined/NaN when there is no data", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#course", ""); // back to "Select a course to begin"
  for (const label of ["Min", "Max", "Avg", "Median"]) {
    await expect(stat(page, label)).toHaveText("—");
  }
});

test("#14 CSV fields are escaped per RFC 4180 and the file is named by course and date", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 2, 5, 10, 0, 0)); // 5 March 2026, local time
  await startGrading(page, "comma_names.xlsx", "Data Structures, Algorithms", 'Dr Rao, "KR"');
  const { filename, text } = await download(page);
  expect(filename).toBe("grades_Data_Structures_Algorithms_2026-03-05.csv");
  expect(text).toBe(
    'Instructor,"Dr Rao, ""KR"""\n' +
    'Course,"Data Structures, Algorithms"\n' +
    "\n" +
    "BITS ID,Total Marks,Grade\n" +
    "2023A7PS0001P,81,A\n" +
    "2023A7PS0002P,42,C\n"
  );
});

test("#14 quotes in a course name are doubled", async ({ page }) => {
  await startGrading(page, "comma_names.xlsx", 'Intro to "C"');
  const { filename, text } = await download(page);
  expect(text).toContain('Course,"Intro to ""C"""\n');
  expect(filename).toMatch(/^grades_Intro_to_C_\d{4}-\d{2}-\d{2}\.csv$/);
});

test("#15 export is blocked inline when the instructor name is empty", async ({ page }) => {
  // Stage 2 (E4): the check happens when opening the review dialog.
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await setInstructor(page, "   ");
  let downloaded = false;
  page.on("download", () => { downloaded = true; });
  await page.click("#reviewBtn");
  await expect(page.locator("#exportError")).toContainText("instructor name");
  await expect(page.locator("#reviewDialog")).not.toHaveAttribute("open", "");
  await page.waitForTimeout(300);
  expect(downloaded).toBe(false);
  await expect(page.locator("#thankyou")).toBeEmpty();

  await setInstructor(page, "Dr Rao");
  await expect(page.locator("#exportError")).toBeEmpty();
  const { text } = await download(page);
  expect(text).toMatch(/^Instructor,Dr Rao\n/);
});

test("#16 a grade-count change is announced once via aria-live", async ({ page }) => {
  // Stage 2: the lift/pulse animations are gone (design system); the guarantee
  // they gave, "count changes are noticeable", is now an aria-live announcement.
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await expect(page.locator("#liveRegion")).toHaveAttribute("aria-live", "polite");
  await typeCutoff(page, "A", 90); // CS F211 A marks are 80, 97, 99, 100, 100: only the 80 drops
  await expect(page.locator("#liveRegion")).toHaveText("Grade counts changed: A from 5 to 4, A- from 2 to 3.");
  await typeCutoff(page, "C-", 31); // nobody scores 30 in this course: no count changes
  await expect(page.locator("#liveRegion")).toHaveText("Grade counts changed: A from 5 to 4, A- from 2 to 3.");
});

test("#17 switching course announces no spurious count change", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "A", 90);
  await expect(page.locator("#liveRegion")).not.toBeEmpty();
  await page.selectOption("#course", "MATH F112");
  await expect(page.locator("#gradeSummary tr")).toHaveCount(8);
  await expect(page.locator("#liveRegion")).toBeEmpty();
});

test("#18 attempt ordinals are correct (21st, 22nd, 23rd, 11th–13th)", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  const expected = { 1: "first", 2: "second", 3: "third", 4: "4th", 11: "11th", 12: "12th", 13: "13th", 21: "21st", 22: "22nd", 23: "23rd" };
  // Only the message matters here; Chromium throttles bursts of real downloads.
  for (let n = 1; n <= 23; n++) {
    await finalize(page); // Stage 2 (E4): through the review dialog
    if (expected[n]) await expect(page.locator("#thankyou")).toContainText(`in your ${expected[n]} attempt`);
  }
});

test("#19 Reset cutoffs resets every cutoff at once, without a native dialog", async ({ page }) => {
  // Stage 1 fixed a double confirm(). Stage 2B (#35) removed the confirm()
  // itself: resetting is safe because it can be undone (E5).
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "A", 90);
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await page.click("#resetAll");
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  await expect(rangeText(page, "A-")).toHaveText("A-: 70–79");
  expect(dialogs).toEqual([]);
});

test("#19 a reset by mistake loses nothing: Undo brings the cutoffs back", async ({ page }) => {
  // Was "dismissing the confirmation leaves the cutoffs alone". Stage 2B (#35):
  // the same protection, now through Undo instead of a confirm().
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "A", 90);
  await page.click("#resetAll");
  await page.locator("#resetNotice").getByRole("button", { name: "Undo" }).click();
  await expect(cutoffInput(page, "A")).toHaveValue("90");
});

test("#20 upload uses readAsArrayBuffer, not the deprecated readAsBinaryString", async ({ page }) => {
  await page.addInitScript(() => {
    window.__reads = [];
    for (const m of ["readAsBinaryString", "readAsArrayBuffer"]) {
      const orig = FileReader.prototype[m];
      FileReader.prototype[m] = function (...a) { window.__reads.push(m); return orig.apply(this, a); };
    }
  });
  await page.goto("/");
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await expect(stat(page, "Max")).toHaveText("100");
  expect(await page.evaluate(() => window.__reads)).toEqual(["readAsArrayBuffer"]);
});

test("#21 SheetJS is loaded from the pinned 0.18.5 URL", async ({ page }) => {
  const srcs = await page.locator("script[src]").evaluateAll(s => s.map(x => x.getAttribute("src")));
  expect(srcs).toEqual(["https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"]);
});

test("#22 Reset cutoffs is inert before a course is open", async ({ page }) => {
  // Stage 2: the button is disabled until there are cutoffs to reset.
  // Stage 2B (E5): it moved into the chart panel, which is hidden until a
  // course is open; a forced click still must do nothing.
  const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await expect(page.locator("#resetAll")).toBeHidden();
  await expect(page.locator("#resetAll")).toBeDisabled();
  await page.locator("#resetAll").dispatchEvent("click"); // fresh page
  await upload(page, "valid_basic.xlsx");                 // courses loaded, none selected
  await expect(page.locator("#course option")).toHaveCount(3);
  await expect(page.locator("#resetAll")).toBeDisabled();
  await page.locator("#resetAll").dispatchEvent("click");
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
  expect(dialogs).toEqual([]);
});

test("#23 going back to the placeholder clears the grading view and disables export", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#course", "");
  await expect(page.locator("#reviewBtn")).toBeDisabled();
  await expect(page.locator("#grades")).toBeEmpty();
  await expect(page.locator("#gradeSummary")).toBeEmpty();
  await expect(page.locator("#appContext")).toBeHidden(); // Stage 2: the welcome line was cut; no per-course context survives
});

test("#23 choosing a course without a name leaves no previous course on screen, and asks inline", async ({ page }) => {
  // Stage 2: CLAUDE.md forbids alert(), so the prompt is inline (was an alert in Stage 1).
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await setInstructor(page, "");
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await page.selectOption("#course", "MATH F112");
  await expect(page.locator("#course")).toHaveValue("");
  await expect(page.locator("#reviewBtn")).toBeDisabled();
  await expect(page.locator("#grades")).toBeEmpty();
  await expect(stat(page, "Max")).toHaveText("—");
  await expect(page.locator("#courseError")).toHaveText("Enter your name before choosing a course.");
  await expect(page.locator("#instructor")).toBeFocused();
  expect(dialogs).toEqual([]);

  await setInstructor(page, "Dr Rao"); // typing a name clears the message
  await expect(page.locator("#courseError")).toBeEmpty();
});

test("#24 numeric course codes work and stray spaces don't split a course", async ({ page }) => {
  await startGrading(page, "numeric_course.xlsx", "101");
  expect(await courseOptions(page)).toEqual(["", "101", "202"]);
  await expect(stat(page, "Min")).toHaveText("55");
  await expect(stat(page, "Max")).toHaveText("85");
  const { text } = await download(page);
  expect(text.trim().split("\n").slice(4)).toEqual([
    "2023A7PS0001P,75,A-",
    "2023A7PS0002P,55,B-",
    "2023A7PS0003P,85,A",
  ]);
});

test("#25 an unreadable file shows an inline error instead of throwing", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await upload(page, "corrupt.xlsx");
  await expect(page.locator("#uploadError")).toContainText("could not be read");
  expect(errors).toEqual([]);
  expect(await courseOptions(page)).toEqual([""]);
});

test("happy path: upload, select course, adjust a cutoff, export the right grades", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  // Stage 2: the name is shown as typed, never upper-cased (the welcome line
  // that used to show it was cut in the polish pass; since 2C the setup summary shows it).
  await expect(page.locator("#sumInstructor")).toHaveText("Dr Rao");
  await expect(page.locator("#grades input[type=number]")).toHaveCount(7);
  await expect(page.locator("#reviewBtn")).toBeEnabled();

  // Raise the A cutoff to 85; A- now ends at 84.
  await typeCutoff(page, "A", 85);
  await expect(rangeText(page, "A-")).toHaveText("A-: 70–84");

  // Expected grades computed independently from the fixture.
  const bands = [["A", 85], ["A-", 70], ["B", 60], ["B-", 50], ["C", 40], ["C-", 30], ["D", 20], ["E", 0]];
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(fixture("valid_basic.xlsx")).Sheets.Marks)
    .filter(r => r.Course === "CS F211");
  const expectedLines = rows.map(r => {
    const grade = bands.find(([, min]) => r["Total Marks"] >= min)[0];
    return `${r["BITS ID"]},${r["Total Marks"]},${grade}`;
  });
  const counts = Object.fromEntries(bands.map(([g]) => [g, 0]));
  expectedLines.forEach(l => counts[l.split(",")[2]]++);
  expect(await gradeCounts(page)).toEqual(counts);

  const { filename, text } = await download(page);
  expect(filename).toMatch(/^grades_CS_F211_\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = text.split("\n");
  expect(lines.slice(0, 4)).toEqual(["Instructor,Dr Rao", "Course,CS F211", "", "BITS ID,Total Marks,Grade"]);
  expect(lines.slice(4, -1)).toEqual(expectedLines); // every student exactly once, in file order
  expect(lines.at(-1)).toBe("");
  await expect(page.locator("#thankyou")).toContainText("in your first attempt");
});

for (const course of ["CS F211", "MATH F112"]) {
  test(`#26 bell curve stays inside the chart for clustered marks (${course})`, async ({ page }) => {
    await startGrading(page, "clustered_marks.xlsx", course);
    const g = await chartGeometry(page);
    expect(g.curve.length).toBeGreaterThan(0);
    expect(Math.min(...g.curve.map(([, y]) => y))).toBeGreaterThanOrEqual(g.plotTop - 0.01);
  });
}

test("#27 timer, attempt count and thank-you message are per course", async ({ page }) => {
  await pausedClock(page);
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.clock.fastForward(10_000);
  await download(page);
  await expect(page.locator("#thankyou")).toContainText("0 min 10 sec in your first attempt");

  await page.selectOption("#course", "MATH F112");
  await expect(page.locator("#thankyou")).toBeEmpty();
  await expect(page.locator("#timerText")).toHaveText("00:00");
  await page.clock.fastForward(5_000);
  await expect(page.locator("#timerText")).toHaveText("00:05"); // running again, not frozen on CS F211
  await download(page);
  await expect(page.locator("#thankyou")).toContainText("0 min 5 sec in your first attempt");
});

test("#27 a new upload resets the timer, attempt count and both messages", async ({ page }) => {
  await pausedClock(page);
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.clock.fastForward(7_000);
  await download(page);
  await setInstructor(page, "");
  await page.click("#reviewBtn"); // Stage 2 (E4): blocked when opening the review
  await expect(page.locator("#exportError")).not.toBeEmpty();
  await expect(page.locator("#thankyou")).not.toBeEmpty();

  await upload(page, "valid_second.xlsx");
  await expect(page.locator("#course option")).toHaveCount(3);
  await expect(page.locator("#thankyou")).toBeEmpty();
  await expect(page.locator("#exportError")).toBeEmpty();
  await expect(page.locator("#timerText")).toHaveText("00:00");

  await setInstructor(page, "Dr Rao");
  await page.selectOption("#course", "BIO F110");
  await page.clock.fastForward(3_000);
  await download(page);
  await expect(page.locator("#thankyou")).toContainText("0 min 3 sec in your first attempt");
});

test("#28 duplicate BITS IDs within a course reject the upload", async ({ page }) => {
  await upload(page, "duplicate_ids.xlsx");
  const err = page.locator("#uploadError");
  await expect(err).toContainText("Row 5: BITS ID 2023a7ps0002p already appears in CS F211 (row 3)");
  await expect(err).toContainText("Row 7: BITS ID 2023A7PS0001P already appears in CS F211 (row 2)");
  await expect(err).not.toContainText("Row 4:"); // same ID in another course is fine
  expect(await courseOptions(page)).toEqual([""]);
});

test("#28 the same BITS ID in different courses is accepted", async ({ page }) => {
  await startGrading(page, "cross_course_ids.xlsx", "MATH F112");
  await expect(page.locator("#uploadError")).toBeEmpty();
  expect(await courseOptions(page)).toEqual(["", "CS F211", "MATH F112"]);
  const { text } = await download(page);
  expect(text).toContain("2023A7PS0001P,82,A\n");
});

test("#29 formula-like values are neutralised in the CSV", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211", "=1+1");
  const { text } = await download(page);
  expect(text.split("\n")[0]).toBe("Instructor,'=1+1");
});

test("#29 csvField prefixes every formula trigger and still quotes per RFC 4180", async ({ page }) => {
  const out = await page.evaluate(() =>
    ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx", "=1,2", "a=b", "Dr Rao"].map(csvField));
  expect(out).toEqual(["'=1+1", "'+1", "'-1", "'@SUM(A1)", "'\tx", "\"'\rx\"", "\"'=1,2\"", "a=b", "Dr Rao"]);
});

test("#30 CSV starts with a UTF-8 BOM so Excel reads non-ASCII names", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211", "Dr Śrīnivāsan");
  const { bytes, text } = await download(page);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(text.split("\n")[0]).toBe("Instructor,Dr Śrīnivāsan");
});

test("#30 the Blob URL is revoked after the download starts", async ({ page }) => {
  await page.addInitScript(() => {
    window.__created = []; window.__revoked = [];
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = b => { const u = create(b); window.__created.push(u); return u; };
    URL.revokeObjectURL = u => { window.__revoked.push(u); return revoke(u); };
  });
  await pausedClock(page);
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await download(page);
  await page.clock.fastForward(60_000);
  const { created, revoked } = await page.evaluate(() => ({ created: window.__created, revoked: window.__revoked }));
  expect(created).toHaveLength(1);
  expect(revoked).toEqual(created);
});

test("ground truth: demo file, Introduction to Programming, default cutoffs", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  await expect(stat(page, "Min")).toHaveText("0");
  await expect(stat(page, "Max")).toHaveText("100");
  await expect(stat(page, "Avg")).toHaveText("60.78");
  await expect(stat(page, "Median")).toHaveText("64");
  expect(await gradeCounts(page)).toEqual({ A: 8, "A-": 17, B: 10, "B-": 13, C: 9, "C-": 4, D: 1, E: 2 });
});

// Stage 2 must not change the export: compare with the bytes Stage 1 produced
// (tests/golden, captured by scripts/capture-goldens.spec.js).
const GOLDEN = require("path").join(__dirname, "golden");
for (const [file, course] of [
  ["intro_default.csv", "Introduction to Programming"],
  ["prob_default.csv", "Probability & Statistics"],
  ["linalg_default.csv", "Linear Algebra"],
]) {
  test(`golden: ${course} CSV is byte-identical to Stage 1 (default cutoffs)`, async ({ page }) => {
    await startGrading(page, "demo_marks.xlsx", course);
    const { bytes } = await download(page);
    expect(bytes.equals(require("fs").readFileSync(require("path").join(GOLDEN, file)))).toBe(true);
  });
}

// ===== Stage 2 foundation =====

test("setup: every input has a visible label", async ({ page }) => {
  for (const [id, text] of [["instructor", "Instructor name"], ["file", "Marks file"], ["course", "Course"]]) {
    const label = page.locator(`label[for="${id}"]`);
    await expect(label).toBeVisible();
    await expect(label).toHaveText(text);
  }
});

test("setup: a file dropped on the drop zone is loaded, and its name and size are shown", async ({ page }) => {
  const bytes = [...require("fs").readFileSync(require("./helpers").fixture("demo_marks.xlsx"))];
  await page.evaluate(bytes => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], "demo_marks.xlsx"));
    document.getElementById("dropzone").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes);
  await expect(page.locator("#course option")).toHaveCount(4);
  await expect(page.locator("#dzTitle")).toHaveText("demo_marks.xlsx");
  await expect(page.locator("#dzMeta")).toContainText("148 students in 3 courses");
});

test("setup: the sample file link points at the demo file", async ({ page, request }) => {
  const link = page.getByRole("link", { name: "Download a sample file" });
  await expect(link).toHaveAttribute("href", "fixtures/demo_marks.xlsx");
  expect((await request.get("/fixtures/demo_marks.xlsx")).ok()).toBe(true);
});

test("setup: collapses to a summary once a course is open, and Edit expands it", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  // Stage 2C: label/value pairs instead of a "·" string; the instructor and
  // class size moved here from the app bar. E6: progress is "N of M courses".
  await expect(page.locator("#setupSummaryText dt")).toHaveText(["File", "Instructor", "Class size", "Downloaded"]);
  await expect(page.locator("#setupSummaryText dd")).toHaveText(["demo_marks.xlsx", "Dr Rao", "64", "0 of 3 courses"]);
  await expect(page.locator("#instructor")).toBeHidden();
  await expect(page.locator("#course")).toBeVisible(); // switching course stays one click away
  await page.click("#editSetup");
  await expect(page.locator("#instructor")).toBeVisible();
  await expect(page.locator("#instructor")).toBeFocused();
  await expect(page.locator("#instructor")).toHaveValue("Dr Rao"); // kept as typed
});

test("empty state says what to do next, before and after a file is loaded", async ({ page }) => {
  await expect(page.locator("#emptyState")).toBeVisible();
  await expect(page.locator("#emptyText")).toContainText("upload a marks file");
  await expect(page.locator(".workspace")).toBeHidden();
  await upload(page, "demo_marks.xlsx");
  await expect(page.locator("#emptyText")).toHaveText("Choose a course to see its mark distribution and set its grade cutoffs.");
  await page.fill("#instructor", "Dr Rao");
  await page.selectOption("#course", "Linear Algebra");
  await expect(page.locator("#emptyState")).toBeHidden();
  await expect(page.locator(".workspace")).toBeVisible();
});

// Stage 2C: the app bar keeps only the course and the grading time; the
// instructor and class size are checked in the setup summary instead.
test("app bar shows the course and timer only once grading starts; the summary has instructor and class size", async ({ page }) => {
  await expect(page.locator("#appContext")).toBeHidden();
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  await expect(page.locator("#appContext")).toBeVisible();
  await expect(page.locator("#ctxCourse")).toHaveText("Introduction to Programming");
  await expect(page.locator("#timerText")).toBeVisible();
  await expect(page.locator("#appContext")).not.toContainText("Dr Rao");
  await expect(page.locator("#sumInstructor")).toHaveText("Dr Rao");
  await expect(page.locator("#sumCount")).toHaveText("64");
});

// ===== E1: cutoff editor =====

test("E1: default derived ranges cover 0–100 with no gaps", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  const expected = { A: "80–100", "A-": "70–79", B: "60–69", "B-": "50–59", C: "40–49", "C-": "30–39", D: "20–29", E: "0–19" };
  for (const [g, r] of Object.entries(expected)) await expect(rangeText(page, g)).toHaveText(`${g}: ${r}`);
  await expect(page.locator("#changeCount")).toHaveText("Default cutoffs");
});

test("E1: an out-of-range cutoff clamps on blur and says so", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  await typeCutoff(page, "A-", 95); // must stay below A (80)
  await expect(cutoffInput(page, "A-")).toHaveValue("79");
  await expect(page.locator("#cutoffNote")).toHaveText("A- must start between 61 and 79, so it was set to 79.");
  await typeCutoff(page, "B", 12); // must stay above B- (50)
  await expect(cutoffInput(page, "B")).toHaveValue("51");
  await expect(rangeText(page, "B-")).toHaveText("B-: 50–50");
});

test("E1: clearing a cutoff restores its value on blur", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  await typeCutoff(page, "C", "");
  await expect(cutoffInput(page, "C")).toHaveValue("40");
  await expect(page.locator("#cutoffNote")).toContainText("C must start between");
});

test("E1: arrow keys step a cutoff and apply immediately", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  await cutoffInput(page, "A").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  await expect(rangeText(page, "A-")).toHaveText("A-: 70–77"); // applied without leaving the field
  await page.keyboard.press("ArrowUp");
  await expect(rangeText(page, "A")).toHaveText("A: 79–100");
});

test("E1: − / + buttons step within bounds and disable at the limit", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  const row = page.locator(".cutoff-row", { has: cutoffInput(page, "A") });
  const lower = row.getByRole("button", { name: "Lower the A cutoff by 1" });
  const raise = row.getByRole("button", { name: "Raise the A cutoff by 1" });
  await raise.click();
  await expect(cutoffInput(page, "A")).toHaveValue("81");
  await typeCutoff(page, "A", 100);
  await expect(raise).toBeDisabled();        // A cannot start above 100
  await typeCutoff(page, "A-", 99);
  await expect(page.locator(".cutoff-row", { has: cutoffInput(page, "A-") })
    .getByRole("button", { name: "Raise the A- cutoff by 1" })).toBeDisabled(); // touching A
  await expect(lower).toBeDisabled();        // A at 100 can't go below A- + 1 = 100
});

test("E1: the action bar counts cutoffs changed from default", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  await expect(page.locator("#resetAll")).toBeDisabled();
  await typeCutoff(page, "A", 78);
  await expect(page.locator("#changeCount")).toHaveText("1 cutoff changed from default");
  await typeCutoff(page, "B-", 52);
  await expect(page.locator("#changeCount")).toHaveText("2 cutoffs changed from default");
  await typeCutoff(page, "A", 80);
  await expect(page.locator("#changeCount")).toHaveText("1 cutoff changed from default");
  await expect(page.locator("#resetAll")).toBeEnabled();
});

test("golden: modified cutoffs (A 78, B- 52) export byte-identical to Stage 1", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  await typeCutoff(page, "A", 78);
  await typeCutoff(page, "B-", 52);
  const { bytes } = await download(page);
  expect(bytes.equals(require("fs").readFileSync(require("path").join(GOLDEN, "intro_A78_Bminus52.csv")))).toBe(true);
});

// ===== E2: interactive histogram =====

const INTRO = "Introduction to Programming";
const introMarks = () => fixtureMarks("demo_marks.xlsx", INTRO);

// Page x of a cutoff boundary / a mark's centre, from the chart's own geometry.
async function markToPageX(page, mark, { centre = false } = {}) {
  const g = await chartGeometry(page);
  const box = await page.locator("#hist").boundingBox();
  const vbWidth = await page.locator("#hist").evaluate(s => s.viewBox.baseVal.width);
  return box.x + (g.hitX[mark] + (centre ? g.step / 2 : 0)) * (box.width / vbWidth);
}

async function dragHandle(page, grade, toMark) {
  const knob = await page.locator(`.cutoff-handle[data-grade="${grade}"] .cutoff-knob`).boundingBox();
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
  await page.mouse.down();
  const target = await markToPageX(page, toMark);
  await page.mouse.move(target, knob.y + 40, { steps: 8 });
  await page.mouse.up();
}

// Stage 2C: bars are one neutral tone; the grade is carried as data-grade
// (rewritten from asserting the A-/A fill colours).
test("E2: one bar per scored mark, tagged with the grade it currently receives", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const bar = page.locator('#hist rect.bar[data-mark="79"]');
  await expect(bar).toHaveAttribute("data-grade", "A-");
  await typeCutoff(page, "A", 79);
  await expect(bar).toHaveAttribute("data-grade", "A");
  expect((await chartGeometry(page)).bars).toHaveLength(new Set(introMarks()).size);
});

test("E2: dragging a cutoff handle moves the cutoff and updates the counts", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await dragHandle(page, "A", 78);
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  const marks = introMarks();
  expect((await gradeCounts(page)).A).toBe(marks.filter(m => m >= 78).length);   // 8 + the 78s and 79
  await expect(page.locator("#changeCount")).toHaveText("1 cutoff changed from default");
});

test("E2: dragging obeys the same limits as the inputs", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await dragHandle(page, "A-", 95); // cannot pass A (80)
  await expect(cutoffInput(page, "A-")).toHaveValue("79");
  await dragHandle(page, "D", 0);   // cannot reach 0 (E keeps at least mark 0)
  await expect(cutoffInput(page, "D")).toHaveValue("1");
});

test("E2: hovering a bar shows its mark, student count and grade", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const count = introMarks().filter(m => m === 78).length;
  const box = await page.locator("#hist").boundingBox();
  await page.mouse.move(await markToPageX(page, 78, { centre: true }), box.y + box.height / 2);
  await expect(page.locator("#tooltip")).toBeVisible();
  await expect(page.locator("#tooltip")).toHaveText(`78 marks: ${count} students (A-)`);
  await page.mouse.move(await markToPageX(page, 79, { centre: true }), box.y + box.height / 2);
  await expect(page.locator("#tooltip")).toHaveText("79 marks: 1 student (A-)");
});

test("E2: the chart can be read by keyboard, one mark at a time", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await page.locator("#hist").focus();
  const marks = introMarks();
  await expect(page.locator("#tooltip")).toHaveText(`0 marks: ${marks.filter(m => m === 0).length} student${marks.filter(m => m === 0).length === 1 ? "" : "s"} (E)`);
  await page.keyboard.press("End");
  await expect(page.locator("#tooltip")).toContainText("100 marks:");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#tooltip")).toContainText("99 marks:");
  await page.keyboard.press("Tab");
  await expect(page.locator("#tooltip")).toBeHidden();
});

test("E2: handles are pointer-only; the cutoff inputs are the keyboard route", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(page.locator("#hist .handles")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#hist .cutoff-handle")).toHaveCount(7);
});

test("E2: Std dev stat and a text summary for screen readers", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const m = introMarks(), mean = m.reduce((a, b) => a + b) / m.length;
  const std = Math.sqrt(m.reduce((a, b) => a + (b - mean) ** 2, 0) / m.length);
  await expect(stat(page, "Std dev")).toHaveText(std.toFixed(2));
  const summary = page.locator("#chartSummary");
  await expect(summary).toContainText(`64 marks in ${INTRO}, from 0 to 100, mean 60.78`);
  await expect(summary).toContainText("A 8 (80 to 100), A- 17 (70 to 79)");
  await expect(page.locator("#hist")).toHaveAttribute("aria-describedby", "chartSummary");
});

// ===== E3: borderline students =====

// Expected groups computed from the fixture: students in the grade just below
// each cutoff, within N marks of it. Returns { A: ["id (mark)", ...], ... }.
function expectedBorderline(file, courseName, cut, N) {
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(fixture(file)).Sheets.Marks).filter(r => r.Course === courseName);
  const G = ["A", "A-", "B", "B-", "C", "C-", "D"], out = {};
  G.forEach((g, i) => {
    const floor = Math.max(cut[g] - N, i === G.length - 1 ? 0 : cut[G[i + 1]]);
    const s = rows.filter(r => r["Total Marks"] >= floor && r["Total Marks"] < cut[g])
      .sort((a, b) => b["Total Marks"] - a["Total Marks"] || String(a["BITS ID"]).localeCompare(String(b["BITS ID"])))
      .map(r => `${r["BITS ID"]} (${r["Total Marks"]})`);
    if (s.length) out[g] = s;
  });
  return out;
}
const DEFAULT_CUT = { A: 80, "A-": 70, B: 60, "B-": 50, C: 40, "C-": 30, D: 20 };

async function shownBorderline(page) {
  return page.locator("#borderline .bl-group").evaluateAll(groups => Object.fromEntries(groups.map(g =>
    [g.dataset.grade, [...g.querySelectorAll("li")].map(li => li.textContent.trim())])));
}

test("E3: lists the students just below each cutoff (demo file, N = 2)", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const expected = expectedBorderline("demo_marks.xlsx", INTRO, DEFAULT_CUT, 2);
  expect(Object.keys(expected)).toEqual(["A", "B", "B-", "D"]); // cutoffs with nobody near are hidden
  expect(await shownBorderline(page)).toEqual(expected);
  await expect(page.locator('.bl-group[data-grade="A"] .bl-title')).toContainText("3 students 1–2 marks below A (starts at 80)");
  await expect(page.locator('.bl-group[data-grade="D"] .bl-title')).toContainText("1 student 1 mark below D");
});

test("E3: changing N changes the list", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  for (const N of [1, 3]) {
    await page.selectOption("#borderN", String(N));
    expect(await shownBorderline(page)).toEqual(expectedBorderline("demo_marks.xlsx", INTRO, DEFAULT_CUT, N));
  }
});

test("E3: the one-click action lowers the cutoff and updates the counts", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await page.getByRole("button", { name: "Lower A to 78 (+3 students)" }).click();
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  expect((await gradeCounts(page)).A).toBe(8 + 3);
  expect((await gradeCounts(page))["A-"]).toBe(17 - 3);
  // Those three are now A; the next students below A (the 77) take their place.
  expect((await shownBorderline(page)).A).toEqual(expectedBorderline("demo_marks.xlsx", INTRO, { ...DEFAULT_CUT, A: 78 }, 2).A);
});

test("E3: the action is disabled when a neighbouring cutoff blocks it", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A-", 79); // A- is now just the 79; lowering A to 79 would empty it
  const btn = page.getByRole("button", { name: "Lower A to 79 (+1 student)" });
  await expect(btn).toBeDisabled();
  await expect(page.locator('.bl-group[data-grade="A"] .help')).toHaveText("A- starts at 79, so A can't move down to 79.");
  await expect(btn).toHaveAttribute("aria-describedby", "bl-why-g-A");
});

test("E3: hovering a student highlights their bar", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await page.locator('.bl-group[data-grade="B"] li').first().hover();
  await expect(page.locator('#hist rect.bar.highlight')).toHaveAttribute("data-mark", "59");
  await expect(page.locator('#hist rect.bar.highlight')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(page.locator('#hist rect.bar.highlight')).toHaveCount(0);
});

test("E3: clear empty state when nobody is near a cutoff", async ({ page }) => {
  await startGrading(page, "identical_marks.xlsx", "CS F211"); // everyone has 65
  await expect(page.locator("#borderline")).toHaveText("No students are within 2 marks below any cutoff.");
});

// ===== E4: review before export =====

async function dialogCounts(page) {
  return page.locator("#rvTable tr").evaluateAll(rows =>
    Object.fromEntries(rows.map(r => [r.dataset.grade, Number(r.querySelector("td b").textContent)])));
}

test("E4: the review dialog shows exactly the current state", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await typeCutoff(page, "B-", 52);
  await page.click("#reviewBtn");
  const dialog = page.locator("#reviewDialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#reviewHeading")).toBeFocused();
  await expect(page.locator("#rvCourse")).toHaveText(INTRO);
  await expect(page.locator("#rvInstructor")).toHaveText("Dr Rao");
  await expect(page.locator("#rvCount")).toHaveText("64");
  expect(await dialogCounts(page)).toEqual(await gradeCounts(page));
  await expect(page.locator("#rvTable tr[data-grade='A'] td").first()).toHaveText("78–100");
  expect(await page.locator("#rvChanges li").allTextContents()).toEqual(["A: 80 to 78", "B-: 50 to 52"]);
  const near = await page.locator("#borderline li").count();
  await expect(page.locator("#rvBorderline")).toHaveText(
    `${near} students are within 2 marks below a cutoff. You can still adjust the cutoffs before downloading.`);
});

test("E4: with default cutoffs the dialog says nothing was changed", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await page.click("#reviewBtn");
  expect(await page.locator("#rvChanges li").allTextContents()).toEqual(["None. All cutoffs are at their defaults."]);
});

for (const [how, close] of [
  ["Esc", page => page.keyboard.press("Escape")],
  ["Back to grading", page => page.getByRole("button", { name: "Back to grading" }).click()],
]) {
  test(`E4: ${how} closes the review and leaves everything as it was`, async ({ page }) => {
    let downloaded = false;
    page.on("download", () => { downloaded = true; });
    await startGrading(page, "demo_marks.xlsx", INTRO);
    await typeCutoff(page, "A", 78);
    const before = await gradeCounts(page);
    await page.click("#reviewBtn");
    await expect(page.locator("#reviewDialog")).toBeVisible();
    await close(page);
    await expect(page.locator("#reviewDialog")).toBeHidden();
    await expect(page.locator("#reviewBtn")).toBeFocused();       // focus returns
    await expect(cutoffInput(page, "A")).toHaveValue("78");
    expect(await gradeCounts(page)).toEqual(before);
    await expect(page.locator("#thankyou")).toBeEmpty();
    expect(downloaded).toBe(false);
    await download(page);                                           // still the first attempt
    await expect(page.locator("#thankyou")).toContainText("in your first attempt");
  });
}

test("E4: Download grades closes the dialog and attempt counting continues", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const first = await download(page);
  await expect(page.locator("#reviewDialog")).toBeHidden();
  await expect(page.locator("#thankyou")).toContainText("in your first attempt");
  const second = await download(page);
  await expect(page.locator("#thankyou")).toContainText("in your second attempt");
  expect(second.bytes.equals(first.bytes)).toBe(true);
});

// ===== Accessibility =====

function contrast(a, b) {
  const lum = rgb => {
    const [r, g, bl] = rgb.match(/\d+/g).slice(0, 3).map(v => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Stage 2C: chips are neutral (surface, rule border, ink text). Rewritten
// from one AA check per grade-ramp colour.
test("a11y: grade chips are neutral and their text meets WCAG AA (4.5:1)", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const chips = await page.locator("#gradeSummary .chip").evaluateAll(els =>
    els.map(e => ({ g: e.textContent, fg: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor })));
  expect(chips).toHaveLength(8);
  for (const c of chips) expect.soft(contrast(c.fg, c.bg), `grade ${c.g}`).toBeGreaterThanOrEqual(4.5);
  expect(new Set(chips.map(c => c.bg + c.fg)).size).toBe(1); // no colour per grade
});

test("Stage 2C: each distribution row has a share bar scaled to the largest grade", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const rows = await page.locator("#gradeSummary tr").evaluateAll(trs => trs.map(tr => ({
    n: Number(tr.querySelector("td b").textContent),
    w: parseFloat(tr.querySelector(".share-bar").style.width),
    hidden: tr.querySelector(".share-track").getAttribute("aria-hidden") })));
  const most = Math.max(...rows.map(r => r.n));
  for (const r of rows) {
    expect(r.w).toBeCloseTo(100 * r.n / most, 0);
    expect(r.hidden).toBe("true"); // the % text is what assistive tech reads
  }
});

// Stage 2C: every bar is the same neutral tone over either the bare surface or
// the faint alternate band shade. It must stand out from both by at least 3:1
// (WCAG 1.4.11, non-text contrast). Rewritten from one ratio per grade colour.
async function barBandContrasts(page) {
  const c = await page.evaluate(() => {
    const fill = sel => getComputedStyle(document.querySelector(sel)).fill;
    return { bar: fill("#hist rect.bar"), surface: getComputedStyle(document.querySelector(".panel")).backgroundColor,
      bands: [...document.querySelectorAll("#hist .bands rect")].map(r => getComputedStyle(r).fill).filter(f => f !== "none") };
  });
  expect(c.bands.length).toBeGreaterThan(0); // some bands are shaded
  return [contrast(c.bar, c.surface), ...c.bands.map(b => contrast(c.bar, b))];
}

test("a11y: every bar has at least 3:1 contrast against the surface and the band shade", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  for (const r of await barBandContrasts(page)) expect.soft(r).toBeGreaterThanOrEqual(3);
  // One neutral tone for every grade: no colour per grade.
  const fills = await page.locator("#hist rect.bar").evaluateAll(bs => [...new Set(bs.map(b => getComputedStyle(b).fill))]);
  expect(fills).toHaveLength(1);
});

test("a11y: errors, notes and count changes are announced", async ({ page }) => {
  for (const id of ["uploadError", "courseError", "exportError"]) await expect(page.locator(`#${id}`)).toHaveAttribute("role", "alert");
  await expect(page.locator("#thankyou")).toHaveAttribute("role", "status");
  await expect(page.locator("#tooltip")).toHaveAttribute("role", "status");
  await expect(page.locator("#cutoffNote")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#liveRegion")).toHaveAttribute("aria-live", "polite");
});

test("a11y: the whole flow works from the keyboard alone", async ({ page }) => {
  // Stage 2B (E8): the theme control in the app bar is the first stop (since
  // 2C one icon button), then the name field.
  await page.keyboard.press("Tab");
  await expect(page.locator("#themeBtn")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#instructor")).toBeFocused();
  await page.keyboard.type("Dr Rao");
  await page.keyboard.press("Tab");
  await expect(page.locator("#file")).toBeFocused();
  // The OS file picker can't be driven by a test; everything else is keyboard-only.
  await page.locator("#file").setInputFiles(fixture("demo_marks.xlsx"));
  await expect(page.locator("#course option")).toHaveCount(4);
  await page.keyboard.press("Tab"); // sample-file link
  await page.keyboard.press("Tab");
  await expect(page.locator("#course")).toBeFocused();
  // Type-ahead picks "Introduction to Programming" (headless tests can't drive
  // the native option popup that ↓ opens on macOS).
  await page.keyboard.press("I");
  await expect(page.locator("body")).toHaveClass(/grading/);

  // Read the chart, then step the A cutoff down twice with the arrow keys.
  await page.locator("#hist").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tooltip")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator("#cut-A")).toBeFocused(); // −/+ are skipped: 7 stops, not 21
  const start = Number(await page.locator("#cut-A").inputValue());
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#cut-A")).toHaveValue(String(start - 2));

  // On to "Review grades", open it, and download from the dialog.
  for (let i = 0; i < 20 && !(await page.locator("#reviewBtn").evaluate(b => b === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(page.locator("#reviewBtn")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#reviewHeading")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Back to grading" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#download")).toBeFocused();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(dl.suggestedFilename()).toMatch(/^grades_/);
  await expect(page.locator("#thankyou")).toContainText("first attempt");
  await expect(page.locator("#reviewBtn")).toBeFocused();
});

for (const width of [360, 1600]) {
  test(`layout: no horizontal scrolling at ${width}px (empty, grading, review)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBe(0);
    await startGrading(page, "demo_marks.xlsx", INTRO);
    await page.selectOption("#borderN", "3");
    expect(await overflow()).toBe(0);
    await page.click("#reviewBtn");
    expect(await overflow()).toBe(0);
  });
}

test("brand: the logo is the page heading, loads from inside index.html, and has alt text", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1, name: "BITS Pilani Digital" })).toBeVisible();
  const logo = page.locator(".appbar h1 img.logo");
  await expect(logo).toHaveAttribute("alt", "BITS Pilani Digital");
  expect(await logo.getAttribute("src")).toMatch(/^data:image\/webp;base64,/); // no extra file to ship
  expect(await logo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect((await logo.boundingBox()).height).toBe(48);
});

test("brand: the tab shows the BITS seal as an inline favicon", async ({ page }) => {
  const href = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(href).toMatch(/^data:image\/png;base64,/);
  const size = await page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, href);
  expect(size).toEqual([64, 64]);
});

test("brand: the tab title is just the tool's name (the favicon carries the brand)", async ({ page }) => {
  await expect(page).toHaveTitle("Grading Console");
});

// ===== Stage 2B: fixes from review (BUG_FIX_LOG #31 onward) =====

test("#31 each course keeps its own cutoffs when switching course", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await page.selectOption("#course", "Linear Algebra");
  await expect(cutoffInput(page, "A")).toHaveValue("80"); // untouched course: defaults
  await typeCutoff(page, "B", 62);
  await page.selectOption("#course", INTRO);
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  await expect(cutoffInput(page, "B")).toHaveValue("60");
  expect((await gradeCounts(page)).A).toBe(introMarks().filter(m => m >= 78).length);
  await page.selectOption("#course", "Linear Algebra");
  await expect(cutoffInput(page, "B")).toHaveValue("62");
});

test("#31 a new upload clears every course's cutoffs", async ({ page }) => {
  // Stage 2B (E6): uploading the *same* file again restores its saved cutoffs
  // (with a notice), so this uses a different file with the same course names.
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "A", 78);
  await upload(page, "clustered_marks.xlsx");
  await page.waitForFunction(() => document.querySelectorAll("#course option").length === 3);
  await page.selectOption("#course", "CS F211");
  await expect(cutoffInput(page, "A")).toHaveValue("80");
});

// Page position of a cutoff line (its boundary x) and the plot's vertical middle.
async function handlePoint(page, grade) {
  const x = await markToPageX(page, await cutoffInput(page, grade).inputValue().then(Number));
  const box = await page.locator("#hist").boundingBox();
  return { x, y: box.y + box.height / 2 };
}

test("#32 a handle can be grabbed 10px either side of its line", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  for (const [grade, offset, to] of [["A", 10, 78], ["B", -10, 57]]) {
    const p = await handlePoint(page, grade);
    await page.mouse.move(p.x + offset, p.y);
    await page.mouse.down();
    await page.mouse.move(await markToPageX(page, to) + offset, p.y, { steps: 8 });
    await page.mouse.up();
    await expect(cutoffInput(page, grade)).toHaveValue(String(to));
  }
});

test("#32 a drag keeps going when the pointer leaves the chart", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const p = await handlePoint(page, "A");
  const box = await page.locator("#hist").boundingBox();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x, box.y - 60, { steps: 4 });                          // off the top of the chart
  await page.mouse.move(await markToPageX(page, 75), box.y - 60, { steps: 6 });  // still dragging
  await page.mouse.up();
  await expect(cutoffInput(page, "A")).toHaveValue("75");
});

// Touch input through CDP, so the browser decides between drag and scroll as it
// would on a phone (Playwright's touchscreen API only taps).
async function touchSwipe(page, from, to, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const point = (t) => [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(i / steps) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300); // let any scroll settle
}

// Stage 2C: still shown once each, but the instructor moved to the summary.
test("#33 the course is shown once in the app bar, the instructor once in the setup summary", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(page.locator("#appContext")).toContainText(INTRO);
  await expect(page.locator("#setupSummary")).not.toContainText(INTRO);
  await expect(page.locator("#setupSummary")).toContainText("Dr Rao");
  await expect(page.locator("#appContext")).not.toContainText("Dr Rao");
});

// ===== Stage 2B: E2 follow-ups (chart) =====

function handleLabel(page, grade) {
  return page.locator(`.cutoff-handle[data-grade="${grade}"] .cutoff-label`);
}

test("E2+: each handle is labelled with its grade and value, and follows typed cutoffs", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(page.locator("#chartHelp")).toHaveText("Drag a line or use the controls below to move a cutoff.");
  const labels = await page.locator("#hist .cutoff-label").allTextContents();
  expect(labels).toEqual(["A 80", "A- 70", "B 60", "B- 50", "C 40", "C- 30", "D 20"]);
  await typeCutoff(page, "B-", 52);
  await expect(handleLabel(page, "B-")).toHaveText("B- 52");
});

test("E2+: the label updates live and the handle is active while dragging", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const p = await handlePoint(page, "A");
  await page.mouse.move(p.x, p.y);
  await expect(page.locator('.cutoff-handle[data-grade="A"]')).toHaveCSS("cursor", "ew-resize");
  await page.mouse.down();
  await page.mouse.move(await markToPageX(page, 76), p.y, { steps: 6 });
  await expect(handleLabel(page, "A")).toHaveText("A 76"); // before letting go
  await expect(page.locator('.cutoff-handle[data-grade="A"]')).toHaveClass(/dragging/);
  await page.mouse.up();
  await expect(page.locator('.cutoff-handle[data-grade="A"]')).not.toHaveClass(/dragging/);
});

test("E2+: a faint marker shows the default position of a moved cutoff, labelled on hover", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const markers = page.locator("#hist .default-marker");
  await expect(markers).toHaveCount(7);
  for (const m of await markers.all()) await expect(m).toBeHidden(); // all at default
  await typeCutoff(page, "A", 78);
  const a = page.locator('#hist .default-marker[data-grade="A"]');
  await expect(a).toBeVisible();
  await expect(page.locator('#hist .default-marker[data-grade="B"]')).toBeHidden();
  // Drawn at the default boundary (the left edge of mark 80), not at 78.
  const lineX = await a.locator("line").evaluate(l => Number(l.getAttribute("x1")));
  expect(lineX).toBeCloseTo((await chartGeometry(page)).hitX[80], 1);
  const label = a.locator(".default-label");
  await expect(label).toHaveText("default 80");
  await expect(label).toHaveCSS("opacity", "0");
  const box = await a.locator(".default-hit").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 40);
  await expect(label).toHaveCSS("opacity", "1");
  await typeCutoff(page, "A", 80);
  await expect(a).toBeHidden();
});

// Bounding boxes of the pills, which must never overlap (they stagger when narrow).
async function pillsOverlap(page) {
  const boxes = await page.locator("#hist .cutoff-knob").evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })));
  return boxes.some((a, i) => boxes.some((b, j) => i < j && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b));
}

for (const width of [1440, 390]) {
  test(`E2+: handle labels never overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await startGrading(page, "demo_marks.xlsx", INTRO);
    expect(await pillsOverlap(page)).toBe(false);
    // Stage 2C: one label row. Full "A 80" labels where they fit (1440),
    // values only where they would collide (390).
    const labels = await page.locator("#hist .cutoff-label").allTextContents();
    expect(labels).toEqual(width === 1440
      ? ["A 80", "A- 70", "B 60", "B- 50", "C 40", "C- 30", "D 20"]
      : ["80", "70", "60", "50", "40", "30", "20"]);
    await typeCutoff(page, "A-", 78); // A- right next to A
    expect(await pillsOverlap(page)).toBe(false);
  });
}

for (const [file, courseName] of [["demo_marks.xlsx", INTRO], ["large_class.xlsx", "CS F211"], ["identical_marks.xlsx", "CS F211"]]) {
  test(`#34 the y-axis ends on the next tick above the tallest bar and the curve (${file})`, async ({ page }) => {
    await startGrading(page, file, courseName);
    const g = await chartGeometry(page);
    const ticks = await page.locator("#hist .axes text[text-anchor=end]").allTextContents().then(t => t.map(Number));
    const top = Math.max(...ticks);
    expect(ticks.every(Number.isInteger)).toBe(true);
    const marks = fixtureMarks(file, courseName), counts = {};
    marks.forEach(m => { counts[m] = (counts[m] || 0) + 1; });
    const mean = marks.reduce((a, b) => a + b) / marks.length;
    const std = Math.sqrt(marks.reduce((a, b) => a + (b - mean) ** 2, 0) / marks.length);
    const peak = std > 0 ? marks.length / (std * Math.sqrt(2 * Math.PI)) : 0; // curve's highest point
    const highest = Math.max(...Object.values(counts), peak);
    expect(top).toBeGreaterThan(highest);                        // headroom above bars and curve
    const step = ticks[1] - ticks[0];
    expect(top - step).toBeLessThanOrEqual(highest);             // ...but only one tick of it
    // Neither the bars nor the curve reach the top gridline.
    expect(Math.min(...g.bars.map(b => b.y))).toBeGreaterThan(g.plotTop + 1);
    if (g.curve.length) expect(Math.min(...g.curve.map(([, y]) => y))).toBeGreaterThan(g.plotTop + 1);
  });
}

// ===== E5: undo, redo and reset =====

function stepButton(page, grade, dir) {
  return page.locator(".cutoff-row", { has: cutoffInput(page, grade) }).locator(`.step[data-step="${dir}"]`);
}

test("E5: undo and redo step back and forward through cutoff changes", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(page.locator("#undoBtn")).toBeDisabled();
  await expect(page.locator("#redoBtn")).toBeDisabled();
  await typeCutoff(page, "A", 78);
  await typeCutoff(page, "B-", 52);
  await page.click("#undoBtn");
  await expect(cutoffInput(page, "B-")).toHaveValue("50");
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  await page.click("#undoBtn");
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  await expect(page.locator("#undoBtn")).toBeDisabled();
  await page.click("#redoBtn");
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  expect((await gradeCounts(page)).A).toBe(introMarks().filter(m => m >= 78).length);
  // A new change after an undo discards what could have been redone.
  await page.click("#undoBtn");
  await typeCutoff(page, "C", 42);
  await expect(page.locator("#redoBtn")).toBeDisabled();
});

test("E5: a whole drag is one undo step", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await dragHandle(page, "A", 74); // passes through 79, 78, … 74
  await expect(cutoffInput(page, "A")).toHaveValue("74");
  await page.click("#undoBtn");
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  await expect(page.locator("#undoBtn")).toBeDisabled();
});

test("E5: a quick burst of − clicks is one step; a pause starts a new one", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const lower = stepButton(page, "A", -1);
  for (let i = 0; i < 3; i++) await lower.click();
  await expect(cutoffInput(page, "A")).toHaveValue("77");
  await page.waitForTimeout(800);
  await lower.click();
  await expect(cutoffInput(page, "A")).toHaveValue("76");
  await page.click("#undoBtn");
  await expect(cutoffInput(page, "A")).toHaveValue("77");
  await page.click("#undoBtn");
  await expect(cutoffInput(page, "A")).toHaveValue("80");
});

test("E5: Ctrl/Cmd+Z undoes and Shift+Ctrl/Cmd+Z redoes, but not while typing a name", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await page.locator("#hist").focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  // In the name field the shortcut belongs to the text, not the cutoffs.
  await setInstructor(page, "Dr Rao Singh");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cutoffInput(page, "A")).toHaveValue("78");
});

test("E5: each changed cutoff offers 'Reset to <default>' for just that cutoff", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(page.locator(".cutoff-reset:visible")).toHaveCount(0);
  await typeCutoff(page, "A", 78);
  await typeCutoff(page, "B-", 52);
  const resetA = page.locator('.cutoff-reset[data-grade="A"]');
  await expect(resetA).toHaveText("Reset to 80");
  await expect(page.locator(".cutoff-reset:visible")).toHaveCount(2);
  await resetA.click();
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  await expect(cutoffInput(page, "B-")).toHaveValue("52"); // only that one
  await expect(resetA).toBeHidden();
  await page.click("#undoBtn");
  await expect(cutoffInput(page, "A")).toHaveValue("78");
});

test("E5: after 'Reset to defaults' an inline notice offers Undo", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await typeCutoff(page, "B-", 52);
  await page.click("#resetAll");
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  const notice = page.locator("#resetNotice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Cutoffs reset to defaults.");
  await expect(notice.getByRole("button", { name: "Undo" })).toBeFocused(); // not lost to <body>
  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  await expect(cutoffInput(page, "B-")).toHaveValue("52");
  await expect(notice).toBeHidden();
});

test("E5: undo history belongs to each course", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await page.selectOption("#course", "Linear Algebra");
  await expect(page.locator("#undoBtn")).toBeDisabled(); // nothing done here yet
  await typeCutoff(page, "B", 62);
  await page.selectOption("#course", INTRO);
  await page.click("#undoBtn");
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  await page.selectOption("#course", "Linear Algebra");
  await expect(cutoffInput(page, "B")).toHaveValue("62");
  await page.click("#undoBtn");
  await expect(cutoffInput(page, "B")).toHaveValue("60");
});

test("E5: the bottom bar keeps the change count and Review grades only", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(page.locator(".actionbar button")).toHaveText(["Review grades"]);
  await expect(page.locator("#changeCount")).toHaveText("Default cutoffs");
  const head = page.locator(".panel-head");
  await expect(head.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(head.getByRole("button", { name: "Redo" })).toBeVisible();
  await expect(head.getByRole("button", { name: "Reset to defaults" })).toBeVisible();
  // Stage 2C: the search sits in the same header row, and the icon-only undo
  // and redo show their name in a tooltip on keyboard focus.
  await expect(head.getByRole("searchbox", { name: "Find a student" })).toBeVisible();
  await typeCutoff(page, "A", 78);
  await tabTo(page, "#undoBtn", { back: true });
  const tip = () => page.locator("#undoBtn").evaluate(b => {
    const after = getComputedStyle(b, "::after");
    return { text: after.content, opacity: after.opacity };
  });
  expect(await tip()).toEqual({ text: '"Undo"', opacity: "1" });
});

test("#35 Reset to defaults uses no native confirm() anywhere", async ({ page }) => {
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.type()); d.dismiss(); });
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await page.click("#resetAll");
  await expect(cutoffInput(page, "A")).toHaveValue("80"); // reset happened
  await expect(page.locator("#resetNotice")).toBeVisible();
  expect(dialogs).toEqual([]);
});

// ===== E6: per-course progress and autosave =====

// Stage 2C: statuses read "Course (Status)" instead of "Course · Status".
async function optionLabel(page, value) {
  return page.locator(`#course option[value="${value}"]`).textContent();
}

test("E6: each course shows Not started, In progress or Downloaded", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  expect(await optionLabel(page, INTRO)).toBe(`${INTRO} (Not started)`);
  expect(await optionLabel(page, "Linear Algebra")).toBe("Linear Algebra (Not started)");
  await expect(page.locator("#sumProgress")).toHaveText("0 of 3 courses");
  await typeCutoff(page, "A", 78);
  expect(await optionLabel(page, INTRO)).toBe(`${INTRO} (In progress)`);
  await download(page);
  expect(await optionLabel(page, INTRO)).toBe(`${INTRO} (Downloaded)`);
  await expect(page.locator("#sumProgress")).toHaveText("1 of 3 courses");
  // A change after downloading means the file no longer matches: in progress again.
  await typeCutoff(page, "B", 62);
  expect(await optionLabel(page, INTRO)).toBe(`${INTRO} (In progress)`);
  await expect(page.locator("#sumProgress")).toHaveText("0 of 3 courses");
  await page.click("#undoBtn"); // back to exactly what was downloaded
  expect(await optionLabel(page, INTRO)).toBe(`${INTRO} (Downloaded)`);
});

test("E6: cutoffs and statuses survive a refresh when the same file is uploaded again", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await download(page);
  await page.selectOption("#course", "Linear Algebra");
  await typeCutoff(page, "B", 62);
  await page.reload();
  await expect(page.locator("#restoreNotice")).toBeHidden();
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const notice = page.locator("#restoreNotice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Restored your cutoffs from earlier.");
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  expect(await optionLabel(page, INTRO)).toBe(`${INTRO} (Downloaded)`);
  expect(await optionLabel(page, "Linear Algebra")).toBe("Linear Algebra (In progress)");
  await page.selectOption("#course", "Linear Algebra");
  await expect(cutoffInput(page, "B")).toHaveValue("62");
});

test("E6: Start over forgets the saved cutoffs and returns every course to defaults", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await page.reload();
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  await page.locator("#restoreNotice").getByRole("button", { name: "Start over" }).click();
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  await expect(page.locator("#restoreNotice")).toBeHidden();
  expect(await optionLabel(page, INTRO)).toBe(`${INTRO} (Not started)`);
  await page.reload();
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(page.locator("#restoreNotice")).toBeHidden();
  await expect(cutoffInput(page, "A")).toHaveValue("80");
});

test("E6: a different file does not pick up another file's saved cutoffs", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "A", 78);
  await page.reload();
  // Same course list, different file: not the same marks, so nothing is restored.
  await startGrading(page, "clustered_marks.xlsx", "CS F211");
  await expect(page.locator("#restoreNotice")).toBeHidden();
  await expect(cutoffInput(page, "A")).toHaveValue("80");
});

test("E6: storage holds only cutoffs and statuses, never marks or BITS IDs", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await download(page);
  const stored = await page.evaluate(() => Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]));
  const saved = stored.filter(([k]) => k.startsWith("gradingConsole:v1:file:"));
  expect(saved).toHaveLength(1);
  const [key, json] = saved[0];
  expect(key).toContain("demo_marks.xlsx");
  expect(Object.keys(JSON.parse(json)).sort()).toEqual(["cutoffs", "downloaded"]);
  const everything = stored.flat().join("\n");
  const ids = XLSX.utils.sheet_to_json(XLSX.readFile(fixture("demo_marks.xlsx")).Sheets.Marks).map(r => String(r["BITS ID"]));
  for (const id of ids) expect.soft(everything.includes(id), `BITS ID ${id} stored`).toBe(false);
  // Values are only course -> { grade: cutoff } maps.
  const grades = ["A", "A-", "B", "B-", "C", "C-", "D"];
  for (const perCourse of Object.values(JSON.parse(json)))
    for (const cut of Object.values(perCourse)) expect(Object.keys(cut)).toEqual(grades);
});

test("E6: an untouched file stores nothing", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes(":file:")));
  expect(keys).toEqual([]);
});

test("E6: everything still works when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
  });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  expect(await optionLabel(page, INTRO)).toBe(`${INTRO} (In progress)`);
  const { text } = await download(page);
  expect(text).toContain("Introduction to Programming");
  expect(errors).toEqual([]);
});

// ===== E7: find a student =====

async function findStudent(page, text) {
  await page.fill("#findId", text);
}
const results = page => page.locator("#findResults");

test("E7: an exact ID shows the student's mark and current grade and highlights their bar", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(page.getByLabel("Find a student")).toBeVisible();
  await findStudent(page, "20247096");
  await expect(results(page).locator("li")).toHaveText(["20247096 79 marks A-"], { useInnerText: true });
  await expect(page.locator("#hist")).toHaveClass(/has-highlight/);
  await expect(page.locator('#hist rect.bar[data-mark="79"]')).toHaveClass(/highlight/);
  // The grade follows the cutoffs.
  await typeCutoff(page, "A", 79);
  await expect(results(page).locator("li")).toHaveText(["20247096 79 marks A"], { useInnerText: true });
  // Clearing the field clears the result and the highlight.
  await findStudent(page, "");
  await expect(results(page)).toBeEmpty();
  await expect(page.locator("#hist")).not.toHaveClass(/has-highlight/);
});

test("E7: matching is trimmed, case-insensitive and partial from 4 characters", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await findStudent(page, "  2023a7ps0002p ");
  await expect(results(page).locator("li")).toHaveText(["2023A7PS0002P 19 marks E"], { useInnerText: true });
  await findStudent(page, "ps0002");
  await expect(results(page).locator("li")).toHaveText(["2023A7PS0002P 19 marks E"], { useInnerText: true });
  await findStudent(page, "002");
  await expect(results(page)).toHaveText("Type at least 4 characters of the BITS ID.");
});

test("E7: several matches list the first 5 and say how many more", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await findStudent(page, "20247");
  await expect(results(page).locator("li")).toHaveCount(5);
  await expect(results(page)).toContainText("and 5 more. Type more of the ID to narrow it down.");
  // Every match is highlighted, not just the ones listed.
  const marks = XLSX.utils.sheet_to_json(XLSX.readFile(fixture("demo_marks.xlsx")).Sheets.Marks)
    .filter(r => r.Course === INTRO && String(r["BITS ID"]).startsWith("20247")).map(r => String(r["Total Marks"]));
  const lit = await page.locator("#hist rect.bar.highlight").evaluateAll(b => b.map(x => x.dataset.mark));
  expect(lit.sort()).toEqual([...new Set(marks)].sort());
});

test("E7: no match says so, naming the course", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await findStudent(page, "99999999");
  await expect(results(page)).toHaveText(`No student with that ID in ${INTRO}.`);
  await expect(results(page)).toHaveAttribute("aria-live", "polite");
  // A student who is only in another course isn't found here.
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(fixture("demo_marks.xlsx")).Sheets.Marks);
  const introIds = new Set(rows.filter(r => r.Course === INTRO).map(r => String(r["BITS ID"])));
  const other = rows.find(r => r.Course === "Linear Algebra" && !introIds.has(String(r["BITS ID"])));
  await findStudent(page, String(other["BITS ID"]));
  await expect(results(page)).toHaveText(`No student with that ID in ${INTRO}.`);
});

// ===== E8: dark mode =====

const bodyBg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT_CANVAS = "rgb(245, 244, 250)", DARK_CANVAS = "rgb(18, 17, 32)";

// Stage 2C: the segmented radios became one icon button with a menu of
// menuitemradio items; these tests drive the menu instead of the radios.
const themeItem = (page, value) => page.locator(`#themeMenu [data-value="${value}"]`);
async function chooseTheme(page, name) {
  await page.click("#themeBtn");
  await page.getByRole("menuitemradio", { name }).click();
  await expect(page.locator("#themeMenu")).toBeHidden();
}

test("E8: follows the system theme by default", async ({ page }) => {
  await expect(themeItem(page, "system")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#themeBtn")).toHaveAttribute("aria-label", "Theme: System");
  expect(await bodyBg(page)).toBe(LIGHT_CANVAS);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await bodyBg(page)).toBe(DARK_CANVAS);
});

test("E8: Light and Dark override the system, and the choice survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await chooseTheme(page, "Light");
  expect(await bodyBg(page)).toBe(LIGHT_CANVAS);
  await page.reload();
  await expect(themeItem(page, "light")).toHaveAttribute("aria-checked", "true");
  expect(await bodyBg(page)).toBe(LIGHT_CANVAS);
  await page.emulateMedia({ colorScheme: "light" });
  await chooseTheme(page, "Dark");
  expect(await bodyBg(page)).toBe(DARK_CANVAS);
  await chooseTheme(page, "System");
  expect(await bodyBg(page)).toBe(LIGHT_CANVAS);
  await page.reload();
  await expect(themeItem(page, "system")).toHaveAttribute("aria-checked", "true");
});

test("E8: the theme menu works from the keyboard", async ({ page }) => {
  const btn = page.locator("#themeBtn");
  await btn.focus();
  await page.keyboard.press("Enter");
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(themeItem(page, "system")).toBeFocused(); // opens on the current choice
  await page.keyboard.press("Escape");                  // Escape closes, focus returns
  await expect(page.locator("#themeMenu")).toBeHidden();
  await expect(btn).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");                 // System -> Dark
  await expect(themeItem(page, "dark")).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await bodyBg(page)).toBe(DARK_CANVAS);
  await expect(page.locator("#themeMenu")).toBeHidden();
  await expect(btn).toBeFocused();
  await expect(btn).toHaveAttribute("aria-label", "Theme: Dark");
});

test("E8: the theme menu closes on a click elsewhere, without changing the theme", async ({ page }) => {
  await page.click("#themeBtn");
  await expect(page.locator("#themeMenu")).toBeVisible();
  await page.mouse.click(5, 400);
  await expect(page.locator("#themeMenu")).toBeHidden();
  expect(await bodyBg(page)).toBe(LIGHT_CANVAS);
});

test("E8: the dark tokens are the same whether chosen or from the system", async ({ page }) => {
  const tokens = () => page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const rules = sh => { try { return [...sh.cssRules]; } catch { return []; } }; // skip cross-origin (fonts)
    const all = r => r.cssRules ? [r, ...[...r.cssRules].flatMap(all)] : [r];       // into @media blocks
    const names = [...document.styleSheets].flatMap(rules).flatMap(all).flatMap(r =>
      r.style ? [...r.style].filter(p => p.startsWith("--")) : []);
    return Object.fromEntries([...new Set(names)].map(n => [n, css.getPropertyValue(n).trim()]));
  });
  await page.emulateMedia({ colorScheme: "dark" });
  const fromSystem = await tokens();
  await page.emulateMedia({ colorScheme: "light" });
  await chooseTheme(page, "Dark");
  expect(await tokens()).toEqual(fromSystem);
  expect(fromSystem["--canvas"]).toBe("#121120");
});

// Stage 2C: facts are never joined with "·" (setup summary, course options,
// search results, review), including in native <select> options.
test("Stage 2C: no meta strings joined with a middle dot anywhere in the grading flow", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await page.fill("#findId", "20247");
  const text = () => page.evaluate(() => document.body.innerText +
    [...document.querySelectorAll("option")].map(o => o.textContent).join("\n"));
  expect(await text()).not.toContain("·");
  await page.click("#reviewBtn");
  expect(await text()).not.toContain("·");
});

// Stage 2C: purple is reserved for the accent; every heading is ink, weight 600.
for (const scheme of ["light", "dark"]) {
  test(`Stage 2C: panel and dialog headings are ink, weight 600 (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await startGrading(page, "demo_marks.xlsx", INTRO);
    await page.click("#reviewBtn");
    const heads = await page.locator("h2, h3").evaluateAll(hs => hs.map(h => {
      const cs = getComputedStyle(h);
      return { text: h.textContent, color: cs.color, weight: cs.fontWeight };
    }));
    const ink = await page.evaluate(() => getComputedStyle(document.body).color);
    expect(heads.length).toBeGreaterThan(5);
    for (const h of heads) expect.soft(h, h.text).toMatchObject({ color: ink, weight: "600" });
  });
}

test("E8: no component hard-codes a colour; only the token blocks define them", async () => {
  const html = require("fs").readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1]
    .replace(/\/\*[\s\S]*?\*\//g, "")          // comments
    .replace(/--[\w-]+\s*:[^;}]*[;}]?/g, "");   // token declarations
  expect(css.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi)).toBeNull();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
  expect(scripts.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![\w-])|rgba?\(/gi)).toBeNull();
});

for (const scheme of ["light", "dark"]) {
  test(`E8: grade chips are AA and bars 3:1 in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await startGrading(page, "demo_marks.xlsx", INTRO);
    const chips = await page.locator("#gradeSummary .chip").evaluateAll(els =>
      els.map(e => ({ g: e.textContent, fg: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor })));
    for (const c of chips) expect.soft(contrast(c.fg, c.bg), `chip ${c.g}`).toBeGreaterThanOrEqual(4.5);
    for (const r of await barBandContrasts(page)) expect.soft(r, "bar").toBeGreaterThanOrEqual(3);
    // A focused bar (here: a searched student's) differs in hue and by 2:1 in lightness.
    const neutral = await page.locator("#hist rect.bar").first().evaluate(b => getComputedStyle(b).fill);
    await page.fill("#findId", "20247096");
    const lit = page.locator('#hist rect.bar[data-mark="79"]');
    await expect(lit).toHaveClass(/highlight/);
    const focus = await lit.evaluate(b => getComputedStyle(b).fill);
    expect(contrast(focus, neutral)).toBeGreaterThanOrEqual(2);
    const [r, g, b] = focus.match(/\d+/g).map(Number);
    expect(b - Math.min(r, g)).toBeGreaterThan(40); // clearly violet, not a grey
    // Body text and muted text on the panel surface.
    const text = await page.evaluate(() => {
      const panel = getComputedStyle(document.querySelector(".panel")).backgroundColor;
      return { ink: getComputedStyle(document.body).color, muted: getComputedStyle(document.querySelector(".help")).color, panel };
    });
    expect(contrast(text.ink, text.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text.muted, text.panel)).toBeGreaterThanOrEqual(4.5);
  });
}

// Stage 2C: rewritten from "the logo sits on a light plate". No plate: in
// dark the seal stands alone, followed by the name set as text in --ink.
test("E8: in the dark theme the seal and the name as text replace the lockup, with no plate", async ({ page }) => {
  const heading = page.getByRole("heading", { level: 1 });
  await expect(page.locator(".logo")).toBeVisible();
  await expect(page.locator(".logo-dark")).toBeHidden();
  await expect(heading).toHaveAccessibleName("BITS Pilani Digital");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".logo")).toBeHidden();
  await expect(page.locator(".seal")).toBeVisible();
  await expect(page.locator(".seal")).toHaveAttribute("alt", ""); // the text names it
  await expect(page.locator(".wordmark")).toHaveText("BITS Pilani Digital");
  await expect(heading).toHaveAccessibleName("BITS Pilani Digital");
  const c = await page.evaluate(() => ({
    word: getComputedStyle(document.querySelector(".wordmark")).color, ink: getComputedStyle(document.body).color,
    bgs: [".seal", ".logo-dark", ".wordmark"].map(s => getComputedStyle(document.querySelector(s)).backgroundColor) }));
  expect(c.word).toBe(c.ink);
  for (const bg of c.bgs) expect(bg).toBe("rgba(0, 0, 0, 0)");
  expect(await page.locator(".seal").evaluate(img => img.naturalWidth)).toBe(96); // 2x for sharp screens
});

// ===== E9: impact of changes in the review dialog =====

// Students of a course whose grade differs between two sets of cutoffs, as
// "ID|mark|old|new" (one row of the review's impact table), sorted by mark
// (highest first), then ID. Stage 2C: was a "ID · mark · old to new" list.
function expectedImpact(courseName, cut) {
  const G = ["A", "A-", "B", "B-", "C", "C-", "D"];
  const grade = (m, c) => G.find(g => m >= c[g]) || "E";
  return XLSX.utils.sheet_to_json(XLSX.readFile(fixture("demo_marks.xlsx")).Sheets.Marks)
    .filter(r => r.Course === courseName)
    .map(r => ({ id: String(r["BITS ID"]), m: Math.round(r["Total Marks"]) }))
    .filter(r => grade(r.m, DEFAULT_CUT) !== grade(r.m, cut))
    .sort((a, b) => b.m - a.m || a.id.localeCompare(b.id))
    .map(r => `${r.id}|${r.m}|${grade(r.m, DEFAULT_CUT)}|${grade(r.m, cut)}`);
}
const impactRows = page => page.locator("#rvImpact tbody tr").evaluateAll(trs =>
  trs.map(tr => [...tr.cells].map(c => c.textContent).join("|")));
const impactRow = page => page.locator("#rvImpact tbody tr");

test("E9: the review lists exactly the students whose grade differs from the defaults", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 78);
  await page.click("#reviewBtn");
  const dialog = page.locator("#reviewDialog");
  await expect(dialog.getByRole("heading", { name: "Students whose grade differs from the default cutoffs" })).toBeVisible();
  const expected = expectedImpact(INTRO, { ...DEFAULT_CUT, A: 78 });
  expect(expected[0]).toBe("20247096|79|A-|A");
  await expect(page.locator("#rvImpact thead th")).toHaveText(["BITS ID", "Mark", "Default", "New"]);
  expect(await impactRows(page)).toEqual(expected);
  // The changed grade is the one accent in the table.
  const [to, id, accent] = await page.evaluate(() => {
    const cells = document.querySelector("#rvImpact tbody tr").cells;
    const probe = document.createElement("span"); probe.style.color = "var(--accent)"; document.body.append(probe);
    const a = getComputedStyle(probe).color; probe.remove();
    return [getComputedStyle(cells[3]).color, getComputedStyle(cells[0]).color, a];
  });
  expect(to).toBe(accent);
  expect(id).not.toBe(accent);
  await expect(page.locator("#rvImpactAll")).toBeHidden();
});

test("E9: with default cutoffs the impact section says nobody changed", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await page.click("#reviewBtn");
  await expect(impactRow(page)).toHaveCount(0);
  await expect(page.locator("#rvImpact")).toBeHidden(); // no empty table header
  await expect(page.locator("#rvImpactNone")).toHaveText("No student's grade differs from the default cutoffs.");
});

test("E9: more than 10 changes shows 10, then Show all N", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await typeCutoff(page, "A", 71); // the lowest A can go while A- starts at 70
  const expected = expectedImpact(INTRO, { ...DEFAULT_CUT, A: 71 });
  expect(expected.length).toBeGreaterThan(10);
  await page.click("#reviewBtn");
  expect(await impactRows(page)).toEqual(expected.slice(0, 10));
  const all = page.locator("#rvImpactAll");
  await expect(all).toHaveText(`Show all ${expected.length}`);
  await all.click();
  await expect(impactRow(page)).toHaveCount(expected.length);
  expect(await impactRows(page)).toEqual(expected);
  await expect(all).toBeHidden();
  await expect(page.locator("#rvImpact")).toBeFocused(); // focus isn't lost with the button
  // Reopening starts collapsed again.
  await page.click("#reviewBack");
  await page.click("#reviewBtn");
  await expect(impactRow(page)).toHaveCount(10);
});

test("E9: the review shows the grading time, and the app bar calls it Grading time", async ({ page }) => {
  await pausedClock(page);
  await startGrading(page, "demo_marks.xlsx", INTRO);
  await expect(page.locator("#appContext")).toContainText("Grading time 00:00");
  await page.clock.fastForward(252_000); // 4 min 12 s
  await page.click("#reviewBtn");
  await expect(page.locator("#rvTime")).toHaveText("Grading time: 4 min 12 s");
});

// ===== Stage 2B: checks before finishing =====

// Press Tab (or Shift+Tab) until `selector` has focus; fails if it takes more than `max` presses.
async function tabTo(page, selector, { back = false, max = 40 } = {}) {
  const target = page.locator(selector);
  for (let i = 0; i < max; i++) {
    if (await target.evaluate(el => el === document.activeElement)) return;
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
  }
  await expect(target).toBeFocused();
}

test("a11y: keyboard-only walkthrough of the Stage 2B flow", async ({ page }) => {
  // Upload (the OS picker itself can't be driven), then choose a course.
  await tabTo(page, "#instructor");
  await page.keyboard.type("Dr Rao");
  await tabTo(page, "#file");
  await page.locator("#file").setInputFiles(fixture("demo_marks.xlsx"));
  await expect(page.locator("#course option")).toHaveCount(4);
  await tabTo(page, "#course");
  await page.keyboard.press("I"); // type-ahead: Introduction to Programming
  await expect(page.locator("body")).toHaveClass(/grading/);

  // Change a cutoff with the arrow keys, then undo and redo it from the keyboard.
  await tabTo(page, "#cut-A");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(cutoffInput(page, "A")).toHaveValue("78");
  await page.keyboard.press("ControlOrMeta+z");     // both presses were one step
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(cutoffInput(page, "A")).toHaveValue("78");

  // Search for a student.
  await tabTo(page, "#findId", { back: true });
  await page.keyboard.type("20247096");
  await expect(page.locator("#findResults li")).toHaveText(["20247096 79 marks A"], { useInnerText: true });

  // Review and download.
  await tabTo(page, "#reviewBtn", { max: 80 });
  await page.keyboard.press("Enter");
  await expect(page.locator("#reviewHeading")).toBeFocused();
  await expect(page.locator("#rvImpact tbody tr")).toHaveCount(3);
  await tabTo(page, "#download");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(dl.suggestedFilename()).toMatch(/^grades_Introduction_to_Programming_/);
  await expect(page.locator("#reviewBtn")).toBeFocused();

  // Switch course, then change the theme.
  await tabTo(page, "#course", { back: true, max: 80 });
  await page.keyboard.press("L"); // Linear Algebra
  await expect(page.locator("#ctxCourse")).toHaveText("Linear Algebra");
  await expect(page.locator(`#course option[value="${INTRO}"]`)).toHaveText(`${INTRO} (Downloaded)`);
  await tabTo(page, "#themeBtn", { back: true });
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp"); // System -> Dark
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("ground truth still holds after Stage 2B: Introduction to Programming at default cutoffs", async ({ page }) => {
  // The Stage 1 ground-truth numbers, re-checked through every Stage 2B surface.
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const counts = await gradeCounts(page);
  await page.click("#reviewBtn");
  const dialog = await page.locator("#rvTable tr").evaluateAll(rows =>
    Object.fromEntries(rows.map(r => [r.dataset.grade, Number(r.querySelector("td b").textContent)])));
  expect(dialog).toEqual(counts);
  await expect(page.locator("#rvImpactNone")).toBeVisible();
});

test.describe("#32 touch at 390px", () => {
  test.use({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });

  test("#32 dragging a handle by touch moves the cutoff and does not scroll the page", async ({ page }) => {
    await startGrading(page, "demo_marks.xlsx", INTRO);
    await page.locator("#hist").scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    const p = await handlePoint(page, "A");
    await touchSwipe(page, p, { x: await markToPageX(page, 74), y: p.y + 30 });
    await expect(cutoffInput(page, "A")).toHaveValue("74");
    expect(await page.evaluate(() => scrollY)).toBe(before);
  });

  test("#32 swiping on the chart away from a handle still scrolls the page", async ({ page }) => {
    await startGrading(page, "demo_marks.xlsx", INTRO);
    await page.locator("#hist").scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    const x = await markToPageX(page, 8, { centre: true }); // E band, no handle nearby
    const box = await page.locator("#hist").boundingBox();
    await touchSwipe(page, { x, y: box.y + box.height - 20 }, { x, y: box.y + 20 });
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
    await expect(cutoffInput(page, "D")).toHaveValue("20");
  });
});
