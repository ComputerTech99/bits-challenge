// Smoke test against the deployed GitHub Pages site, with the real CDNs.
// Run with: LIVE=1 npx playwright test tests/live-smoke.spec.js
// Skipped otherwise, so the normal suite never touches the network.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { stat, gradeCounts, typeCutoff, download } = require("./helpers");

test.skip(!process.env.LIVE, "set LIVE=1 to run against the live site");

const INTRO = "Introduction to Programming";

// "./" and not "/": the site lives under /bits-challenge/.
async function openLive(page) {
  await page.goto("./");
  await page.waitForFunction(() => window.XLSX);
}

// The sample file, fetched through the in-app link and uploaded back.
async function loadSample(page, testInfo) {
  await page.fill("#instructor", "Dr Rao");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download a sample file" }).click()]);
  expect(dl.suggestedFilename()).toBe("demo_marks.xlsx");
  const file = testInfo.outputPath("demo_marks.xlsx");
  await dl.saveAs(file);
  await page.locator("#file").setInputFiles(file);
  await page.waitForFunction(c => [...document.querySelectorAll("#course option")].some(o => o.value === c), INTRO);
  await page.selectOption("#course", INTRO);
}

test("live: sample file → grade → review → CSV", async ({ page }, testInfo) => {
  await openLive(page);
  await loadSample(page, testInfo);

  // Ground truth for Introduction to Programming at the default cutoffs.
  for (const [label, value] of [["Min", "0"], ["Max", "100"], ["Avg", "60.78"], ["Median", "64"]])
    await expect(stat(page, label)).toHaveText(value);
  expect(await gradeCounts(page)).toEqual({ A: 8, "A-": 17, B: 10, "B-": 13, C: 9, "C-": 4, D: 1, E: 2 });

  await typeCutoff(page, "A", 78);
  const { filename, text, bytes } = await download(page);
  expect(filename).toMatch(/^grades_Introduction_to_Programming_\d{4}-\d{2}-\d{2}\.csv$/);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM

  // The same CSV as the default golden file, except that 78 and 79 are now A.
  const golden = fs.readFileSync(path.join(__dirname, "golden", "intro_default.csv"), "utf8").replace(/^﻿/, "");
  const expected = golden.split(/\r?\n/).map(l => /^\d+,7[89],A-$/.test(l) ? l.replace(/A-$/, "A") : l);
  const lines = text.split(/\r?\n/);
  expect(lines.slice(0, 4)).toEqual(["Instructor,Dr Rao", `Course,${INTRO}`, "", "BITS ID,Total Marks,Grade"]);
  expect(lines).toEqual(expected);
});

// Screenshots of the live site for the README (Chromium only).
for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390]) {
    test(`live screenshot ${width} ${theme}`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== "chromium", "screenshots come from Chromium only");
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await openLive(page);
      await page.evaluate(() => document.fonts.ready);
      await loadSample(page, testInfo);
      await page.waitForTimeout(700); // the bars' first grow
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height: Math.max(900, height) });
      await page.evaluate(() => scrollTo(0, 0));
      const out = path.join(__dirname, "..", "docs", "screenshots", "live");
      fs.mkdirSync(out, { recursive: true });
      await page.screenshot({ path: path.join(out, `loaded-${width}${theme === "dark" ? "-dark" : ""}.png`) });
    });
  }
}
