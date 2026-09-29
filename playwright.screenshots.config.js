// Captures documentation screenshots; separate from the test suite.
// Usage: SHOTS_OUT=docs/screenshots/after SHOTS_WIDTHS=1440,1024,390 npx playwright test -c playwright.screenshots.config.js
const { defineConfig } = require("@playwright/test");
const base = require("./playwright.config.js");

module.exports = defineConfig({ ...base, testDir: "scripts", testMatch: "screenshots.spec.js" });
