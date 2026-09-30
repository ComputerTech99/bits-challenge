// Trims the whitespace around assets/logo.png and scales it to 96px tall (2x its
// 48px display height), writing assets/logo-96.webp. index.html inlines the
// WebP as a data URI so the app stays a single self-contained file. It also
// writes assets/favicon-64.png (the seal only), inlined as the favicon, and
// assets/seal-96.png, the same seal at 2x its 40px size in the dark app bar.
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
// Favicon: just the seal (the full lockup is unreadable at 16px), on a
// transparent background so it sits cleanly on light and dark tab bars.
const seal = size => page.evaluate(async ([src, size]) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const W = c.width, H = c.height, id = ctx.getImageData(0, 0, W, H), d = id.data;
  const white = i => d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235;
  // Seal = non-white pixels left of the gap before the "BITS Pilani" wordmark.
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < 480; x++) {
    if (!white((y * W + x) * 4)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  // Flood-fill the outside white from the edges and make it transparent; white
  // details inside the seal are not connected to the edge, so they survive.
  const seen = new Uint8Array(W * H), stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !white(p * 4)) continue;
    seen[p] = 1; d[p * 4 + 3] = 0;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }
  ctx.putImageData(id, 0, 0);
  const side = Math.max(x1 - x0, y1 - y0) + 1;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const o = document.createElement("canvas"); o.width = o.height = size;
  const octx = o.getContext("2d"); octx.imageSmoothingQuality = "high";
  octx.drawImage(c, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  return { box: [x0, y0, x1, y1], png: o.toDataURL("image/png") };
}, [src, size]);
const icon = await seal(64), big = await seal(96);
fs.writeFileSync("assets/favicon-64.png", Buffer.from(icon.png.split(",")[1], "base64"));
fs.writeFileSync("assets/seal-96.png", Buffer.from(big.png.split(",")[1], "base64"));
console.log("seal box", icon.box, "favicon b64", icon.png.length, "seal-96 b64", big.png.length);

await browser.close();
fs.writeFileSync("assets/logo-96.webp", Buffer.from(out.webp.split(",")[1], "base64"));
console.log("bbox", out.bbox, "out", out.size, "png b64", out.png.length, "webp b64", out.webp.length);
