// Regression tests for the Stage 1 bug fixes. Test names reference the
// row number in BUG_FIX_LOG.md.
const { test, expect } = require("@playwright/test");
const { openApp, upload, startGrading, stat, download, courseOptions, gradeCounts, setInstructor } = require("./helpers");

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
  const blank = await page.evaluate(() => {
    const px = document.getElementById("hist").getContext("2d").getImageData(0, 0, 380, 240).data;
    return px.every(v => v === 0);
  });
  expect(blank).toBe(true);
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

test("#8 bands must cover 0–100: A max below 100 is rejected", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#Amax", "95");
  await expect(page.locator("#rangeError")).toContainText("A must end at 100");
  await expect(page.locator("#download")).toBeDisabled();
});

test("#8 bands must cover 0–100: E min above 0 is rejected", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#Emin", "5");
  await expect(page.locator("#rangeError")).toContainText("E must start at 0");
  await expect(page.locator("#download")).toBeDisabled();
});

test("#9 a single-mark band (A = 100–100) is valid", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#Amin", "100"); // cascades A- max to 99
  await expect(page.locator("#rangeError")).toBeEmpty();
  await expect(page.locator("#download")).toBeEnabled();
  const { text } = await download(page);
  expect(text).toContain("2023A7PS0006P,100,A\n");
  expect(text).toContain("2023A7PS0005P,80,A-\n");
});

test("#10 changing a Max moves the next-higher grade's Min", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#Bmax", "72");
  await expect(page.locator("#A-min")).toHaveValue("73");
  await expect(page.locator("#rangeError")).toBeEmpty();
  await expect(page.locator("#download")).toBeEnabled();
});

test("#10 changing a Min still moves the next-lower grade's Max", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#Bmin", "55");
  await expect(page.locator("#B-max")).toHaveValue("54");
  await expect(page.locator("#rangeError")).toBeEmpty();
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

// Colour of any pixel on the histogram canvas matching the bar colour #5b3cc4.
async function purpleRows(page) {
  return page.evaluate(() => {
    const d = document.getElementById("hist").getContext("2d").getImageData(0, 0, 380, 240).data;
    const rows = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 0x5b && d[i + 1] === 0x3c && d[i + 2] === 0xc4) rows.add(Math.floor(i / 4 / 380));
    }
    return [...rows].sort((a, b) => a - b);
  });
}

// Calls drawBellCurve with a stub context and returns the [x, y] points drawn.
async function curvePoints(page, marks, pxPerStudent = 1) {
  return page.evaluate(([marks, pxPerStudent]) => {
    const pts = [];
    const ctx = { beginPath() {}, stroke() {}, moveTo: (x, y) => pts.push([x, y]), lineTo: (x, y) => pts.push([x, y]) };
    drawBellCurve(ctx, marks, 1, pxPerStudent);
    return pts;
  }, [marks, pxPerStudent]);
}

test("#12 bars are scaled to fit the chart and stay inside the canvas", async ({ page }) => {
  await startGrading(page, "large_class.xlsx", "CS F211");
  await page.waitForTimeout(600);
  // Since #26 the shared scale is 180px per max(tallest bin, curve peak).
  const marks = XLSX.utils.sheet_to_json(XLSX.readFile(fixture("large_class.xlsx")).Sheets.Marks).map(r => r["Total Marks"]);
  const n = marks.length, mean = marks.reduce((a, b) => a + b) / n;
  const std = Math.sqrt(marks.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const bins = Array(10).fill(0);
  marks.forEach(m => bins[Math.min(9, Math.floor(m / 10))]++);
  const tallest = Math.max(...bins);
  const expectedTop = 210 - tallest * 180 / Math.max(tallest, n * 10 / (std * Math.sqrt(2 * Math.PI)));
  const rows = await purpleRows(page);
  expect(rows[0]).toBeGreaterThanOrEqual(25); // headroom above the tallest bar
  expect(Math.abs(rows[0] - expectedTop)).toBeLessThanOrEqual(2);
});

test("#12 bin labels are 0–9 … 90–100", async ({ page }) => {
  await page.addInitScript(() => {
    window.__labels = [];
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) {
      window.__labels.push(String(t));
      return orig.call(this, t, ...rest);
    };
  });
  await page.goto("/");
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.waitForTimeout(600);
  const labels = await page.evaluate(() => window.__labels.slice(-10));
  expect(labels).toEqual(["0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60–69", "70–79", "80–89", "90–100"]);
});

test("#12 bell curve is aligned to bar centres", async ({ page }) => {
  const pts = await curvePoints(page, [...Array(50).fill(45), ...Array(50).fill(65)]);
  // bar i spans x = 30+i*32 .. +24, so bin 0 (marks 0–9) is centred at 42 and bin 9 at 330
  expect(pts[5][0]).toBeCloseTo(42, 0);
  expect(pts[95][0]).toBeCloseTo(330, 0);
});

test("#12 bell curve is drawn as expected student counts (n × 10 × pdf)", async ({ page }) => {
  // 100 students, mean 55, std 10: expected count per 10-mark bin at the mean = 100*10*pdf(55)
  const pts = await curvePoints(page, [...Array(50).fill(45), ...Array(50).fill(65)], 1);
  const expected = 100 * 10 * (1 / (10 * Math.sqrt(2 * Math.PI)));
  expect(210 - pts[55][1]).toBeCloseTo(expected, 1);
});

