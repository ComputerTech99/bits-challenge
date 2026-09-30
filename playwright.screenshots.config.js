// Captures documentation screenshots; separate from the test suite.
// Usage: SHOTS_OUT=docs/screenshots/after SHOTS_WIDTHS=1440,1024,390 npx playwright test -c playwright.screenshots.config.js
const { defineConfig } = require("@playwright/test");
const base = require("./playwright.config.js");

// Screenshots come from Chromium only, so they aren't taken three times.
module.exports = defineConfig({ ...base, testDir: "scripts", testMatch: ["screenshots.spec.js", "capture-goldens.spec.js"],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }] });
