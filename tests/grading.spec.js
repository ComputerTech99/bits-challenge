// Regression tests for the Stage 1 bug fixes. Test names reference the
// row number in BUG_FIX_LOG.md.
const { test, expect } = require("@playwright/test");
const { openApp, upload, startGrading, stat, download, courseOptions } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await openApp(page);
});