test("#12 no curve (and no NaN) when every mark is identical", async ({ page }) => {
  const pts = await curvePoints(page, Array(12).fill(65));
  expect(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  expect(pts).toEqual([]);
});

test("#12 an in-flight animation does not repaint after a re-upload", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await upload(page, "valid_second.xlsx"); // well inside the 400ms animation
  await expect(page.locator("#course option")).toHaveCount(3);
  await page.waitForTimeout(600);
  expect(await purpleRows(page)).toEqual([]);
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

test("#16 lift and pulse classes stay on for the 250ms transition", async ({ page }) => {
  await pausedClock(page);
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#Amin", "90"); // moves students from A to A-
  await page.clock.runFor(100);
  await expect(page.locator(".grade.lift")).toHaveCount(1);
  await expect(page.locator(".grade-summary span.pulse")).not.toHaveCount(0);
  await page.clock.runFor(200);
  await expect(page.locator(".grade.lift")).toHaveCount(0);
  await expect(page.locator(".grade-summary span.pulse")).toHaveCount(0);
});

test("#17 switching course does not pulse the summary chips", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.waitForTimeout(500);
  await page.selectOption("#course", "MATH F112");
  // Read once, immediately: a retrying assertion would just wait out the 250ms pulse.
  const classes = await page.locator(".grade-summary span").evaluateAll(s => s.map(x => x.className));
  expect(classes).toHaveLength(8);
  expect(classes.filter(c => c.includes("pulse"))).toEqual([]);
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

test("#19 Reset Range asks for confirmation once", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#Amin", "90");
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await page.click("#resetRanges");
  await expect(page.locator("#Amin")).toHaveValue("80");
  await expect(page.locator("#A-max")).toHaveValue("79");
  expect(dialogs).toHaveLength(1);
});

test("#19 dismissing the confirmation leaves the ranges alone", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.selectOption("#Amin", "90");
  page.on("dialog", d => d.dismiss());
  await page.click("#resetRanges");
  await expect(page.locator("#Amin")).toHaveValue("90");
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

test("#22 Reset Range before a course is open does nothing and does not throw", async ({ page }) => {
  const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await page.click("#resetRanges");            // fresh page
  await upload(page, "valid_basic.xlsx");      // courses loaded, none selected
  await expect(page.locator("#course option")).toHaveCount(3);
  await page.click("#resetRanges");
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

test("#23 the no-instructor alert does not leave the previous course on screen", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await setInstructor(page, "");
  page.on("dialog", d => d.accept());
  await page.selectOption("#course", "MATH F112");
  await expect(page.locator("#course")).toHaveValue("");
  await expect(page.locator("#download")).toBeDisabled();
  await expect(page.locator("#grades")).toBeEmpty();
  await expect(stat(page, "Max")).toHaveText("—");
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

test("happy path: upload, select course, adjust a range, export the right grades", async ({ page }) => {
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  // Stage 2: the name is shown as typed, not upper-cased.
  await expect(page.locator("#welcome")).toHaveText("Welcome, Dr Rao. Review the cutoffs, then finalize the grades.");
  await expect(page.locator("#grades .grade")).toHaveCount(8);
  await expect(page.locator("#download")).toBeEnabled();

  // Raise the A cut-off to 85; A- max should follow to 84.
  await page.selectOption("#Amin", "85");
  await expect(page.locator("#A-max")).toHaveValue("84");
  await expect(page.locator("#rangeError")).toBeEmpty();

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
  await expect(page.locator("#gradeSummary")).toHaveText(bands.map(([g]) => `${g}: ${counts[g]}`).join(""));

  const { filename, text } = await download(page);
  expect(filename).toMatch(/^grades_CS_F211_\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = text.split("\n");
  expect(lines.slice(0, 4)).toEqual(["Instructor,Dr Rao", "Course,CS F211", "", "BITS ID,Total Marks,Grade"]);
  expect(lines.slice(4, -1)).toEqual(expectedLines); // every student exactly once, in file order
  expect(lines.at(-1)).toBe("");
  await expect(page.locator("#thankyou")).toContainText("in your first attempt");
});

// Records the y of every point drawn on a path (only the bell curve uses paths).
async function recordCurveYs(page) {
  await page.addInitScript(() => {
    window.__curveYs = [];
    for (const m of ["moveTo", "lineTo"]) {
      const orig = CanvasRenderingContext2D.prototype[m];
      CanvasRenderingContext2D.prototype[m] = function (x, y) { window.__curveYs.push(y); return orig.call(this, x, y); };
    }
  });
  await page.goto("/");
}

for (const course of ["CS F211", "MATH F112"]) {
  test(`#26 bell curve stays inside the canvas for clustered marks (${course})`, async ({ page }) => {
    await recordCurveYs(page);
    await startGrading(page, "clustered_marks.xlsx", course);
    await page.waitForTimeout(600);
    const ys = await page.evaluate(() => window.__curveYs);
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
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
