const path = require("path");
const fs = require("fs");

const FIXTURES = path.join(__dirname, "..", "fixtures");
const SHEETJS = path.join(__dirname, "..", "node_modules", "xlsx", "dist", "xlsx.full.min.js");

// Serve SheetJS from node_modules (same 0.18.5 build as the CDN) so the
// tests are deterministic and work offline.
async function openApp(page, { realFonts = false } = {}) {
  await page.route("**/npm/xlsx*/dist/xlsx.full.min.js", route =>
    route.fulfill({ contentType: "application/javascript", body: fs.readFileSync(SHEETJS) })
  );
  // No network for fonts: the app must look right with its system-font fallback.
  if (!realFonts) {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route =>
      route.fulfill({ contentType: "text/css", body: "" })
    );
  }
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

// Open the review dialog and click "Download grades (CSV)" (Stage 2, E4).
async function finalize(page) {
  await page.click("#reviewBtn");
  await page.locator("#reviewDialog[open]").waitFor();
  await page.click("#download");
}

// Download through the review dialog and return { filename, text, bytes }.
// `text` has the UTF-8 BOM (added in #30) removed so tests can compare CSV
// content directly; `bytes` is the raw file for checking the BOM itself.
async function download(page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), finalize(page)]);
  const bytes = fs.readFileSync(await dl.path());
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  return { filename: dl.suggestedFilename(), text, bytes };
}

async function courseOptions(page) {
  return page.locator("#course option").evaluateAll(opts => opts.map(o => o.value));
}

// Type an instructor name. Once a course is open the setup collapses, so
// open it with "Edit" first (the name field is hidden until then).
async function setInstructor(page, name) {
  if (!(await page.locator("#instructor").isVisible())) await page.click("#editSetup");
  await page.fill("#instructor", name);
}

// Type a cutoff ("A-", 75) and leave the field, as a user would to commit it.
function cutoffInput(page, grade) {
  return page.locator(`#cut-${grade.replace("-", "m")}`);
}
async function typeCutoff(page, grade, value) {
  await cutoffInput(page, grade).fill(String(value));
  await cutoffInput(page, grade).press("Tab");
}
function rangeText(page, grade) {
  return page.locator(`#range-${grade.replace("-", "m")}`);
}

// Per-grade student counts as shown in the grade distribution, e.g. { A: 8, "A-": 17, ... }.
async function gradeCounts(page) {
  return page.locator("#gradeSummary tr").evaluateAll(rows =>
    Object.fromEntries(rows.map(r => [r.dataset.grade, Number(r.querySelector("td b").textContent)])));
}

module.exports = { openApp, fixture, upload, startGrading, stat, download, courseOptions, gradeCounts, setInstructor, cutoffInput, typeCutoff, rangeText, finalize };
