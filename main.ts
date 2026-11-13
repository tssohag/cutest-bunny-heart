// A sleepy cream kitten with a daisy crown, cuddling a tiny sleeping duckling.
// Drawn from scratch with signed-distance shapes. Node 22, standard library only, no network, fully deterministic:
// it writes one 1024x1024 PNG to /output/entry.png (MAKEFUN_OUTPUT_DIR stands in for /output when running locally).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png.ts';

const W = 1024;
const H = 1024;
const px = new Float32Array(W * H * 3);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const lerpC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// While `tilt` is set, every shape is drawn rotated by tilt.rot about (tilt.cx, tilt.cy): the kitten's head tilt.
let tilt = null;

// Paint a shape: sdf(x, y) is a signed distance in pixels (negative inside), colour(x, y) the fill.
function paint(sdf, box, colour, alpha = 1, grow = 0) {
  let [bx0, by0, bx1, by1] = [box[0] - grow - 2, box[1] - grow - 2, box[2] + grow + 2, box[3] + grow + 2];
  const T = tilt;
  const cs = T ? Math.cos(-T.rot) : 1, sn = T ? Math.sin(-T.rot) : 0;
  if (T) {
    const f = (x, y) => [T.cx + (x - T.cx) * Math.cos(T.rot) - (y - T.cy) * Math.sin(T.rot), T.cy + (x - T.cx) * Math.sin(T.rot) + (y - T.cy) * Math.cos(T.rot)];
    const cs4 = [f(bx0, by0), f(bx1, by0), f(bx0, by1), f(bx1, by1)];
    bx0 = Math.min(...cs4.map((p) => p[0])); bx1 = Math.max(...cs4.map((p) => p[0]));
    by0 = Math.min(...cs4.map((p) => p[1])); by1 = Math.max(...cs4.map((p) => p[1]));
  }
  const x0 = Math.max(0, Math.floor(bx0)), x1 = Math.min(W - 1, Math.ceil(bx1));
  const y0 = Math.max(0, Math.floor(by0)), y1 = Math.min(H - 1, Math.ceil(by1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let sx = x + 0.5, sy = y + 0.5;
      if (T) {
        const dx = sx - T.cx, dy = sy - T.cy;
        sx = T.cx + dx * cs - dy * sn;
        sy = T.cy + dx * sn + dy * cs;
      }
      const d = sdf(sx, sy) - grow;
      const cov = clamp(0.5 - d) * alpha;
      if (cov <= 0) continue;
      const c = typeof colour === 'function' ? colour(sx, sy) : colour;
      const i = (y * W + x) * 3;
      px[i] = mix(px[i], c[0], cov);
      px[i + 1] = mix(px[i + 1], c[1], cov);
      px[i + 2] = mix(px[i + 2], c[2], cov);
    }
  }
}

// Rotated ellipse (first-order distance approximation).
function ellipse(cx, cy, rx, ry, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const r = Math.max(rx, ry);
  const sdf = (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    const k = Math.hypot(u, v) + 1e-9;
    const gx = (u / rx) * c - (v / ry) * s, gy = (u / rx) * s + (v / ry) * c;
    return ((k - 1) * k) / (Math.hypot(gx, gy) + 1e-9);
  };
  return { sdf, box: [cx - r, cy - r, cx + r, cy + r] };
}

function shape(e, colour, opts = {}) {
  const { outline, ow = 6, alpha = 1 } = opts;
  if (outline) paint(e.sdf, e.box, outline, alpha, ow);
  paint(e.sdf, e.box, colour, alpha);
}

// A ring segment (smiles, closed eyes): circle of radius r, kept where keep(dx, dy) is true.
function arc(cx, cy, r, thick, keep) {
  const sdf = (x, y) => {
    if (!keep(x - cx, y - cy)) return 99;
    return Math.abs(Math.hypot(x - cx, y - cy) - r) - thick / 2;
  };
  return { sdf, box: [cx - r - thick, cy - r - thick, cx + r + thick, cy + r + thick] };
}

