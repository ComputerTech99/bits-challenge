// Records the CSVs the Stage 1 app exports for the demo file, so Stage 2 can
// prove its export is byte-identical. It drives Stage 1's Min/Max selects, so
// it only runs against the Stage 1 app:
//   git show stage-1-complete:index.html > stage1.html   (served at /stage1.html)
//   GOLDEN_PAGE=/stage1.html npx playwright test -c playwright.screenshots.config.js scripts/capture-goldens.spec.js
const fs = require("fs");
const path = require("path");
const { test } = require("@playwright/test");
const { openApp, startGrading, download } = require("../tests/helpers");

const PAGE = process.env.GOLDEN_PAGE || "/";
const OUT = path.join(__dirname, "..", "tests", "golden");

const CASES = [
  { file: "intro_default.csv", course: "Introduction to Programming", set: {} },
  { file: "prob_default.csv", course: "Probability & Statistics", set: {} },
  { file: "linalg_default.csv", course: "Linear Algebra", set: {} },
  // A from 78 (A- max follows to 77) and B- from 52 (C max follows to 51).
  { file: "intro_A78_Bminus52.csv", course: "Introduction to Programming", set: { Amin: "78", "B-min": "52" } },
];

for (const c of CASES) {
  test(c.file, async ({ page }) => {
    await openApp(page);
    if (PAGE !== "/") await page.goto(PAGE);
    await startGrading(page, "demo_marks.xlsx", c.course);
    for (const [id, v] of Object.entries(c.set)) await page.selectOption(`[id="${id}"]`, v);
    const { bytes } = await download(page);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, c.file), bytes);
  });
}
