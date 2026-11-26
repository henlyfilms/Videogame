// Procedurally draws the Marion Mystery app icon (a glowing berry with a
// knife-glint and eyes on a cobalt night sky) and writes PNGs. No assets.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a + (b - a) * t;
function draw(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4; // supersample
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
      // Background: cobalt → night gradient with glow.
      const d0 = Math.hypot(u - 0.5, v - 0.45);
      let cr = mix(47, 7, v), cg = mix(111, 11, v), cb = mix(237, 40, v);
      const glow = Math.max(0, 1 - d0 * 2.2);
      cr += 60 * glow; cg += 90 * glow; cb += 120 * glow;
      const sc = maskable ? 0.78 : 1;
      const bu = (u - 0.5) / sc + 0.5, bv = (v - 0.5) / sc + 0.5;
      // Berry body (slightly heart-shaped ellipse).
      const ex = (bu - 0.5) / 0.3, ey = (bv - 0.56) / (0.32 - Math.max(0, bv - 0.56) * 0.25);
      const inBerry = ex * ex + ey * ey <= 1;
      if (inBerry) {
        const shade = 0.75 + 0.25 * (1 - (bu - 0.35) * 1.2) - Math.max(0, bv - 0.6) * 0.6;
        cr = 232 * shade; cg = 40 * shade; cb = 78 * shade;
        // seeds
        const gx = Math.round(bu * 14), gy = Math.round(bv * 14 + (gx % 2) * 0.5);
        if (Math.hypot(bu * 14 - gx, bv * 14 + (gx % 2) * 0.5 - gy) < 0.16 && bv > 0.42) { cr = 253; cg = 230; cb = 138; }
        // highlight
        if (Math.hypot(bu - 0.39, bv - 0.43) < 0.07) { cr = mix(cr, 255, 0.7); cg = mix(cg, 255, 0.7); cb = mix(cb, 255, 0.7); }
        // eyes
        for (const ex2 of [0.43, 0.58]) {
          const de = Math.hypot(bu - ex2, bv - 0.55);
          if (de < 0.055) { cr = 255; cg = 255; cb = 255; }
          if (Math.hypot(bu - ex2 - 0.012, bv - 0.56) < 0.025) { cr = 17; cg = 24; cb = 39; }
        }
      }
      // Leafy crown.
      for (const [lx, ly, rot] of [[0.42, 0.26, -0.6], [0.5, 0.23, 0], [0.58, 0.26, 0.6]]) {
        const dx = bu - lx, dy = bv - ly, c = Math.cos(rot), s = Math.sin(rot);
        const rx = dx * c + dy * s, ry = -dx * s + dy * c;
        if ((rx / 0.035) ** 2 + (ry / 0.075) ** 2 <= 1) { cr = 34; cg = 197; cb = 94; }
      }
      r += cr; g += cg; b += cb;
    }
    const i = (y * size + x) * 4;
    buf[i] = Math.min(255, r / (S * S)); buf[i + 1] = Math.min(255, g / (S * S)); buf[i + 2] = Math.min(255, b / (S * S)); buf[i + 3] = 255;
  }
  return png(size, size, buf);
}
for (const [name, size, mask] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, false]]) {
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), draw(size, mask));
  console.log('wrote', name);
}
