// One full-page screenshot per (state, width). States that don't exist in the
// app yet are skipped via the `ready` check.
const path = require("path");
const { test } = require("@playwright/test");
const { openApp, startGrading, typeCutoff, download } = require("../tests/helpers");

const OUT = process.env.SHOTS_OUT || "docs/screenshots/after";
const WIDTHS = (process.env.SHOTS_WIDTHS || "1440,1024,390").split(",").map(Number);
// SHOTS_THEME=dark emulates a dark system theme (E8); files get a "-dark" suffix.
const THEME = process.env.SHOTS_THEME || "light";
const SUFFIX = THEME === "dark" ? "-dark" : "";
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
  "changed-since-download": async page => {
    await startGrading(page, DEMO, COURSE);
    await typeCutoff(page, "A", 78);
    await download(page);
    await typeCutoff(page, "A", 77);
    await page.waitForTimeout(700);
  },
  "dialog-redownload": async page => {
    await startGrading(page, DEMO, COURSE);
    await typeCutoff(page, "A", 78);
    await download(page);
    await typeCutoff(page, "A", 77);
    await page.waitForTimeout(700);
    await page.click("#reviewBtn");
    await page.waitForTimeout(300);
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
  search: async page => {
    await startGrading(page, DEMO, COURSE);
    await page.waitForTimeout(700);
    await page.fill("#findId", "20247");
  },
  "theme-menu": async page => {
    await startGrading(page, DEMO, COURSE);
    await page.waitForTimeout(700);
    await page.focus("#themeBtn");
    await page.keyboard.press("Enter");
  },
  "crowded-labels": async page => {
    await startGrading(page, DEMO, COURSE);
    await typeCutoff(page, "A-", 79);
    await typeCutoff(page, "C", 41);
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
      await page.emulateMedia({ colorScheme: THEME });
      await openApp(page, { realFonts: true });
      await page.evaluate(() => document.fonts.ready);
      await STATES[name](page);
      // Grow the viewport to the whole page so sticky elements sit where they
      // really end up, instead of being stitched mid-page by fullPage capture.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height: Math.max(900, height) });
      await page.evaluate(() => scrollTo(0, 0)); // a reload can restore a scrolled position
      await page.screenshot({ path: path.join(OUT, `${name}-${width}${SUFFIX}.png`) });
    });
  }
}

// The link-preview image (#39): the loaded demo course, light theme, at the
// 1200×630 Open Graph size. Run with SHOTS_OG=1; writes assets/og-image.png.
if (process.env.SHOTS_OG) {
  test("og-image", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.emulateMedia({ colorScheme: "light" });
    await openApp(page, { realFonts: true });
    await page.evaluate(() => document.fonts.ready);
    await startGrading(page, DEMO, COURSE);
    await typeCutoff(page, "A", 78);
    // A preview shows the chart whole: the sticky action bar would cover its x-axis.
    await page.addStyleTag({ content: ".actionbar{display:none}" });
    await page.mouse.move(0, 0);
    await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
    await page.waitForTimeout(700);
    await page.screenshot({ path: "assets/og-image.png" });
  });
}
