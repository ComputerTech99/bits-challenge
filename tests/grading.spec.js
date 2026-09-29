// Regression tests for the Stage 1 bug fixes. Test names reference the
// row number in BUG_FIX_LOG.md.
const { test, expect } = require("@playwright/test");
const { openApp, upload, startGrading, stat, download, courseOptions, gradeCounts, setInstructor, cutoffInput, typeCutoff, rangeText } = require("./helpers");

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
  await expect(page.locator("#welcome")).toBeEmpty();
  await expect(page.locator("#download")).toBeDisabled();
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
  await expect(page.locator("#download")).toBeEnabled();
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
  await expect(page.locator("#download")).toBeEnabled();
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
        mark: Number(b.dataset.mark), x: num(b, "x"), w: num(b, "width"), y: num(b, "y"), h: num(b, "height"), fill: b.style.fill })),
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
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await setInstructor(page, "   ");
  let downloaded = false;
  page.on("download", () => { downloaded = true; });
  await page.click("#download");
  await expect(page.locator("#exportError")).toContainText("instructor name");
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
    await page.click("#download");
    if (expected[n]) await expect(page.locator("#thankyou")).toContainText(`in your ${expected[n]} attempt`);
  }
});

test("#19 Reset cutoffs asks for confirmation once", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "A", 90);
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await page.click("#resetRanges");
  await expect(cutoffInput(page, "A")).toHaveValue("80");
  await expect(rangeText(page, "A-")).toHaveText("A-: 70–79");
  expect(dialogs).toHaveLength(1);
});

test("#19 dismissing the confirmation leaves the cutoffs alone", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await typeCutoff(page, "A", 90);
  page.on("dialog", d => d.dismiss());
  await page.click("#resetRanges");
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
  const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await expect(page.locator("#resetRanges")).toBeDisabled();
  await page.click("#resetRanges", { force: true }); // fresh page
  await upload(page, "valid_basic.xlsx");            // courses loaded, none selected
  await expect(page.locator("#course option")).toHaveCount(3);
  await expect(page.locator("#resetRanges")).toBeDisabled();
  await page.click("#resetRanges", { force: true });
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
  expect(dialogs).toEqual([]);
});

test("#23 going back to the placeholder clears the grading view and disables export", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#course", "");
  await expect(page.locator("#download")).toBeDisabled();
  await expect(page.locator("#grades")).toBeEmpty();
  await expect(page.locator("#gradeSummary")).toBeEmpty();
  await expect(page.locator("#welcome")).toBeEmpty();
});

test("#23 choosing a course without a name leaves no previous course on screen, and asks inline", async ({ page }) => {
  // Stage 2: CLAUDE.md forbids alert(), so the prompt is inline (was an alert in Stage 1).
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await setInstructor(page, "");
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await page.selectOption("#course", "MATH F112");
  await expect(page.locator("#course")).toHaveValue("");
  await expect(page.locator("#download")).toBeDisabled();
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
  // Stage 2: the name is shown as typed, not upper-cased.
  await expect(page.locator("#welcome")).toHaveText("Welcome, Dr Rao. Review the cutoffs, then finalize the grades.");
  await expect(page.locator("#grades input[type=number]")).toHaveCount(7);
  await expect(page.locator("#download")).toBeEnabled();

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
  await page.click("#download");
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
  await expect(page.locator("#setupSummaryText")).toHaveText("Dr Rao · demo_marks.xlsx · 148 students");
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

test("app bar shows instructor, course, class size and timer only once grading starts", async ({ page }) => {
  await expect(page.locator("#appContext")).toBeHidden();
  await startGrading(page, "demo_marks.xlsx", "Introduction to Programming");
  await expect(page.locator("#appContext")).toBeVisible();
  await expect(page.locator("#ctxInstructor")).toHaveText("Dr Rao");
  await expect(page.locator("#ctxCourse")).toHaveText("Introduction to Programming");
  await expect(page.locator("#ctxCount")).toHaveText("64");
  await expect(page.locator("#timerText")).toBeVisible();
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
  await expect(page.locator("#resetRanges")).toBeDisabled();
  await typeCutoff(page, "A", 78);
  await expect(page.locator("#changeCount")).toHaveText("1 cutoff changed from default");
  await typeCutoff(page, "B-", 52);
  await expect(page.locator("#changeCount")).toHaveText("2 cutoffs changed from default");
  await typeCutoff(page, "A", 80);
  await expect(page.locator("#changeCount")).toHaveText("1 cutoff changed from default");
  await expect(page.locator("#resetRanges")).toBeEnabled();
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

test("E2: one bar per scored mark, coloured by the grade it currently receives", async ({ page }) => {
  await startGrading(page, "demo_marks.xlsx", INTRO);
  const bar = page.locator('#hist rect.bar[data-mark="79"]');
  await expect(bar).toHaveCSS("fill", "rgb(63, 44, 156)");   // A- (#3f2c9c)
  await typeCutoff(page, "A", 79);
  await expect(bar).toHaveCSS("fill", "rgb(46, 31, 122)");   // A  (#2e1f7a)
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
