// Debuff 挂身循环帧 v2 —— 重做版
// 设计要点：①不画中央光团（不遮敌人剪影）②母题全部挂在敌人外缘环带（r≈32-44）
// ③形状大而锐、硬边+轻模糊 ④逐帧哈希闪烁，首尾无缝（t=f/n 完整周期）
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from 'file:///C:/Users/kindf/.workbuddy/binaries/node/workspace/node_modules/@resvg/resvg-js/index.js';

const OUT = 'F:/workspace/towerdefence/images/anims';
const TAU = Math.PI * 2;
const S = 96, C = S / 2;

function hash(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function defs(c1, c2) {
  return `<defs>
<radialGradient id="g"><stop offset="0" stop-color="${c2}"/><stop offset="0.5" stop-color="${c1}"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
<filter id="b1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1"/></filter>
<filter id="b2" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>`;
}
function svgWrap(parts, c1, c2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${defs(c1, c2)}${parts}</svg>`;
}
// 状态环：细弧线标记"被挂状态"，透明度呼吸
function ring(op, color) {
  return `<circle cx="${C}" cy="${C}" r="41" fill="none" stroke="${color}" stroke-width="2.5" opacity="${op}" stroke-dasharray="230 28" stroke-dashoffset="${-hash(1) * 258}" filter="url(#b1)"/>`;
}
function glowDot(x, y, r, c, core, op) {
  return `<circle cx="${x}" cy="${y}" r="${r * 2}" fill="url(#g)" opacity="${op * 0.6}" filter="url(#b2)"/><circle cx="${x}" cy="${y}" r="${r}" fill="${core}" opacity="${op}" filter="url(#b1)"/>`;
}

/* 灼烧：5 缕火舌沿上半弧向上舔 + 余烬上飘 */
function burn(f, n) {
  const t = f / n;
  let p = ring(0.5 + 0.2 * Math.sin(t * TAU), '#ff8c42');
  for (let k = 0; k < 5; k++) {
    const ang = -Math.PI * 0.88 + (k / 4) * Math.PI * 0.76; // -158°..-22°
    const bx = C + Math.cos(ang) * 33, by = C + Math.sin(ang) * 33;
    const h = 15 + 13 * (0.5 + 0.5 * Math.sin(t * TAU * 2 + k * 1.9)) + hash(k * 5.1) * 6;
    const sway = Math.sin(t * TAU + k * 2.6) * 7;
    const w = 5;
    p += `<path d="M ${bx - w} ${by} C ${bx - w} ${by - h * 0.45} ${bx - w * 0.3 + sway * 0.4} ${by - h * 0.6} ${bx + sway} ${by - h} C ${bx + w * 0.3 + sway * 0.4} ${by - h * 0.6} ${bx + w} ${by - h * 0.45} ${bx + w} ${by} Z" fill="#ff6b35" opacity="0.95" filter="url(#b1)"/>`;
    p += `<path d="M ${bx - w * 0.45} ${by} C ${bx - w * 0.45} ${by - h * 0.4} ${bx + sway * 0.7} ${by - h * 0.62} ${bx + sway} ${by - h * 0.78} C ${bx + w * 0.45} ${by - h * 0.4} ${bx + w * 0.45} ${by} Z" fill="#ffd08a" opacity="0.9"/>`;
  }
  for (let k = 0; k < 3; k++) {
    const at = (t + hash(k * 4.4)) % 1;
    const x = C + Math.cos(hash(k * 8.8) * TAU) * 36;
    p += glowDot(x, C + 18 - at * 30, 2.2, '#ff6b35', '#ffe9b3', 1 - at);
  }
  return svgWrap(p, '#ff6b35', '#ffd08a');
}

/* 中毒：两侧毒泡上升+到顶爆裂成环 + 顶部毒雾团 */
function poison(f, n) {
  const t = f / n;
  let p = ring(0.45 + 0.2 * Math.sin(t * TAU), '#7ed957');
  for (let k = 0; k < 4; k++) {
    const at = (t + hash(k * 6.1)) % 1;
    const side = k % 2 === 0 ? -1 : 1;
    const bx = C + side * (26 + Math.sin((hash(k * 3.7) + at * 2) * TAU) * 6);
    const by = C + 24 - at * 46;
    const br = 4 + hash(k * 9.2) * 2.5;
    if (at < 0.82) {
      p += `<circle cx="${bx}" cy="${by}" r="${br}" fill="none" stroke="#a8f77f" stroke-width="2.5" opacity="0.95" filter="url(#b1)"/>`;
      p += glowDot(bx, by, br * 0.7, '#7ed957', '#eaffdc', 0.8);
    } else { // 到顶爆裂：扩张消散的环
      const pt = (at - 0.82) / 0.18;
      p += `<circle cx="${bx}" cy="${by - 4}" r="${br + pt * 10}" fill="none" stroke="#c6ff8f" stroke-width="${3 * (1 - pt)}" opacity="${(1 - pt) * 0.9}" filter="url(#b1)"/>`;
    }
  }
  p += glowDot(C, C - 38, 9 + 3 * Math.sin(t * TAU), '#5da130', '#d8ffb0', 0.75);
  return svgWrap(p, '#7ed957', '#eaffdc');
}

/* 流血：顶部 3 道血珠沿边缘下滑拉长 + 落点小溅 */
function bleed(f, n) {
  const t = f / n;
  let p = ring(0.45 + 0.2 * Math.sin(t * TAU + 2), '#ff4d4d');
  for (let k = 0; k < 3; k++) {
    const ang = -Math.PI / 2 + (k - 1) * 0.85;
    const at = (t + hash(k * 2.9)) % 1;
    const len = 12 + at * 22, r = 4 - at * 2.2;
    const x0 = C + Math.cos(ang) * 36, y0 = C + Math.sin(ang) * 36;
    const x1 = x0 + (hash(k * 7.7) - 0.5) * 8 * at, y1 = y0 + len;
    p += `<path d="M ${x0} ${y0} L ${x1} ${y1}" stroke="#ff4d4d" stroke-width="${r * 2}" stroke-linecap="round" opacity="${0.9 - at * 0.3}" filter="url(#b1)"/>`;
    p += glowDot(x1, y1, r * 0.9, '#ff4d4d', '#ff9d9d', 1 - at * 0.4);
    if (at > 0.85) { // 落点溅开
      const pt = (at - 0.85) / 0.15;
      p += `<circle cx="${x1}" cy="${y1 + 4}" r="${3 + pt * 8}" fill="none" stroke="#ff6b6b" stroke-width="2" opacity="${(1 - pt) * 0.8}"/>`;
    }
  }
  return svgWrap(p, '#ff4d4d', '#ffc9c9');
}

/* 冰缓/冻结：7 枚锐利冰棱沿全环外刺 + 闪烁星芒，缓慢逆旋 */
function frost(f, n) {
  const t = f / n;
  let p = ring(0.5 + 0.2 * Math.sin(t * TAU + 4), '#5dade2');
  for (let k = 0; k < 7; k++) {
    const ang = -t * TAU + k * TAU / 7 + hash(k * 3.3) * 0.3;
    const tw = 0.6 + 0.4 * Math.sin(t * TAU + k * 1.7);
    const x0 = C + Math.cos(ang) * 28, y0 = C + Math.sin(ang) * 28;
    const x1 = C + Math.cos(ang) * (44 + (k % 2) * 6), y1 = C + Math.sin(ang) * (44 + (k % 2) * 6);
    // 冰棱：外尖三角
    const px = -Math.sin(ang), py = Math.cos(ang), w = 4;
    p += `<polygon points="${x0 + px * w},${y0 + py * w} ${x0 - px * w},${y0 - py * w} ${x1},${y1}" fill="#8fd0f5" opacity="${tw}" filter="url(#b1)"/>`;
    p += `<line x1="${x0}" y1="${y0}" x2="${x1 - (x1 - x0) * 0.25}" y2="${y1 - (y1 - y0) * 0.25}" stroke="#eaf7ff" stroke-width="1.6" opacity="${tw}"/>`;
    p += glowDot(x1, y1, 2, '#5dade2', '#ffffff', tw);
  }
  return svgWrap(p, '#5dade2', '#d6f4ff');
}

/* 麻痹：2 道贴边折线电弧（每帧重排）+ 4 星芒闪点 + 断续状态环 */
function shock(f, n) {
  const t = f / n;
  let p = '';
  // 断续环：dash 随帧跳动
  p += `<circle cx="${C}" cy="${C}" r="41" fill="none" stroke="#ffe45c" stroke-width="2.5" opacity="${0.35 + 0.4 * hash(f * 7.1)}" stroke-dasharray="26 14" stroke-dashoffset="${-f * 17}" filter="url(#b1)"/>`;
  for (let k = 0; k < 2; k++) {
    const a0 = hash(f * 13.3 + k * 9.1) * TAU, span = 0.5 + hash(k * 4.2 + f) * 0.45;
    const rBase = 32;
    let d = `M ${C + Math.cos(a0) * rBase} ${C + Math.sin(a0) * rBase}`;
    const segs = 5;
    for (let s = 1; s <= segs; s++) {
      const aa = a0 + span * (s / segs);
      const rr = rBase + (hash(f * 3.7 + k * 5 + s) - 0.5) * 14;
      const jx = (hash(f * 17.7 + k * 5 + s) - 0.5) * 18, jy = (hash(f * 11.1 + k + s) - 0.5) * 18;
      d += ` L ${C + Math.cos(aa) * rr + jx} ${C + Math.sin(aa) * rr + jy}`;
    }
    const op = 0.55 + 0.45 * hash(f * 19.3 + k);
    p += `<path d="${d}" stroke="#fffbd6" stroke-width="1.8" fill="none" opacity="${op}" filter="url(#b1)"/>`;
  }
  for (let k = 0; k < 4; k++) {
    const ang = hash(f * 5.9 + k * 8.2) * TAU, rr = 36 + hash(f + k) * 8;
    const x = C + Math.cos(ang) * rr, y = C + Math.sin(ang) * rr;
    const sc = 0.5 + hash(f * 3.9 + k) * 0.9;
    const pts = [];
    for (let q = 0; q < 8; q++) {
      const aa = q * Math.PI / 4, rad = q % 2 === 0 ? 7 * sc : 2.5 * sc;
      pts.push(`${x + Math.cos(aa) * rad},${y + Math.sin(aa) * rad}`);
    }
    p += `<polygon points="${pts.join(' ')}" fill="#fffbd6" opacity="${0.4 + 0.6 * hash(f * 6.6 + k)}"/>`;
  }
  return svgWrap(p, '#ffe45c', '#fffbd6');
}

/* ---------- 渲染输出（覆盖 v1） ---------- */
const SETS = [
  { name: 'debuff_burn', n: 8, fps: 8, draw: burn },
  { name: 'debuff_poison', n: 8, fps: 6, draw: poison },
  { name: 'debuff_bleed', n: 8, fps: 8, draw: bleed },
  { name: 'debuff_frost', n: 8, fps: 6, draw: frost },
  { name: 'debuff_shock', n: 8, fps: 8, draw: shock },
];
let count = 0;
for (const set of SETS) {
  const outDir = path.join(OUT, set.name, 'base');
  fs.mkdirSync(outDir, { recursive: true });
  for (let f = 0; f < set.n; f++) {
    const png = new Resvg(set.draw(f, set.n), { fitTo: { mode: 'width', value: S } }).render().asPng();
    fs.writeFileSync(path.join(outDir, `${set.name}_base_${String(f).padStart(2, '0')}.png`), png);
    count++;
  }
  console.log(`${set.name} v2: ${set.n} frames`);
}
console.log(`total ${count} frames -> ${OUT}`);
