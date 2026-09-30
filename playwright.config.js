// @ts-check
const { defineConfig } = require("@playwright/test");

// LIVE=1 runs against the deployed GitHub Pages site instead of a local server.
const LIVE_URL = "https://computertech99.github.io/bits-challenge/";
const live = !!process.env.LIVE;

module.exports = defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: live ? LIVE_URL : "http://localhost:4173",
  },
  // The full suite runs in all three engines (#50).
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  webServer: live ? undefined : {
    command: "npx serve . -l 4173 --no-clipboard",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
