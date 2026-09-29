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
