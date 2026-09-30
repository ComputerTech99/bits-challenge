// Composes docs/screenshots/restraint/{before,after}/<name>.png into one
// side-by-side image per state, width and theme: docs/screenshots/restraint/<name>.png.
// Wide shots are scaled to 960px per side to keep the files reasonable.
// Usage: node scripts/compose-restraint.mjs
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const DIR = "docs/screenshots/restraint";
const uri = f => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const name of fs.readdirSync(path.join(DIR, "before")).filter(f => f.endsWith(".png"))) {
  const after = path.join(DIR, "after", name);
  if (!fs.existsSync(after)) continue;
  const dark = name.includes("-dark");
  const side = name.includes("-390") ? 390 : 960;
  await page.setViewportSize({ width: side * 2 + 72, height: 400 });
  await page.setContent(`<style>
    body{margin:0;padding:24px;display:flex;gap:24px;align-items:flex-start;font:600 16px system-ui,sans-serif;
      background:${dark ? "#121120" : "#f5f4fa"};color:${dark ? "#ecebf5" : "#1c1a33"}}
    figure{margin:0;width:${side}px} figcaption{margin:0 0 8px} img{width:100%;display:block;border:1px solid ${dark ? "#2e2c45" : "#e3e0ef"}}
  </style>
  <figure><figcaption>Before</figcaption><img src="${uri(path.join(DIR, "before", name))}"></figure>
  <figure><figcaption>After (Stage 2C)</figcaption><img src="${uri(after)}"></figure>`);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  await page.screenshot({ path: path.join(DIR, name), fullPage: true });
  console.log(name);
}
await browser.close();