// A four-point sparkle: two thin crossed ellipses plus a soft glow.
function sparkle(cx, cy, r, colour, alpha = 1) {
  shape(ellipse(cx, cy, r * 1.6, r * 1.6), [255, 255, 255], { alpha: alpha * 0.28 });
  shape(ellipse(cx, cy, r, r * 0.2), colour, { alpha });
  shape(ellipse(cx, cy, r * 0.2, r), colour, { alpha });
  shape(ellipse(cx, cy, r * 0.5, r * 0.5), [255, 255, 255], { alpha });
}

// A daisy: eight white petals around a yellow heart.
function daisy(cx, cy, r) {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    shape(ellipse(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.42, r * 0.42), [255, 255, 255], { outline: hex('#F2C6D4'), ow: 2.5 });
  }
  shape(ellipse(cx, cy, r * 0.42, r * 0.42), hex('#FFD84A'), { outline: hex('#F2A93A'), ow: 2.5 });
}

// ---- background: soft sky-to-blush gradient with a warm glow, dots and hearts ----
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    const base = lerpC(hex('#CFEAFF'), hex('#FFE6F0'), t);
    const g = clamp(1 - Math.hypot(x - 512, y - 540) / 650);
    const c = lerpC(base, [255, 250, 244], g * g * 0.8);
    const i = (y * W + x) * 3;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
  }
}

let seed = 77133;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const confetti = ['#FFC2D9', '#FFE59A', '#FFFFFF', '#D9C9FF', '#C6F0D6'];
for (let n = 0; n < 40; n++) {
  const x = rnd() * W, y = rnd() * H, r = 6 + rnd() * 14;
  if (Math.hypot((x - 512) * 0.8, y - 540) < 440) continue; // keep the middle clear
  shape(ellipse(x, y, r, r), hex(confetti[Math.floor(rnd() * confetti.length)]), { alpha: 0.7 });
}
sparkle(120, 300, 30, hex('#FFD166'));
sparkle(905, 400, 26, hex('#FFFFFF'));
sparkle(860, 140, 22, hex('#FFD166'), 0.9);
sparkle(150, 760, 22, hex('#FFFFFF'), 0.95);
sparkle(900, 820, 28, hex('#FFD166'), 0.9);

// ---- palette ----
const furA = hex('#FFF3E2'), furB = hex('#FFE0BC');
const fur = (x, y) => lerpC(furA, furB, clamp((y - 250) / 620) * 0.8);
const furLine = hex('#EAB98A');
const stripe = hex('#F2B27A');
const pinkIn = hex('#FFB3C6');

// ground shadow
shape(ellipse(512, 955, 340, 40), hex('#E7A8C0'), { alpha: 0.32 });

// ---- kitten body, tail and feet (not tilted) ----
shape(ellipse(815, 830, 46, 150, 0.6), fur, { outline: furLine, ow: 5 }); // tail curling up
shape(ellipse(512, 832, 300, 185), fur, { outline: furLine, ow: 5 });
shape(ellipse(372, 945, 108, 52), fur, { outline: furLine, ow: 5 });
shape(ellipse(652, 945, 108, 52), fur, { outline: furLine, ow: 5 });
for (const fx of [350, 394, 630, 674]) shape(ellipse(fx, 958, 13, 10), pinkIn, { alpha: 0.85 });

// ---- kitten head, tilted a little ----
tilt = { cx: 512, cy: 680, rot: 0.1 };
for (const [ex, rot] of [[338, -0.5], [686, 0.5]]) {
  shape(ellipse(ex, 235, 92, 112, rot), fur, { outline: furLine, ow: 5 });
  shape(ellipse(ex + (ex < 512 ? 8 : -8), 252, 52, 70, rot), (x, y) => lerpC(pinkIn, hex('#FFD9E4'), clamp((y - 190) / 120)));
}
shape(ellipse(512, 470, 335, 275), fur, { outline: furLine, ow: 5 });
shape(ellipse(420, 340, 190, 100, -0.35), [255, 252, 246], { alpha: 0.65 });

// forehead stripes
for (const [sx, sy, rot, ry] of [[512, 322, 0, 36], [458, 334, -0.32, 30], [566, 334, 0.32, 30]]) shape(ellipse(sx, sy, 11, ry, rot), stripe, { alpha: 0.9 });

// muzzle
shape(ellipse(512, 582, 98, 62), [255, 250, 242], { alpha: 0.95 });

