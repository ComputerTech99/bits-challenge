// One full-page screenshot per (state, width). States that don't exist in the
// app yet are skipped via the `ready` check.
const path = require("path");
const { test } = require("@playwright/test");
const { openApp, startGrading, typeCutoff, download } = require("../tests/helpers");

const OUT = process.env.SHOTS_OUT || "docs/screenshots/after";
const WIDTHS = (process.env.SHOTS_WIDTHS || "1440,1024,390").split(",").map(Number);
const DEMO = "demo_marks.xlsx", COURSE = "Introduction to Programming";

const STATES = {
  empty: async () => {},
  "upload-error": async page => {
    await page.fill("#instructor", "Dr Rao");
    await page.locator("#file").setInputFiles(require("../tests/helpers").fixture("bad_data.xlsx"));
    await page.locator("#uploadError").waitFor();
  },
  loaded: async page => { await startGrading(page, DEMO, COURSE); await page.waitForTimeout(700); },
  borderline: async page => {
    await startGrading(page, DEMO, COURSE);
    await page.selectOption("#borderN", "3");
    await page.waitForTimeout(700);
    await page.locator('.bl-group[data-grade="A"] li').first().hover();
  },
  dialog: async page => {
    await startGrading(page, DEMO, COURSE);
    await typeCutoff(page, "A", 78);
    await page.waitForTimeout(700);
    await page.click("#reviewBtn");
    await page.waitForTimeout(300);
  },
  downloaded: async page => {
    await startGrading(page, DEMO, COURSE);
    await typeCutoff(page, "A", 78);
    await page.waitForTimeout(700);
    await download(page);
  },
  "reset-notice": async page => {
    await startGrading(page, DEMO, COURSE);
    await typeCutoff(page, "A", 78);
    await page.waitForTimeout(700);
    await page.click("#resetAll");
  },
  restored: async page => {
    await startGrading(page, DEMO, COURSE);
    await typeCutoff(page, "A", 78);
    await download(page);
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await startGrading(page, DEMO, COURSE);
    await page.waitForTimeout(700);
  },
  "cutoff-moved": async page => {
    await startGrading(page, DEMO, COURSE);
    await typeCutoff(page, "A", 78);
    await typeCutoff(page, "B-", 52);
    await page.waitForTimeout(700);
  },
};
const ONLY = process.env.SHOTS_STATES ? process.env.SHOTS_STATES.split(",") : Object.keys(STATES);

for (const width of WIDTHS) {
  for (const name of ONLY) {
    test(`${name} @ ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openApp(page, { realFonts: true });
      await page.evaluate(() => document.fonts.ready);
      await STATES[name](page);
      // Grow the viewport to the whole page so sticky elements sit where they
      // really end up, instead of being stitched mid-page by fullPage capture.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height: Math.max(900, height) });
      await page.evaluate(() => scrollTo(0, 0)); // a reload can restore a scrolled position
      await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`) });
    });
  }
}
