// Gera ícones PNG para beast-control.
// Produz icon-48.png e icon-96.png.
// Execute: node scripts/generate-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../extension/icons");
mkdirSync(OUT_DIR, { recursive: true });

// ── PNG primitives ────────────────────────────────────────────────────────────

function u32(n) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return Buffer.concat([u32(d.length), t, d, u32(crc32(Buffer.concat([t, d])))]);
}

function buildPng(w, h, pixels) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = chunk("IHDR", Buffer.concat([u32(w), u32(h), Buffer.from([8,6,0,0,0])]));
  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(0);
    for (let x = 0; x < w; x++) {
      const i = (y*w+x)*4;
      rows.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }
  return Buffer.concat([sig, ihdr, chunk("IDAT", deflateSync(Buffer.from(rows), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function blend(pixels, w, x, y, r, g, b, a) {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= w || yi >= w) return;
  const i = (yi * w + xi) * 4;
  const sa = a / 255, da = pixels[i+3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa < 0.001) return;
  pixels[i]   = Math.round((r*sa + pixels[i]  *da*(1-sa)) / oa);
  pixels[i+1] = Math.round((g*sa + pixels[i+1]*da*(1-sa)) / oa);
  pixels[i+2] = Math.round((b*sa + pixels[i+2]*da*(1-sa)) / oa);
  pixels[i+3] = Math.round(oa * 255);
}

function fillCircle(pixels, w, cx, cy, r, cr, cg, cb, alpha = 1) {
  const r2 = r + 1;
  for (let y = Math.floor(cy - r2); y <= Math.ceil(cy + r2); y++) {
    for (let x = Math.floor(cx - r2); x <= Math.ceil(cx + r2); x++) {
      const d = Math.sqrt((x-cx)**2 + (y-cy)**2);
      const a = Math.max(0, Math.min(1, r - d + 0.6)) * alpha * 255;
      if (a > 0) blend(pixels, w, x, y, cr, cg, cb, a);
    }
  }
}

function fillRoundRect(pixels, w, x0, y0, rw, rh, rr, cr, cg, cb, alpha = 1) {
  for (let y = Math.floor(y0); y <= Math.ceil(y0+rh); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x0+rw); x++) {
      const nx = Math.max(x0+rr, Math.min(x0+rw-rr, x));
      const ny = Math.max(y0+rr, Math.min(y0+rh-rr, y));
      const d  = Math.sqrt((x-nx)**2 + (y-ny)**2);
      const a  = Math.max(0, Math.min(1, rr - d + 0.6)) * alpha * 255;
      if (a > 0) blend(pixels, w, x, y, cr, cg, cb, a);
    }
  }
}

function drawRing(pixels, w, cx, cy, innerR, outerR, r, g, b) {
  const r2 = outerR + 1;
  for (let y = Math.floor(cy-r2); y <= Math.ceil(cy+r2); y++) {
    for (let x = Math.floor(cx-r2); x <= Math.ceil(cx+r2); x++) {
      const d = Math.sqrt((x-cx)**2 + (y-cy)**2);
      const outerA = Math.max(0, Math.min(1, outerR - d + 0.5));
      const innerA = Math.max(0, Math.min(1, d - innerR + 0.5));
      const a = outerA * innerA * 255;
      if (a > 0) blend(pixels, w, x, y, r, g, b, a);
    }
  }
}

// ── Icon ──────────────────────────────────────────────────────────────────────
//
// Layout (normalised to size=96):
//
//   ●  ●  ●  ●    ← 4 toe pads (small circles, arc arrangement)
//     ╭──────╮
//     │      │    ← main pad (rounded rect, slightly wider than tall)
//     ╰──────╯
//
// Colour: green (#34d058) on dark rounded-square background (#111114)

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const [rr, rg, rb] = [52, 208, 88]; // #34d058 green

  // ── Background: dark rounded square ──────────────────────────────────────
  const bg = 0.08 * size;
  fillRoundRect(pixels, size, bg, bg, size-2*bg, size-2*bg, size*0.18, 17, 17, 20, 255);

  // ── Outer ring ────────────────────────────────────────────────────────────
  drawRing(pixels, size, cx, cy, size * 0.32, size * 0.44, rr, rg, rb);

  // ── Letter C — three rounded bars ────────────────────────────────────────
  const u = size / 16;
  const lw = u * 1.6, rnd = u * 0.7;
  const lx = cx - 2.6*u, ty = cy - 2.8*u, bh = u * 1.4, bw = u * 3.8;
  const [lr, lg, lb] = [230, 230, 235];
  fillRoundRect(pixels, size, lx, ty,          bw, bh, rnd, lr, lg, lb); // top
  fillRoundRect(pixels, size, lx, cy + 1.5*u,  bw, bh, rnd, lr, lg, lb); // bottom
  fillRoundRect(pixels, size, lx - lw*0.1, ty, lw, cy + 1.5*u + bh - ty, rnd, lr, lg, lb); // left

  // ── Status dot ────────────────────────────────────────────────────────────
  const dotCx = cx + size*0.27, dotCy = cy + size*0.27, dotR = size * 0.12;
  fillCircle(pixels, size, dotCx, dotCy, dotR + size*0.025, 17, 17, 20);
  fillCircle(pixels, size, dotCx, dotCy, dotR, rr, rg, rb);

  return pixels;
}

// ── Generate ──────────────────────────────────────────────────────────────────

for (const size of [48, 96]) {
  const pixels = drawIcon(size);
  const path = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(path, buildPng(size, size, pixels));
  console.log(`✓ icon-${size}.png`);
}
console.log("Ícones gerados em extension/icons/");
