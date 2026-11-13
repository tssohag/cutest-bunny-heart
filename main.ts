// A tiny bunny hugging a heart, drawn from scratch with signed-distance shapes.
// Node 22, standard library only, no network, fully deterministic: it writes one 1024x1024 PNG to /output/entry.png
// (MAKEFUN_OUTPUT_DIR stands in for /output when running locally).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const px = new Float32Array(W * H * 3);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const lerpC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// Paint a shape: sdf(x, y) is a signed distance in pixels (negative inside), colour(x, y) the fill.
function paint(sdf, box, colour, alpha = 1, grow = 0) {
  const x0 = Math.max(0, Math.floor(box[0] - grow - 2)), x1 = Math.min(W - 1, Math.ceil(box[2] + grow + 2));
  const y0 = Math.max(0, Math.floor(box[1] - grow - 2)), y1 = Math.min(H - 1, Math.ceil(box[3] + grow + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = sdf(x + 0.5, y + 0.5) - grow;
      const cov = clamp(0.5 - d) * alpha;
      if (cov <= 0) continue;
      const c = typeof colour === 'function' ? colour(x + 0.5, y + 0.5) : colour;
      const i = (y * W + x) * 3;
      px[i] = mix(px[i], c[0], cov);
      px[i + 1] = mix(px[i + 1], c[1], cov);
      px[i + 2] = mix(px[i + 2], c[2], cov);
    }
  }
}

// Rotated ellipse (a close approximation of its distance field).
function ellipse(cx, cy, rx, ry, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const r = Math.max(rx, ry);
  const sdf = (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    // first-order distance: (k - 1) divided by the gradient length of k
    const k = Math.hypot(u, v) + 1e-9;
    const gx = (u / rx) * c - (v / ry) * s, gy = (u / rx) * s + (v / ry) * c;
    return (k - 1) * k / (Math.hypot(gx, gy) + 1e-9);
  };
  return { sdf, box: [cx - r, cy - r, cx + r, cy + r] };
}

function shape(e, colour, opts = {}) {
  const { outline, ow = 6, alpha = 1 } = opts;
  if (outline) paint(e.sdf, e.box, outline, alpha, ow);
  paint(e.sdf, e.box, colour, alpha);
}

// A heart (implicit curve, divided by its gradient to approximate a distance).
function heart(cx, cy, size) {
  // exact distance to a heart whose tip is at (0, 0) and top near y = 1 (y up)
  const d2 = (a, b) => a * a + b * b;
  const sdf = (x, y) => {
    const u = Math.abs((x - cx) / size), v = (cy - y) / size + 0.5;
    if (v + u > 1) return (Math.sqrt(d2(u - 0.25, v - 0.75)) - Math.SQRT2 / 4) * size;
    const m = 0.5 * Math.max(u + v, 0);
    const d = Math.sqrt(Math.min(d2(u, v - 1), d2(u - m, v - m)));
    return d * (u - v >= 0 ? 1 : -1) * size;
  };
  return { sdf, box: [cx - size * 0.75, cy - size * 0.75, cx + size * 0.75, cy + size * 0.7] };
}

// A four-point sparkle: two thin crossed ellipses plus a soft glow.
function sparkle(cx, cy, r, colour, alpha = 1) {
  shape(ellipse(cx, cy, r * 1.8, r * 1.8), colour, { alpha: alpha * 0.18 });
  shape(ellipse(cx, cy, r, r * 0.2), colour, { alpha });
  shape(ellipse(cx, cy, r * 0.2, r), colour, { alpha });
  shape(ellipse(cx, cy, r * 0.5, r * 0.5), [255, 255, 255], { alpha });
}

// A ring segment (for the smile): circle of radius r, kept where keep(x, y) is true.
function arc(cx, cy, r, thick, keep) {
  const sdf = (x, y) => {
    if (!keep(x - cx, y - cy)) return 99;
    return Math.abs(Math.hypot(x - cx, y - cy) - r) - thick / 2;
  };
  return { sdf, box: [cx - r - thick, cy - r - thick, cx + r + thick, cy + r + thick] };
}

