const path = require("path");
const fs = require("fs");

const FIXTURES = path.join(__dirname, "..", "fixtures");
const SHEETJS = path.join(__dirname, "..", "node_modules", "xlsx", "dist", "xlsx.full.min.js");

// Serve SheetJS from node_modules (same 0.18.5 build as the CDN) so the
// tests are deterministic and work offline.
async function openApp(page) {
  await page.route("**/npm/xlsx*/dist/xlsx.full.min.js", route =>
    route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(SHEETJS) })
  );
  await page.goto("/");
}

function fixture(name) {
  return path.join(FIXTURES, name);
}

async function upload(page, name) {
  await page.locator("#file").setInputFiles(fixture(name));
}

// Upload a fixture, enter an instructor and pick a course.
async function startGrading(page, name, course, instructor = "Dr Rao") {
  await page.fill("#instructor", instructor);
  await upload(page, name);
  await page.waitForFunction(c => [...document.querySelectorAll("#course option")].some(o => o.value === c), course);
  await page.selectOption("#course", course);
}

function stat(page, label) {
  return page.locator(".stat", { hasText: label }).locator("b");
}

// Click "Finalize & Download" and return { filename, text }.
async function download(page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  const text = fs.readFileSync(await dl.path(), "utf8");
  return { filename: dl.suggestedFilename(), text };
}

async function courseOptions(page) {
  return page.locator("#course option").evaluateAll(opts => opts.map(o => o.value));
}

module.exports = { openApp, fixture, upload, startGrading, stat, download, courseOptions };
