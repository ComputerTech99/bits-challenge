// Regression tests for the Stage 1 bug fixes. Test names reference the
// row number in BUG_FIX_LOG.md.
const { test, expect } = require("@playwright/test");
const { openApp, upload, startGrading, stat, download, courseOptions } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

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