// eyes: big, glossy sapphire
for (const ex of [384, 640]) {
  shape(ellipse(ex, 482, 80, 96), (x, y) => lerpC(hex('#1B2F6B'), hex('#0B1233'), clamp((y - 385) / 195)));
  shape(ellipse(ex, 502, 66, 78), (x, y) => lerpC(hex('#5BB4FF'), hex('#2358C9'), clamp((y - 425) / 150)));
  shape(ellipse(ex, 506, 36, 44), hex('#0B1233'));
  shape(ellipse(ex - 26, 450, 31, 34), [255, 255, 255]);
  shape(ellipse(ex + 28, 536, 14, 14), [255, 255, 255], { alpha: 0.95 });
  shape(ellipse(ex + 4, 556, 7, 7), [255, 255, 255], { alpha: 0.75 });
}

// rosy cheeks
for (const bx of [250, 774]) {
  shape(ellipse(bx, 584, 70, 40), hex('#FF9DB5'), { alpha: 0.5 });
  shape(ellipse(bx, 584, 42, 23), hex('#FF9DB5'), { alpha: 0.35 });
}

// nose, little "w" mouth, whiskers
shape(ellipse(512, 548, 28, 20), hex('#FF86A6'));
shape(ellipse(504, 541, 9, 6), [255, 255, 255], { alpha: 0.7 });
for (const sx of [490, 534]) {
  const a = arc(sx, 574, 22, 6.5, (dx, dy) => dy > 0);
  paint(a.sdf, a.box, hex('#B5586F'));
}
for (const [wx, wy, rot] of [[262, 540, 0.12], [256, 590, -0.06], [270, 636, -0.25], [762, 540, -0.12], [768, 590, 0.06], [754, 636, 0.25]]) {
  shape(ellipse(wx, wy, 74, 2.4, rot), hex('#D9AA84'), { alpha: 0.75 });
}

// daisy crown between the ears
for (let k = 0; k < 5; k++) {
  const x = 392 + k * 60;
  daisy(x, 212 + Math.pow((x - 512) / 120, 2) * 14, 30);
}
tilt = null;

// ---- the sleeping duckling, held against the kitten's chest ----
const yellow = (x, y) => lerpC(hex('#FFEC7A'), hex('#FFCF3E'), clamp((y - 640) / 260));
shape(ellipse(512, 836, 168, 128), yellow, { outline: hex('#E9B02F'), ow: 5 });
shape(ellipse(372, 836, 46, 74, 0.35), hex('#FFD54A'), { outline: hex('#E9B02F'), ow: 4 }); // wing
shape(ellipse(652, 836, 46, 74, -0.35), hex('#FFD54A'), { outline: hex('#E9B02F'), ow: 4 }); // wing
shape(ellipse(512, 738, 118, 106), yellow, { outline: hex('#E9B02F'), ow: 5 });
for (const [tx, ty, rot] of [[512, 628, 0], [484, 634, -0.5], [540, 634, 0.5]]) shape(ellipse(tx, ty, 12, 28, rot), hex('#FFE05A'), { outline: hex('#E9B02F'), ow: 3 });
for (const ex of [466, 558]) {
  const a = arc(ex, 735, 17, 7, (dx, dy) => dy > 0);
  paint(a.sdf, a.box, hex('#5A3A2A'));
}
shape(ellipse(512, 770, 30, 18), hex('#FF9A3C'), { outline: hex('#E0772A'), ow: 3 });
shape(ellipse(504, 764, 9, 5), [255, 255, 255], { alpha: 0.55 });
for (const bx of [420, 604]) shape(ellipse(bx, 768, 26, 16), hex('#FF8FA8'), { alpha: 0.6 });

// kitten paws wrapped round the duckling
for (const [pxc, rot] of [[352, 0.3], [672, -0.3]]) {
  shape(ellipse(pxc, 872, 76, 56, rot), fur, { outline: furLine, ow: 5 });
  for (const [dx, dy] of [[-22, 6], [0, 14], [22, 8]]) shape(ellipse(pxc + dx, 884 + dy, 10, 8), pinkIn, { alpha: 0.85 });
}

// ---- output ----
const rgb = Buffer.alloc(W * H * 3);
for (let i = 0; i < rgb.length; i++) rgb[i] = Math.round(clamp(px[i], 0, 255));
writeFileSync(join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png'), encodePng(rgb, W, H));
