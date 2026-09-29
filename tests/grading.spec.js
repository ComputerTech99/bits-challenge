// Regression tests for the Stage 1 bug fixes. Test names reference the
// row number in BUG_FIX_LOG.md.
const { test, expect } = require("@playwright/test");
const { openApp, upload, startGrading, stat, download, courseOptions } = require("./helpers");

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

test("#11 timer is not restarted by a second course selection and stops on finalize", async ({ page }) => {
  await pausedClock(page);
  await startGrading(page, "valid_basic.xlsx", "CS F211");
  await page.clock.fastForward(10_000);
  await page.selectOption("#course", "MATH F112");
  await page.clock.fastForward(10_000);
  await expect(page.locator("#timerText")).toHaveText("00:20");

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

test("#12 bars are scaled to the tallest bin and stay inside the canvas", async ({ page }) => {
  await startGrading(page, "large_class.xlsx", "CS F211");
  await page.waitForTimeout(600);
  const rows = await purpleRows(page);
  expect(rows[0]).toBeGreaterThanOrEqual(25); // headroom above the tallest bar
  expect(rows[0]).toBeLessThanOrEqual(35);    // ...but it does fill the chart
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
  await page.fill("#instructor", "   ");
  let downloaded = false;
  page.on("download", () => { downloaded = true; });
  await page.click("#download");
  await expect(page.locator("#exportError")).toContainText("instructor name");
  await page.waitForTimeout(300);
  expect(downloaded).toBe(false);
  await expect(page.locator("#thankyou")).toBeEmpty();

  await page.fill("#instructor", "Dr Rao");
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
  await page.fill("#instructor", "");
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