// ---- background: soft pastel gradient with a glow, dots and hearts ----
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    const base = lerpC(hex('#FFD9E8'), hex('#FFF1CF'), t);
    const g = clamp(1 - Math.hypot(x - 512, y - 540) / 640);
    const c = lerpC(base, [255, 252, 246], g * g * 0.85);
    const i = (y * W + x) * 3;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
  }
}

let seed = 20261113;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const confetti = ['#FFB3CF', '#FFE08A', '#BFE6FF', '#D9C4FF', '#C8F2D2'];
for (let n = 0; n < 46; n++) {
  const x = rnd() * W, y = rnd() * H, r = 7 + rnd() * 15;
  if (Math.hypot(x - 512, y - 560) < 400) continue; // keep the middle clear for the bunny
  const col = hex(confetti[Math.floor(rnd() * confetti.length)]);
  if (n % 3 === 0) shape(heart(x, y, r * 1.3), col, { alpha: 0.75 });
  else shape(ellipse(x, y, r, r), col, { alpha: 0.7 });
}

// ---- the bunny ----
const fur = (x, y) => lerpC(hex('#FFFFFF'), hex('#FFE9F0'), clamp((y - 280) / 700) * 0.9 + clamp((x - 400) / 700) * 0.15);
const furSoft = hex('#FFF7FA');
const lineC = hex('#F3B6CA');
const pinkIn = hex('#FFA9C6');

// ground shadow
shape(ellipse(512, 930, 330, 44), hex('#F2A9C0'), { alpha: 0.35 });

// ears (the right one flops a little: a touch of personality)
for (const [cx, cy, rot, ry] of [[385, 235, -0.2, 215], [645, 255, 0.34, 200]]) {
  shape(ellipse(cx, cy, 92, ry, rot), fur, { outline: lineC, ow: 5 });
  shape(ellipse(cx + Math.sin(rot) * -6, cy + 22, 50, ry * 0.72, rot), (x, y) => lerpC(pinkIn, hex('#FFD3E2'), clamp((y - 100) / 340)));
}

// body, feet
shape(ellipse(512, 800, 255, 190), fur, { outline: lineC, ow: 5 });
shape(ellipse(372, 925, 98, 50), fur, { outline: lineC, ow: 5 });
shape(ellipse(652, 925, 98, 50), fur, { outline: lineC, ow: 5 });
shape(ellipse(362, 930, 40, 26), pinkIn, { alpha: 0.7 });
shape(ellipse(662, 930, 40, 26), pinkIn, { alpha: 0.7 });

// head: big, round, chubby
shape(ellipse(512, 570, 345, 300), fur, { outline: lineC, ow: 5 });
shape(ellipse(430, 440, 180, 110, -0.4), furSoft, { alpha: 0.7 });

// eyes: big, glossy, with two sparkles each
for (const ex of [388, 636]) {
  shape(ellipse(ex, 600, 78, 94), (x, y) => lerpC(hex('#6A4256'), hex('#26121E'), clamp((y - 505) / 190)));
  shape(ellipse(ex, 640, 60, 52), (x, y) => lerpC(hex('#A56A86'), hex('#6A3E57'), clamp((y - 590) / 100)), { alpha: 0.75 });
  shape(ellipse(ex - 26, 566, 30, 34), [255, 255, 255]);
  shape(ellipse(ex + 28, 650, 14, 14), [255, 255, 255], { alpha: 0.95 });
  shape(ellipse(ex + 8, 668, 7, 7), [255, 255, 255], { alpha: 0.8 });
}

// rosy cheeks
for (const bx of [276, 748]) {
  shape(ellipse(bx, 700, 76, 44), hex('#FF8FB1'), { alpha: 0.45 });
  shape(ellipse(bx, 700, 46, 26), hex('#FF8FB1'), { alpha: 0.35 });
}

