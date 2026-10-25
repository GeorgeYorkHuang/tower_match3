// 《消消防线》技能帧动画生成器（扁平发光风）
// 参数化 SVG 逐帧 -> resvg 渲染 PNG，输出 images/anims/<set>/<variant>/<set>_<variant>_NN.png
// 规格: 见 消消防线-动画与特效规格.md（帧率/帧数/尺寸/变体）
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from 'file:///C:/Users/kindf/.workbuddy/binaries/node/workspace/node_modules/@resvg/resvg-js/index.js';

const OUT = 'F:/workspace/towerdefence/images/anims';
const TAU = Math.PI * 2;

// 确定性伪随机（帧间稳定、可复现）
function hash(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/* ---------- 通用小部件 ---------- */
// 径向渐变圆（加法混合观感核心件）
function glow(cx, cy, r, c1, c2, op = 1) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g)" opacity="${op}" filter="url(#b)"/>`;
}
function defs(c1, c2) {
  return `<defs>
<radialGradient id="g"><stop offset="0" stop-color="${c2}"/><stop offset="0.55" stop-color="${c1}"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
<filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="b2" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.2"/></filter>
</defs>`;
}

/* ---------- anim_explosion：10 帧 256px ---------- */
// t: 0..1  预备(0-0.15) -> 全开(0.2-0.55) -> 衰减(0.6-1)
function explosionFrame(f, n, [main, bright]) {
  const S = 256, C = S / 2, t = f / (n - 1);
  let parts = '';
  // 1) 白闪芯（预备+命中帧最亮）
  const flashOp = t < 0.15 ? lerp(0.5, 1, t / 0.15) : Math.max(0, 1 - (t - 0.15) / 0.35);
  parts += glow(C, C, 46 + t * 30, main, '#ffffff', flashOp);
  // 2) 冲击环（0.15 起扩张，0.85 消失）
  if (t > 0.12) {
    const rt = clamp01((t - 0.12) / 0.6);
    const ringR = lerp(30, 112, rt), ringW = lerp(14, 2, rt), ringOp = (1 - rt) * 0.9;
    parts += `<circle cx="${C}" cy="${C}" r="${ringR}" fill="none" stroke="${bright}" stroke-width="${ringW}" opacity="${ringOp}" filter="url(#b)"/>`;
  }
  // 3) 火球主体（膨胀后衰减 + 上浮）
  const ballR = t < 0.5 ? lerp(24, 86, t / 0.5) : lerp(86, 30, (t - 0.5) / 0.5);
  const rise = t * 18;
  parts += glow(C, C - rise, ballR, main, bright, t < 0.6 ? 0.95 : 0.95 * (1 - (t - 0.6) / 0.4));
  // 4) 火花（8 枚飞散，随 t 外推）
  for (let k = 0; k < 8; k++) {
    const ang = hash(k * 7.3) * TAU, dist = lerp(20, 108, t) * (0.75 + hash(k * 3.1) * 0.5);
    const sp = C + Math.cos(ang) * dist, sy = C + Math.sin(ang) * dist - rise * 0.5;
    const sr = lerp(7, 1.5, t) * (0.7 + hash(k * 9.9) * 0.6);
    parts += glow(sp, sy, sr, bright, '#ffffff', 1 - t * 0.85);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${defs(main, bright)}${parts}</svg>`;
}

/* ---------- anim_fallstrike：8 帧 192px ---------- */
function fallstrikeFrame(f, n, [main, bright]) {
  const S = 192, CX = S / 2, GY = S * 0.78, t = f / (n - 1);
  let parts = '';
  const beamW = t < 0.35 ? lerp(10, 34, t / 0.35) : lerp(34, 4, (t - 0.35) / 0.65);
  const beamOp = t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.5);
  if (beamOp > 0.02) {
    // 光柱：从画面顶贯到命中点
    parts += `<rect x="${CX - beamW / 2}" y="-10" width="${beamW}" height="${GY + 10}" fill="url(#g)" opacity="${0.75 * beamOp}" filter="url(#b)"/>`;
    parts += `<rect x="${CX - beamW * 0.18}" y="-10" width="${beamW * 0.36}" height="${GY + 10}" fill="${bright}" opacity="${0.9 * beamOp}" filter="url(#b2)"/>`;
  }
  // 命中闪（t≈0.35 附近最亮）
  const hitT = Math.max(0, 1 - Math.abs(t - 0.38) / 0.3);
  parts += glow(CX, GY, lerp(26, 58, hitT), main, '#ffffff', hitT);
  // 地面冲击波（命中后扩张的扁椭圆环）
  if (t > 0.35) {
    const rt = clamp01((t - 0.35) / 0.6);
    const rx = lerp(16, 86, rt), ry = rx * 0.32;
    parts += `<ellipse cx="${CX}" cy="${GY}" rx="${rx}" ry="${ry}" fill="none" stroke="${bright}" stroke-width="${lerp(9, 1.5, rt)}" opacity="${(1 - rt) * 0.85}" filter="url(#b)"/>`;
  }
  // 上抛火花
  for (let k = 0; k < 6; k++) {
    if (t < 0.4) continue;
    const rt = clamp01((t - 0.4) / 0.6);
    const dx = (hash(k * 5.7) - 0.5) * 120 * rt, dy = -lerp(6, 44, rt) * (0.6 + hash(k * 2.3) * 0.8);
    parts += glow(CX + dx, GY + dy, lerp(6, 1.5, rt), bright, '#ffffff', 1 - rt);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${defs(main, bright)}${parts}</svg>`;
}

/* ---------- anim_spark：6 帧 96px ---------- */
function sparkFrame(f, n, [main, bright]) {
  const S = 96, C = S / 2, t = f / (n - 1);
  let parts = '';
  // 四芒星（胀-缩 + 旋转 15°）
  const sc = t < 0.4 ? lerp(0.35, 1, t / 0.4) : lerp(1, 0.2, (t - 0.4) / 0.6);
  const rot = t * 15, R = 34 * sc, r = 9 * sc;
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const ang = rot + k * Math.PI / 4 - Math.PI / 2;
    const rad = k % 2 === 0 ? R : r;
    pts.push(`${C + Math.cos(ang) * rad},${C + Math.sin(ang) * rad}`);
  }
  parts += glow(C, C, 30 * sc, main, '#ffffff', 0.9);
  parts += `<polygon points="${pts.join(' ')}" fill="${bright}" opacity="${0.5 + 0.5 * sc}" filter="url(#b2)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${defs(main, bright)}${parts}</svg>`;
}

