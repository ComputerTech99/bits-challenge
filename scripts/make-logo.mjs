// Trims the whitespace around assets/logo.png and scales it to 96px tall (2x its
// 48px display height), writing assets/logo-96.webp. index.html inlines the
// WebP as a data URI so the app stays a single self-contained file.
// Usage: node scripts/make-logo.mjs

import { chromium } from "@playwright/test";
import fs from "fs";
const src = "data:image/png;base64," + fs.readFileSync("assets/logo.png").toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(async src => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const pad = 4, bx = Math.max(0, x0 - pad), by = Math.max(0, y0 - pad);
  const bw = Math.min(c.width, x1 + pad + 1) - bx, bh = Math.min(c.height, y1 + pad + 1) - by;
  const H = 96, W = Math.round(bw * H / bh); // 2x a 48px display height
  const o = document.createElement("canvas"); o.width = W; o.height = H;
  const octx = o.getContext("2d"); octx.imageSmoothingQuality = "high";
  octx.drawImage(c, bx, by, bw, bh, 0, 0, W, H);
  return { bbox: [bx, by, bw, bh], size: [W, H], png: o.toDataURL("image/png"), webp: o.toDataURL("image/webp", 0.9) };
}, src);
await browser.close();
fs.writeFileSync("assets/logo-96.webp", Buffer.from(out.webp.split(",")[1], "base64"));
console.log("bbox", out.bbox, "out", out.size, "png b64", out.png.length, "webp b64", out.webp.length);