// nose and tiny "w" smile
shape(ellipse(512, 664, 28, 20), hex('#FF7FA2'));
shape(ellipse(504, 657, 9, 6), [255, 255, 255], { alpha: 0.7 });
const smileC = hex('#B8506E');
for (const sx of [488, 536]) {
  const a = arc(sx, 684, 24, 7, (dx, dy) => dy > 0);
  paint(a.sdf, a.box, smileC);
}
shape(ellipse(512, 696, 14, 9), hex('#FF9DB8'), { alpha: 0.0 });

// a bow on the left ear
const bowC = hex('#FF6F9C');
shape(ellipse(318, 372, 62, 36, -0.45), bowC, { outline: hex('#E04F80'), ow: 4 });
shape(ellipse(404, 410, 62, 36, 0.5), bowC, { outline: hex('#E04F80'), ow: 4 });
shape(ellipse(360, 392, 27, 25), hex('#FF8FB5'), { outline: hex('#E04F80'), ow: 4 });
shape(ellipse(351, 384, 8, 6), [255, 255, 255], { alpha: 0.7 });

// the bunny hugs a big red heart, held by two round paws
shape(heart(512, 842, 190), (x, y) => lerpC(hex('#FF6B8B'), hex('#E0325F'), clamp((y - 760) / 170)), { outline: hex('#C2234E'), ow: 5 });
shape(ellipse(470, 808, 26, 14, -0.6), [255, 255, 255], { alpha: 0.65 });
shape(ellipse(448, 822, 7, 7), [255, 255, 255], { alpha: 0.6 });

// a little flower on the floppy ear, and sparkles around the picture
const petal = hex('#FFF08A');
for (let k = 0; k < 5; k++) {
  const a = (k / 5) * Math.PI * 2 - 0.5;
  shape(ellipse(690 + Math.cos(a) * 26, 322 + Math.sin(a) * 26, 18, 18), petal, { outline: hex('#F2C94C'), ow: 3 });
}
shape(ellipse(690, 322, 14, 14), hex('#FF9F4A'), { outline: hex('#E07F2C'), ow: 3 });
sparkle(150, 470, 34, hex('#FFD166'));
sparkle(880, 520, 28, hex('#FFD166'), 0.95);
sparkle(840, 150, 24, hex('#A9D8FF'), 0.9);
sparkle(160, 780, 22, hex('#D9C4FF'), 0.9);
for (const pxc of [398, 626]) {
  shape(ellipse(pxc, 862, 62, 50), fur, { outline: lineC, ow: 5 });
  shape(ellipse(pxc - 18, 876, 10, 8), pinkIn, { alpha: 0.8 });
  shape(ellipse(pxc + 4, 882, 10, 8), pinkIn, { alpha: 0.8 });
  shape(ellipse(pxc + 24, 874, 9, 7), pinkIn, { alpha: 0.8 });
}

// ---- PNG encoder (8-bit RGB, adaptive row filters) ----
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

const rgb = Buffer.alloc(W * H * 3);
for (let i = 0; i < rgb.length; i++) rgb[i] = Math.round(clamp(px[i], 0, 255));

const stride = W * 3;
const raw = Buffer.alloc((stride + 1) * H);
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
for (let y = 0; y < H; y++) {
  const row = rgb.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? rgb.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
  let best = null, bestSum = Infinity, bestType = 0;
  for (const type of [0, 1, 2, 4]) {
    const f = Buffer.alloc(stride);
    let sum = 0;
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? row[i - 3] : 0, b = prev[i], c = i >= 3 ? prev[i - 3] : 0;
      const pred = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : paeth(a, b, c);
      f[i] = (row[i] - pred) & 255;
      sum += f[i] < 128 ? f[i] : 256 - f[i];
    }
    if (sum < bestSum) { bestSum = sum; best = f; bestType = type; }
  }
  raw[y * (stride + 1)] = bestType;
  best.copy(raw, y * (stride + 1) + 1);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png'), png);