/* ---------- Debuff 挂身循环：8 帧 96px，环带母题，首尾无缝 ---------- */
function deburnFrame(f, n) { // 灼烧：3 缕火舌 + 余烬
  const S = 96, C = S / 2, t = f / n;
  let parts = '';
  parts += glow(C, C, 40, '#ff6b35', '#ffd08a', 0.35 + 0.1 * Math.sin(t * TAU));
  for (let k = 0; k < 3; k++) {
    const base = -Math.PI / 2 + (k - 1) * 1.05;
    const flick = Math.sin(t * TAU * 2 + k * 2.1);
    const h = 20 + 7 * flick, w = 9 - k * 1.5;
    const bx = C + Math.cos(base) * 30, by = C + Math.sin(base) * 30;
    parts += `<path d="M ${bx - w} ${by} Q ${bx - w * 0.4} ${by - h * 0.6} ${bx + flick * 3} ${by - h} Q ${bx + w * 0.4} ${by - h * 0.6} ${bx + w} ${by} Z" fill="#ff8c42" opacity="0.9" filter="url(#b2)"/>`;
    parts += glow(bx, by - h * 0.4, 8, '#ff6b35', '#fff3b0', 0.8);
  }
  for (let k = 0; k < 3; k++) {
    const at = (t + hash(k * 4.4)) % 1;
    parts += glow(C + Math.cos(hash(k * 8.8) * TAU) * 34, C + 30 - at * 24, 2.5, '#ff6b35', '#ffd08a', 1 - at);
  }
  return svg(S, parts, '#ff6b35', '#ffd08a');
}
function depoisonFrame(f, n) { // 中毒：毒泡上升破裂 + 顶雾
  const S = 96, C = S / 2, t = f / n;
  let parts = glow(C, C, 40, '#7ed957', '#d8ffb0', 0.3 + 0.08 * Math.sin(t * TAU));
  for (let k = 0; k < 4; k++) {
    const at = (t + hash(k * 6.1)) % 1;
    const bx = C + Math.sin((hash(k * 3.7) + at) * TAU) * 28;
    const by = C + 26 - at * 48, br = lerp(6, 2, at);
    parts += `<circle cx="${bx}" cy="${by}" r="${br}" fill="none" stroke="#a8f77f" stroke-width="2" opacity="${(1 - at) * 0.9}" filter="url(#b2)"/>`;
  }
  parts += glow(C, C - 30, 14 + 4 * Math.sin(t * TAU), '#7ed957', '#eaffdc', 0.5);
  return svg(S, parts, '#7ed957', '#eaffdc');
}
function debleedFrame(f, n) { // 流血：血珠下滑 + 脉动
  const S = 96, C = S / 2, t = f / n;
  let parts = glow(C, C, 38, '#ff4d4d', '#ffb3b3', 0.28 + 0.1 * Math.sin(t * TAU));
  for (let k = 0; k < 4; k++) {
    const ang = hash(k * 7.7) * TAU;
    const at = (t + hash(k * 2.9)) % 1;
    const bx = C + Math.cos(ang) * 32, by = C + Math.sin(ang) * 32 + at * 14;
    const br = lerp(4.5, 1.5, at);
    parts += `<circle cx="${bx}" cy="${by}" r="${br}" fill="#ff6b6b" opacity="${(1 - at) * 0.95}" filter="url(#b2)"/>`;
  }
  return svg(S, parts, '#ff4d4d', '#ffc9c9');
}
function defrostFrame(f, n) { // 冰缓/冻结：6 冰晶旋绕明暗
  const S = 96, C = S / 2, t = f / n;
  let parts = glow(C, C, 40, '#5dade2', '#cdefff', 0.3 + 0.08 * Math.sin(t * TAU));
  for (let k = 0; k < 6; k++) {
    const ang = t * TAU + k * TAU / 6;
    const bx = C + Math.cos(ang) * 32, by = C + Math.sin(ang) * 32;
    const tw = 0.55 + 0.45 * Math.sin(t * TAU + k * 1.3);
    const s = 7;
    parts += `<g transform="rotate(${(t * 360 + k * 60) % 360} ${bx} ${by})"><path d="M ${bx} ${by - s} L ${bx} ${by + s} M ${bx - s * 0.87} ${by - s * 0.5} L ${bx + s * 0.87} ${by + s * 0.5} M ${bx + s * 0.87} ${by - s * 0.5} L ${bx - s * 0.87} ${by + s * 0.5}" stroke="#bfe8ff" stroke-width="2.2" opacity="${tw}" filter="url(#b2)" fill="none"/></g>`;
  }
  return svg(S, parts, '#5dade2', '#d6f4ff');
}
function deshockFrame(f, n) { // 麻痹：折线电弧乱闪 + 星芒
  const S = 96, C = S / 2, t = f / n;
  let parts = glow(C, C, 38, '#ffe45c', '#fffbd6', 0.32 + 0.12 * hash(f * 13.7));
  for (let k = 0; k < 3; k++) {
    const a0 = hash(f * 3.3 + k * 9.1) * TAU, a1 = a0 + (hash(k * 4.2) - 0.5) * 1.6;
    let d = `M ${C + Math.cos(a0) * 30} ${C + Math.sin(a0) * 30}`;
    for (let s = 1; s <= 3; s++) {
      const aa = lerp(a0, a1, s / 3), rr = 30 - s * 4;
      d += ` L ${C + Math.cos(aa) * rr + (hash(f * 7.7 + k * 3 + s) - 0.5) * 12} ${C + Math.sin(aa) * rr + (hash(f * 5.1 + k + s) - 0.5) * 12}`;
    }
    parts += `<path d="${d}" stroke="#fff45c" stroke-width="2.4" fill="none" opacity="${0.5 + 0.5 * hash(f * 11.3 + k)}" filter="url(#b2)"/>`;
  }
  const sc = 0.7 + 0.3 * hash(f * 9.9);
  parts += `<polygon points="${star(C, C, 16 * sc, 5 * sc)}" fill="#fffbd6" opacity="${0.4 + 0.4 * hash(f * 6.6)}"/>`;
  return svg(S, parts, '#ffe45c', '#fffbd6');
}
function star(cx, cy, R, r) {
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const ang = k * Math.PI / 4 - Math.PI / 2, rad = k % 2 === 0 ? R : r;
    pts.push(`${cx + Math.cos(ang) * rad},${cy + Math.sin(ang) * rad}`);
  }
  return pts.join(' ');
}
function svg(S, parts, c1, c2) { return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${defs(c1, c2)}${parts}</svg>`; }

/* ---------- 渲染清单 ---------- */
const SETS = [
  { name: 'anim_explosion', n: 10, fps: 12, variants: { orange: ['#ff6b35', '#ffd08a'], blue: ['#5dade2', '#d6f4ff'], green: ['#7ed957', '#eaffdc'] }, draw: explosionFrame },
  { name: 'anim_fallstrike', n: 8, fps: 12, variants: { orange: ['#ff8c42', '#ffe0b3'], blue: ['#7cc4ff', '#eaf7ff'] }, draw: fallstrikeFrame },
  { name: 'anim_spark', n: 6, fps: 15, variants: { gold: ['#ffcf5c', '#fffbd6'] }, draw: sparkFrame },
  { name: 'debuff_burn', n: 8, fps: 8, variants: { base: null }, draw: deburnFrame },
  { name: 'debuff_poison', n: 8, fps: 6, variants: { base: null }, draw: depoisonFrame },
  { name: 'debuff_bleed', n: 8, fps: 8, variants: { base: null }, draw: debleedFrame },
  { name: 'debuff_frost', n: 8, fps: 6, variants: { base: null }, draw: defrostFrame },
  { name: 'debuff_shock', n: 8, fps: 8, variants: { base: null }, draw: deshockFrame },
];

fs.mkdirSync(OUT, { recursive: true });
const manifest = { generatedBy: 'tools/gen_skill_anim.mjs', version: 'v1', sets: [] };
let count = 0;
for (const set of SETS) {
  const setSize = set.name.startsWith('anim_explosion') ? 256 : set.name.startsWith('anim_fallstrike') ? 192 : 96;
  const variants = Object.keys(set.variants);
  for (const variant of variants) {
    const outDir = path.join(OUT, set.name, variant);
    fs.mkdirSync(outDir, { recursive: true });
    for (let f = 0; f < set.n; f++) {
      const svgStr = set.draw(f, set.n, set.variants[variant] || ['#000', '#000']);
      const png = new Resvg(svgStr, { fitTo: { mode: 'width', value: setSize } }).render().asPng();
      fs.writeFileSync(path.join(outDir, `${set.name}_${variant}_${String(f).padStart(2, '0')}.png`), png);
      count++;
    }
  }
  manifest.sets.push({ name: set.name, frames: set.n, fps: set.fps, size: setSize, variants });
  console.log(`${set.name}: ${set.n}f x ${variants.length}v @${setSize}px`);
}
fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(manifest, null, 2));
console.log(`total ${count} frames -> ${OUT}`);
