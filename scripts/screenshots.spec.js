// One full-page screenshot per (state, width). States that don't exist in the
// app yet are skipped via the `ready` check.
const path = require("path");
const { test } = require("@playwright/test");
const { openApp, startGrading } = require("../tests/helpers");

const OUT = process.env.SHOTS_OUT || "docs/screenshots/after";
const WIDTHS = (process.env.SHOTS_WIDTHS || "1440,1024,390").split(",").map(Number);
const DEMO = "demo_marks.xlsx", COURSE = "Introduction to Programming";

const STATES = {
  empty: async () => {},
  loaded: async page => { await startGrading(page, DEMO, COURSE); await page.waitForTimeout(700); },
};
const ONLY = process.env.SHOTS_STATES ? process.env.SHOTS_STATES.split(",") : Object.keys(STATES);

for (const width of WIDTHS) {
  for (const name of ONLY) {
    test(`${name} @ ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openApp(page);
      await STATES[name](page);
      await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
    });
  }
}
