// 圣遗物图标生成器 —— 输出 112 个 SVG 图标 + 预览页 + 映射表
// 用法: node tools/gen_relic_icons.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] === 'v2' ? 'F:/workspace/towerdefence/relic_icons_v2' : 'F:/workspace/towerdefence/relic_icons';

// v2 精修：每个分类的深色描边衬底色（轮廓线）
const DARK = {
  fire: '#2a0c03', ice: '#062338', poison: '#102906', electric: '#3a2c05',
  boomerang: '#05231f', cannon: '#14151b', universal: '#382a06'
};

/* ---------------- 通用绘制辅助 ---------------- */
const S = (d, c, w = 6, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;

// 火焰轮廓（尖端朝上）：尖端 (x, y-h)，底部中心 (x, y)
const flameP = (x, y, h) =>
  `M ${x} ${y - h} C ${x + 0.5 * h} ${y - 0.55 * h} ${x + 0.42 * h} ${y - 0.15 * h} ${x + 0.34 * h} ${y}` +
  ` A ${0.34 * h} ${0.34 * h} 0 0 1 ${x - 0.34 * h} ${y}` +
  ` C ${x - 0.42 * h} ${y - 0.15 * h} ${x - 0.5 * h} ${y - 0.55 * h} ${x} ${y - h} Z`;

// 水滴（尖端朝上）：尖端 (x, y-s)，底部 (x, y+s)
const dropP = (x, y, s) =>
  `M ${x} ${y - s} C ${x + 0.85 * s} ${y - 0.1 * s} ${x + 0.75 * s} ${y + 0.7 * s} ${x} ${y + s}` +
  ` C ${x - 0.75 * s} ${y + 0.7 * s} ${x - 0.85 * s} ${y - 0.1 * s} ${x} ${y - s} Z`;

// 闪电（填充多边形）
const bolt = (x, y, s, c) => {
  const p = [[0.25, -1], [-0.35, 0.15], [0.02, 0.15], [-0.25, 1], [0.45, -0.05], [0.08, -0.05]];
  return `<path d="M ${p.map(([a, b]) => `${(x + a * s).toFixed(1)} ${(y + b * s).toFixed(1)}`).join(' L ')} Z" fill="${c}"/>`;
};

// 六向雪花
const snowflake = (cx, cy, r, c, w = 5) => {
  let s = '';
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    s += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy + Math.sin(a) * r).toFixed(1)}"/>`;
  }
  return `<g stroke="${c}" stroke-width="${w}" stroke-linecap="round">${s}<circle cx="${cx}" cy="${cy}" r="${w * 0.7}" fill="${c}" stroke="none"/></g>`;
};

// 星形/爆裂多边形点集
const starPts = (cx, cy, rO, rI, n) => {
  const pts = [];
  for (let i = 0; i < 2 * n; i++) {
    const r = i % 2 ? rI : rO;
    const a = (i * Math.PI) / n - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
};
const starPoly = (cx, cy, rO, rI, n, c, w = 4, fill = 'none') =>
  `<polygon points="${starPts(cx, cy, rO, rI, n)}" fill="${fill}" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`;

// 宝石（五边钻石）
const gem = (cx, cy, s, c, fill = 'none', w = 5) =>
  `<path d="M ${cx} ${cy - s} L ${cx + 0.75 * s} ${cy - 0.3 * s} L ${cx + 0.5 * s} ${cy + 0.8 * s} L ${cx - 0.5 * s} ${cy + 0.8 * s} L ${cx - 0.75 * s} ${cy - 0.3 * s} Z" fill="${fill}" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`;

// 心形（s 为半高尺度）
const heartP = (x, y, s) =>
  `M ${x} ${y + s} C ${x - 1.5 * s} ${y - 0.2 * s} ${x - 1.1 * s} ${y - 1.2 * s} ${x - 0.4 * s} ${y - 1.2 * s}` +
  ` C ${x - 0.05 * s} ${y - 1.2 * s} ${x} ${y - 0.7 * s} ${x} ${y - 0.5 * s}` +
  ` C ${x} ${y - 0.7 * s} ${x + 0.05 * s} ${y - 1.2 * s} ${x + 0.4 * s} ${y - 1.2 * s}` +
  ` C ${x + 1.1 * s} ${y - 1.2 * s} ${x + 1.5 * s} ${y - 0.2 * s} ${x} ${y + s} Z`;

// 云朵（以 translate 定位，局部坐标宽约 66 高约 37，底部 y=8）
const cloud = (c, w = 5) =>
  `<g transform="translate(64,50)"><path d="M -32 8 a 12 12 0 0 1 2 -23 a 16 16 0 0 1 30 -6 a 12 12 0 0 1 17 11 a 9 9 0 0 1 -3 18 Z" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/></g>`;

// 六边形（点顶）
const hex = (cx, cy, r, c, w = 4) => {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`;
};

const rays = (cx, cy, r1, r2, n, c, w = 5, off = 0) => {
  let s = '';
  for (let k = 0; k < n; k++) {
    const a = off + (k * 2 * Math.PI) / n;
    s += `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}"/>`;
  }
  return `<g stroke="${c}" stroke-width="${w}" stroke-linecap="round">${s}</g>`;
};

/* ---------------- 分类配色 ---------------- */
const cats = [
  {
    id: 'fire', label: '火塔', bg1: '#8a2c12', bg2: '#3a0f06', edge: '#d0552b',
    c1: '#ffab6e', c2: '#ffe3cf', c3: '#ff6a33',
    icons: [
      { n: '火种', e: '点燃灼烧伤害 +50%', g: c => S(flameP(64, 98, 66), c.c1) + `<path d="${flameP(64, 96, 32)}" fill="${c.c3}"/>` },
      { n: '赤印', e: '灼烧层数上限 +1', g: c => `<rect x="34" y="34" width="60" height="60" rx="12" fill="none" stroke="${c.c1}" stroke-width="6"/>` + `<path d="${flameP(64, 80, 26)}" fill="${c.c3}"/>` },
      { n: '熔心', e: '火柱伤害 +50%', g: c => S('M64 94 C38 76 34 58 44 50 C52 44 61 48 64 56 C67 48 76 44 84 50 C94 58 90 76 64 94 Z', c.c1) + `<path d="${flameP(64, 58, 20)}" fill="${c.c3}"/>` },
      { n: '爆核', e: '大火球爆炸半径 +30%', g: c => `<circle cx="64" cy="64" r="14" fill="${c.c3}"/>` + rays(64, 64, 22, 34, 8, c.c1, 5) },
      { n: '连锁爆破', e: '爆燃爆炸概率 40%→70%', g: c => S('M38 80 L64 42 L90 80', c.c1, 4) + `<circle cx="38" cy="80" r="10" fill="none" stroke="${c.c1}" stroke-width="5"/><circle cx="90" cy="80" r="10" fill="none" stroke="${c.c1}" stroke-width="5"/><circle cx="64" cy="42" r="11" fill="${c.c3}"/>` + rays(64, 42, 15, 23, 4, c.c1, 4) },
      { n: '焰雨', e: '多重火球数量 +2', g: c => S(flameP(40, 52, 24), c.c1, 4) + S(flameP(88, 52, 24), c.c1, 4) + S(flameP(64, 78, 28), c.c1, 5) + `<path d="${flameP(64, 76, 15)}" fill="${c.c3}"/>` },
      { n: '火墙增烈', e: '烈焰墙持续 +3 秒', g: c => S('M28 94 H100', c.c1) + `<path d="${flameP(44, 92, 26)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/><path d="${flameP(84, 92, 26)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/><path d="${flameP(64, 92, 38)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` },
      { n: '天火', e: '火雨每波伤害 +40%', g: c => `<circle cx="82" cy="42" r="12" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` + S('M72 52 L48 76 M80 58 L60 82', c.c1, 5) + S('M30 96 H98', c.c2, 5) },
      { n: '熔炉之息', e: '火塔攻击间隔 -15%', g: c => S('M38 50 H90 L84 92 H44 Z', c.c1, 5) + `<rect x="56" y="66" width="16" height="18" fill="none" stroke="${c.c1}" stroke-width="4"/>` + S('M16 60 q5 -6 10 0 q5 6 10 0', c.c2, 4) + S('M16 76 q5 -6 10 0 q5 6 10 0', c.c2, 4) },
      { n: '薪柴', e: '点燃概率 +20%', g: c => `<rect x="36" y="72" width="56" height="11" rx="5.5" fill="none" stroke="${c.c1}" stroke-width="4" transform="rotate(-8 64 77)"/>` + `<rect x="36" y="72" width="56" height="11" rx="5.5" fill="none" stroke="${c.c1}" stroke-width="4" transform="rotate(8 64 77)"/>` + `<path d="${flameP(64, 70, 30)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` },
      { n: '余烬风暴', e: '灼烧目标死亡时 25% 概率再爆炸', g: c => S('M66 62 a8 8 0 0 1 8 8 a16 16 0 0 1 -16 16 a24 24 0 0 1 -24 -24 a32 32 0 0 1 32 -32 a36 36 0 0 1 36 36', c.c1, 5) + `<circle cx="92" cy="90" r="4" fill="${c.c3}"/><circle cx="102" cy="72" r="3" fill="${c.c3}"/><circle cx="80" cy="102" r="3" fill="${c.c3}"/>` },
      { n: '火焰弹射', e: '普攻 25% 概率额外发射一枚火球', g: c => `<circle cx="32" cy="88" r="10" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` + S('M42 84 L56 64 L70 86 L84 66', c.c1, 5) + S('M78 62 L86 66 L79 73', c.c1, 4) },
      { n: '炼狱', e: '所有灼烧类伤害 +25%', g: c => `<path d="${flameP(36, 96, 26)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="3"/><path d="${flameP(92, 96, 26)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="3"/><path d="${flameP(64, 96, 46)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` },
      { n: '火舌', e: '烈焰墙长度 +50%', g: c => S('M64 26 C76 40 84 52 82 68 C80 80 72 88 64 98 C56 88 48 80 46 68 C44 52 52 40 64 26 Z', c.c1, 5) + S('M64 44 C70 54 72 62 64 78', c.c3, 4) },
      { n: '燃尽加速', e: '火雨波次间隔 -0.2 秒', g: c => S('M22 60 H50 M28 74 H54 M34 88 H56', c.c2, 5) + `<path d="${flameP(80, 92, 38)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` },
      { n: '焚天', e: '火柱 / 火墙 / 火雨冷却 -20%', g: c => `<circle cx="64" cy="58" r="15" fill="${c.c3}"/>` + rays(64, 58, 23, 38, 8, c.c1, 5) }
    ]
  },
  {
    id: 'ice', label: '冰塔', bg1: '#14507c', bg2: '#082942', edge: '#3f7fae',
    c1: '#8fdcff', c2: '#e2f6ff', c3: '#4db2e8',
    icons: [
      { n: '霜刺', e: '冰缓减速幅度 +10%', g: c => S('M44 30 H84 L66 98 Z', c.c1, 5) + S('M56 34 L62 84 M72 34 L65 84', c.c2, 3) },
      { n: '永冻', e: '冰冻时长 +1 秒', g: c => `<polygon points="104,64 84,98.6 44,98.6 24,64 44,29.4 84,29.4" fill="none" stroke="${c.c1}" stroke-width="5" stroke-linejoin="round"/>` + snowflake(64, 64, 18, c.c2, 4) },
      { n: '穿透凝冰', e: '冰穿刺穿透目标 +1', g: c => S('M24 64 H100', c.c2, 5) + S('M92 56 L102 64 L92 72', c.c2, 5) + S('M64 36 L84 64 L64 92 L44 64 Z', c.c1, 5) },
      { n: '暴雪', e: '多重冰锥数量 +2', g: c => snowflake(44, 44, 15, c.c1, 5) + snowflake(86, 42, 11, c.c1, 4) + snowflake(62, 86, 9, c.c2, 4) },
      { n: '冰晶', e: '冰花伤害 +40%', g: c => { let s = ''; for (let k = 0; k < 6; k++) s += `<path d="M64 30 L72 46 L64 58 L56 46 Z" fill="${c.c1}" transform="rotate(${k * 60} 64 64)"/>`; return s + `<circle cx="64" cy="64" r="7" fill="${c.c2}"/>`; } },
      { n: '冬域', e: '冬珠范围 +30%', g: c => `<circle cx="64" cy="64" r="38" fill="none" stroke="${c.c1}" stroke-width="5"/>` + snowflake(64, 64, 18, c.c2, 4) + `<circle cx="64" cy="26" r="4" fill="${c.c3}"/><circle cx="102" cy="64" r="4" fill="${c.c3}"/><circle cx="26" cy="64" r="4" fill="${c.c3}"/>` },
      { n: '碎冰强化', e: '碎冰伤害 +50%', g: c => S('M32 42 L52 34 L46 58 Z M58 30 L78 42 L64 56 Z M40 66 L64 60 L54 90 Z M70 62 L88 70 L72 92 Z', c.c1, 4) },
      { n: '冰甲', e: '冰墙护盾量 +200', g: c => S('M64 26 L94 36 V60 C94 82 82 95 64 102 C46 95 34 82 34 60 V36 Z', c.c1, 5) + snowflake(64, 62, 13, c.c2, 4) },
      { n: '寒髓', e: '冰塔攻击间隔 -15%', g: c => S(dropP(64, 62, 30), c.c1, 5) + snowflake(64, 68, 9, c.c2, 3) },
      { n: '极寒', e: '冰缓概率 +15%', g: c => S('M34 94 L46 46 L58 94 Z M54 94 L70 34 L86 94 Z M80 94 L91 54 L102 94 Z', c.c1, 4) + `<circle cx="50" cy="28" r="3" fill="${c.c2}"/><circle cx="96" cy="40" r="3" fill="${c.c2}"/>` },
      { n: '霜爆', e: '冰冻敌人死亡爆炸范围 +50%', g: c => starPoly(64, 64, 34, 15, 8, c.c1, 4) + `<circle cx="64" cy="64" r="7" fill="${c.c3}"/>` },
      { n: '冰雾', e: '普攻 20% 概率额外减速目标周围敌人', g: c => S('M28 52 q9 -7 18 0 q9 7 18 0 q9 -7 18 0 q9 7 18 0', c.c1, 5) + S('M28 70 q9 -7 18 0 q9 7 18 0 q9 -7 18 0 q9 7 18 0', c.c1, 5) + S('M28 88 q9 -7 18 0 q9 7 18 0 q9 -7 18 0 q9 7 18 0', c.c1, 5) + `<circle cx="44" cy="30" r="3" fill="${c.c2}"/><circle cx="84" cy="30" r="3" fill="${c.c2}"/>` },
      { n: '冰川', e: '所有减速效果 +15%', g: c => S('M24 96 L52 40 L68 68 L80 48 L104 96', c.c1, 5) + `<path d="M45 55 L52 42 L59 55 Z" fill="${c.c2}"/><path d="M74 60 L80 50 L86 60 Z" fill="${c.c2}"/>` },
      { n: '冰墙裂变', e: '冰墙存在期间城墙减伤 +10%', g: c => `<rect x="30" y="36" width="68" height="56" fill="none" stroke="${c.c1}" stroke-width="5"/>` + S('M30 55 H98 M30 73 H98', c.c2, 3) + S('M52 36 V55 M74 36 V55 M41 55 V73 M63 55 V73 M85 55 V73 M52 73 V92 M74 73 V92', c.c2, 3) + S('M56 32 L64 48 L56 62 L66 80 L60 96', c.c3, 5) },
      { n: '雪崩', e: '冰花改为轰炸 2 个目标', g: c => S('M26 36 L102 92', c.c2, 4, 'stroke-dasharray="4 9"') + `<circle cx="42" cy="44" r="9" fill="none" stroke="${c.c1}" stroke-width="4"/><circle cx="62" cy="58" r="11" fill="none" stroke="${c.c1}" stroke-width="4"/><circle cx="82" cy="76" r="13" fill="none" stroke="${c.c1}" stroke-width="4"/>` },
      { n: '凝霜', e: '冰锥命中减速持续 +1 秒', g: c => `<circle cx="64" cy="64" r="30" fill="none" stroke="${c.c1}" stroke-width="5"/><circle cx="64" cy="64" r="19" fill="none" stroke="${c.c1}" stroke-width="4"/>` + `<circle cx="64" cy="64" r="6" fill="${c.c3}"/>` + rays(64, 64, 34, 42, 8, c.c2, 4) }
    ]
  },
  {
    id: 'poison', label: '毒塔', bg1: '#2e5c14', bg2: '#143008', edge: '#5c8f2e',
    c1: '#a8e86a', c2: '#e2ffcb', c3: '#6fbf3a',
    icons: [
      { n: '毒腺', e: '中毒 DoT 伤害 +30%', g: c => S(dropP(60, 62, 28), c.c1, 5) + `<circle cx="84" cy="84" r="6" fill="none" stroke="${c.c2}" stroke-width="3"/><circle cx="94" cy="72" r="4" fill="none" stroke="${c.c2}" stroke-width="3"/>` },
      { n: '瘟疫之源', e: '毒爆传染目标 +2', g: c => `<circle cx="64" cy="64" r="22" fill="none" stroke="${c.c1}" stroke-width="5"/>` + rays(64, 64, 22, 32, 8, c.c1, 4) + `<circle cx="58" cy="58" r="3.5" fill="${c.c2}"/><circle cx="72" cy="66" r="3.5" fill="${c.c2}"/><circle cx="62" cy="74" r="3.5" fill="${c.c2}"/>` + rays(64, 64, 32, 36, 8, c.c3, 6) },
      { n: '腐沼', e: '毒池范围 +30%', g: c => `<ellipse cx="64" cy="80" rx="36" ry="13" fill="none" stroke="${c.c1}" stroke-width="5"/>` + `<circle cx="50" cy="58" r="5" fill="none" stroke="${c.c2}" stroke-width="3"/><circle cx="68" cy="46" r="7" fill="none" stroke="${c.c2}" stroke-width="3"/><circle cx="84" cy="60" r="4" fill="none" stroke="${c.c2}" stroke-width="3"/>` },
      { n: '毒枝', e: '毒棒攻击力 +50%', g: c => S('M62 100 C60 74 68 52 60 30', c.c1, 5) + S('M61 66 C48 62 42 52 44 42 C56 46 62 56 61 66 Z', c.c1, 4) + S('M63 48 C76 44 82 34 80 24 C68 28 62 38 63 48 Z', c.c1, 4) + `<path d="${dropP(84, 60, 11)}" fill="${c.c3}"/>` },
      { n: '剧毒精华', e: '中毒层数上限 +2', g: c => S('M58 30 H70 V48 L86 84 A7 7 0 0 1 80 96 H48 A7 7 0 0 1 42 84 L58 48 Z', c.c1, 5) + `<path d="M49 74 H79 L85.5 86 A6 6 0 0 1 80 94.5 H48 A6 6 0 0 1 42.5 86 Z" fill="${c.c3}"/>` + `<circle cx="60" cy="62" r="3" fill="${c.c2}"/><circle cx="70" cy="56" r="2.5" fill="${c.c2}"/>` },
      { n: '速疫', e: '瘟疫传染概率 +30%', g: c => `<circle cx="64" cy="64" r="9" fill="${c.c3}"/>` + rays(64, 64, 15, 30, 6, c.c1, 5) + rays(64, 64, 34, 42, 6, c.c1, 5) },
      { n: '缠毒', e: '毒藤缠绕时长 +1 秒', g: c => S('M64 30 V98', c.c2, 5) + S('M64 36 C86 42 86 54 64 58 C42 62 42 74 64 78 C86 82 86 94 64 96', c.c1, 5) },
      { n: '瘴毒', e: '瘴气叠毒间隔 -0.5 秒', g: c => cloud(c.c1, 5) + S('M42 84 q6 -6 12 0 q6 6 12 0 q6 -6 12 0', c.c2, 4) },
      { n: '毒牙', e: '中毒概率 +15%', g: c => `<path d="M38 30 C48 36 52 52 50 68 C49 78 46 88 42 94 C38 84 34 68 34 50 C34 40 35 34 38 30 Z" fill="${c.c3}" stroke="${c.c1}" stroke-width="3.5" stroke-linejoin="round"/><path d="M90 30 C80 36 76 52 78 68 C79 78 82 88 86 94 C90 84 94 68 94 50 C94 40 93 34 90 30 Z" fill="${c.c3}" stroke="${c.c1}" stroke-width="3.5" stroke-linejoin="round"/><path d="${dropP(64, 82, 11)}" fill="${c.c3}"/>` },
      { n: '缓毒', e: '中毒减速 +10%', g: c => `<circle cx="64" cy="64" r="32" fill="none" stroke="${c.c1}" stroke-width="5"/>` + `<path d="${dropP(64, 56, 13)}" fill="${c.c3}"/>` + S('M64 78 V96 M57 89 L64 96 L71 89', c.c1, 5) },
      { n: '毒爆连锁', e: '毒爆传染概率 +20%', g: c => S('M36 48 L64 74 L92 48', c.c2, 4) + `<circle cx="64" cy="74" r="11" fill="none" stroke="${c.c1}" stroke-width="5"/><circle cx="92" cy="48" r="11" fill="none" stroke="${c.c1}" stroke-width="5"/>` + rays(36, 48, 13, 22, 4, c.c1, 4) + `<circle cx="36" cy="48" r="9" fill="${c.c3}"/>` },
      { n: '腐化', e: '中毒敌人受到伤害 +15%', g: c => S('M64 64 a6 6 0 0 0 6 -6 a12 12 0 0 0 -12 -12 a20 20 0 0 0 -20 20 a28 28 0 0 0 28 28 a34 34 0 0 0 34 -34', c.c1, 5) + `<path d="${dropP(90, 88, 10)}" fill="${c.c3}"/>` },
      { n: '毒巢', e: '毒棒数量 +1', g: c => hex(46, 50, 15, c.c1, 4) + hex(80, 46, 15, c.c1, 4) + hex(62, 78, 15, c.c1, 4) + `<path d="${dropP(64, 98, 6)}" fill="${c.c3}"/>` },
      { n: '毒云', e: '毒池每秒额外叠 1 层毒', g: c => { const cl = cloud(c.c1, 5); return cl.replace('translate(64,50)', 'translate(64,44)') + `<path d="${dropP(48, 82, 9)}" fill="${c.c3}"/><path d="${dropP(66, 88, 9)}" fill="${c.c3}"/><path d="${dropP(84, 82, 9)}" fill="${c.c3}"/>`; } },
      { n: '蔓延', e: '毒藤扩散范围 +50%', g: c => S('M30 98 C46 86 52 68 48 40', c.c1, 5) + S('M47 68 C62 64 74 54 80 40', c.c1, 4) + S('M72 40 L81 39 L77 48', c.c1, 4) + S('M44 84 C58 88 70 84 78 74', c.c1, 4) + S('M70 76 L79 73 L76 82', c.c1, 4) },
      { n: '万毒', e: '所有中毒伤害 +20%', g: c => S(dropP(64, 44, 18), c.c1, 4) + `<path d="${dropP(44, 84, 14)}" fill="${c.c3}"/><path d="${dropP(84, 84, 14)}" fill="${c.c3}"/>` }
    ]
  },
  {
    id: 'electric', label: '电塔', bg1: '#6b5710', bg2: '#332806', edge: '#a88f2e',
    c1: '#ffe97a', c2: '#fff8d6', c3: '#ffc93d',
    icons: [
      { n: '电弧', e: '连锁目标 +2', g: c => `<circle cx="30" cy="86" r="7" fill="none" stroke="${c.c1}" stroke-width="5"/><circle cx="98" cy="86" r="7" fill="none" stroke="${c.c1}" stroke-width="5"/>` + S('M38 82 L54 60 L62 76 L78 56 L90 82', c.c2, 5) },
      { n: '强麻', e: '麻痹概率 +15%', g: c => `<circle cx="64" cy="64" r="32" fill="none" stroke="${c.c1}" stroke-width="6"/>` + bolt(64, 64, 20, c.c3) },
      { n: '过载', e: '充能层数上限 +2', g: c => `<rect x="32" y="50" width="56" height="30" rx="6" fill="none" stroke="${c.c1}" stroke-width="5"/><rect x="88" y="58" width="8" height="14" rx="2" fill="${c.c1}"/>` + bolt(60, 65, 12, c.c3) + S('M46 40 q5 -7 10 0 q5 7 10 0', c.c2, 4) },
      { n: '电链', e: '极光电击分叉 +2', g: c => `<ellipse cx="50" cy="64" rx="12" ry="19" fill="none" stroke="${c.c1}" stroke-width="5" transform="rotate(-25 50 64)"/><ellipse cx="78" cy="64" rx="12" ry="19" fill="none" stroke="${c.c1}" stroke-width="5" transform="rotate(25 78 64)"/>` + bolt(64, 64, 9, c.c3) },
      { n: '雷霆', e: '雷暴目标 +2', g: c => cloud(c.c1, 5).replace('translate(64,50)', 'translate(64,44)') + bolt(50, 82, 14, c.c3) + bolt(80, 82, 14, c.c3) },
      { n: '电球', e: '活电电球数量 +2', g: c => `<circle cx="56" cy="62" r="15" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` + rays(56, 62, 19, 27, 6, c.c1, 4) + `<circle cx="92" cy="42" r="5" fill="none" stroke="${c.c2}" stroke-width="3"/><circle cx="90" cy="82" r="4" fill="none" stroke="${c.c2}" stroke-width="3"/>` },
      { n: '快充', e: '每层充能攻速 +5%', g: c => bolt(64, 60, 18, c.c3) + S('M30 74 A36 36 0 0 1 98 74', c.c1, 5) + S('M30 74 L26 64 M30 74 L40 70 M98 74 L102 64 M98 74 L88 70', c.c1, 4) },
      { n: '磁力', e: '电磁场触发概率 +15%', g: c => S('M46 94 V58 A18 18 0 0 1 82 58 V94', c.c1, 7) + S('M40 94 H52 M76 94 H88', c.c2, 7) + S('M38 36 a30 30 0 0 1 52 0', c.c2, 3, 'stroke-dasharray="5 6"') },
      { n: '电光', e: '电塔攻击间隔 -15%', g: c => { const b = bolt(64, 62, 32, c.c3); return b.replace('/>', ` stroke="${c.c1}" stroke-width="4" stroke-linejoin="round"/>`); } },
      { n: '传导', e: '连锁衰减 -20%', g: c => S('M34 88 L64 42 L94 88', c.c2, 5) + `<circle cx="34" cy="88" r="9" fill="none" stroke="${c.c1}" stroke-width="5"/><circle cx="64" cy="42" r="9" fill="none" stroke="${c.c1}" stroke-width="5"/><circle cx="94" cy="88" r="9" fill="none" stroke="${c.c1}" stroke-width="5"/>` + `<circle cx="34" cy="88" r="3.5" fill="${c.c3}"/><circle cx="64" cy="42" r="3.5" fill="${c.c3}"/><circle cx="94" cy="88" r="3.5" fill="${c.c3}"/>` },
      { n: '麻痹扩散', e: '导电概率 +15%', g: c => `<circle cx="64" cy="64" r="8" fill="${c.c3}"/>` + rays(64, 64, 14, 28, 8, c.c1, 5) + rays(64, 64, 31, 35, 8, c.c2, 6) },
      { n: '静电', e: '被麻痹敌人减速 +15%', g: c => bolt(42, 42, 13, c.c3) + bolt(84, 50, 10, c.c3) + bolt(60, 88, 12, c.c3) + `<circle cx="68" cy="32" r="3" fill="${c.c2}"/><circle cx="98" cy="74" r="3" fill="${c.c2}"/><circle cx="32" cy="76" r="3" fill="${c.c2}"/>` },
      { n: '雷域', e: '雷暴间隔 -1.5 秒', g: c => `<circle cx="64" cy="64" r="38" fill="none" stroke="${c.c1}" stroke-width="5" stroke-dasharray="12 8"/>` + bolt(48, 52, 13, c.c3) + bolt(80, 54, 13, c.c3) + bolt(64, 84, 13, c.c3) },
      { n: '超导', e: '所有连锁类目标 +1', g: c => S('M26 64 H102', c.c2, 5) + `<circle cx="38" cy="64" r="8" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/><circle cx="64" cy="64" r="8" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/><circle cx="90" cy="64" r="8" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` + S('M38 48 V54 M64 48 V54 M90 48 V54', c.c1, 4) },
      { n: '闪电链增强', e: '连锁伤害 +20%', g: c => S('M44 50 L54 58 M74 72 L84 80', c.c2, 4) + bolt(34, 42, 15, c.c3) + bolt(64, 64, 15, c.c3) + bolt(94, 86, 15, c.c3) },
      { n: '电涌', e: '普攻 20% 概率额外产生一次小电弧', g: c => S('M20 78 q10 -14 21 0 q10 14 21 0 q10 -14 21 0 q10 14 21 0', c.c1, 5) + bolt(44, 50, 13, c.c3) + bolt(78, 46, 13, c.c3) }
    ]
  },
  {
    id: 'boomerang', label: '回旋镖塔', bg1: '#0f5c50', bg2: '#07302a', edge: '#2e8f7e',
    c1: '#6ae8d4', c2: '#d6fff7', c3: '#3fc4ae',
    icons: [
      { n: '强返', e: '折返伤害 +40%', g: c => S('M36 38 L64 84 L92 38', c.c1, 7) + S('M90 30 A46 30 0 0 0 38 30', c.c2, 4, 'stroke-dasharray="7 7"') + S('M46 24 L37 30 L45 37', c.c2, 4) },
      { n: '血刃', e: '流血伤害 +40%', g: c => S('M38 32 A46 46 0 0 1 90 84 A34 34 0 0 0 38 32 Z', c.c1, 4) + `<path d="${dropP(74, 94, 9)}" fill="${c.c3}"/>` },
      { n: '镖群', e: '多镖数量 +2', g: c => S('M64 102 L34 46 M64 102 L64 38 M64 102 L94 46', c.c1, 5) + gem(34, 44, 8, c.c3, c.c3, 3) + gem(64, 36, 8, c.c3, c.c3, 3) + gem(94, 44, 8, c.c3, c.c3, 3) },
      { n: '疾接', e: '接镖立即投掷且下镖伤害 +15%', g: c => `<circle cx="86" cy="42" r="13" fill="none" stroke="${c.c2}" stroke-width="5"/>` + S('M30 94 L72 52', c.c1, 5) + gem(76, 48, 8, c.c3, c.c3, 3) + S('M24 96 L40 82 M32 102 L48 88', c.c2, 4) },
      { n: '猎心', e: '标记增伤 +12%', g: c => `<circle cx="64" cy="64" r="28" fill="none" stroke="${c.c1}" stroke-width="5"/>` + S('M64 24 V40 M64 88 V104 M24 64 H40 M88 64 H104', c.c1, 5) + `<circle cx="64" cy="64" r="6" fill="${c.c3}"/>` },
      { n: '风暴眼', e: '风暴镖每镖伤害 +25%', g: c => S('M26 64 C42 40 86 40 102 64 C86 88 42 88 26 64 Z', c.c1, 5) + `<circle cx="64" cy="64" r="11" fill="none" stroke="${c.c2}" stroke-width="4"/><circle cx="64" cy="64" r="4" fill="${c.c3}"/>` },
      { n: '弹力', e: '弹力镖反弹 +5 次', g: c => S('M26 32 V96 M102 32 V96', c.c2, 5) + S('M34 84 L58 52 L78 84 L94 60', c.c1, 5) + `<circle cx="34" cy="84" r="7" fill="${c.c3}"/>` },
      { n: '长痕', e: '风痕持续 +1 秒', g: c => S('M24 94 C50 88 84 70 100 38', c.c1, 5, 'stroke-dasharray="10 8"') + gem(100, 32, 8, c.c3, c.c3, 3) },
      { n: '回旋', e: '镖飞行速度 +20%', g: c => S('M66 62 a8 8 0 0 1 8 8 a16 16 0 0 1 -16 16 a24 24 0 0 1 -24 -24 a32 32 0 0 1 32 -32 a38 38 0 0 1 38 38', c.c1, 5) },
      { n: '放血刃', e: '流血概率 +15%', g: c => S('M38 92 L82 38 L94 48 L52 94 Z', c.c1, 4) + S('M26 100 L40 90', c.c1, 5) + `<path d="${dropP(92, 72, 9)}" fill="${c.c3}"/><path d="${dropP(78, 98, 7)}" fill="${c.c3}"/>` },
      { n: '追猎', e: '标记层数上限 +2', g: c => `<circle cx="64" cy="64" r="26" fill="none" stroke="${c.c1}" stroke-width="5"/><circle cx="64" cy="64" r="16" fill="none" stroke="${c.c1}" stroke-width="4"/>` + S('M64 30 V38 M64 90 V98 M30 64 H38 M90 64 H98', c.c2, 4) + `<circle cx="64" cy="64" r="5" fill="${c.c3}"/>` },
      { n: '旋风', e: '风暴镖每圈镖数 +1', g: c => S('M96 38 H48 A11 11 0 0 0 48 60 H78 A8 8 0 0 1 78 76 H56 A7 7 0 0 0 56 90 H72', c.c1, 5) },
      { n: '飞刃', e: '弹力镖数量 +1', g: c => S('M34 36 A22 22 0 0 1 62 58 A15 15 0 0 0 34 36 Z', c.c1, 4) + S('M70 66 A22 22 0 0 1 98 88 A15 15 0 0 0 70 66 Z', c.c1, 4) + S('M26 60 L38 50 M62 94 L74 84', c.c2, 4) },
      { n: '风刃', e: '风痕伤害 +30%', g: c => S('M26 54 C46 34 82 34 102 54', c.c1, 6) + S('M26 78 C46 58 82 58 102 78', c.c1, 6) },
      { n: '镖尖', e: '所有飞镖伤害 +15%', g: c => S('M36 92 L78 50', c.c1, 5) + `<polygon points="96,32 86,60 68,42" fill="${c.c3}"/>` + S('M38 88 L28 78 M38 88 L28 98', c.c2, 4) },
      { n: '疾风回旋', e: '回旋镖攻击间隔 -10%', g: c => S('M16 48 H32 M12 64 H28 M16 80 H32', c.c2, 4) + S('M66 62 a8 8 0 0 1 8 8 a16 16 0 0 1 -16 16 a24 24 0 0 1 -24 -24 a32 32 0 0 1 32 -32 a38 38 0 0 1 38 38', c.c1, 5) }
    ]
  },
  {
    id: 'cannon', label: '炮塔', bg1: '#3c3f4a', bg2: '#1e2028', edge: '#6b6f7e',
    c1: '#c9cede', c2: '#f0f2f8', c3: '#ff9a4d',
    icons: [
      { n: '重爆', e: '重炮爆炸范围 +30%', g: c => starPoly(64, 64, 40, 18, 8, c.c3, 4, c.c3) + `<circle cx="64" cy="64" r="9" fill="${c.c2}"/>` },
      { n: '震地', e: '震击概率 +20%', g: c => S('M24 84 H104', c.c1, 6) + S('M64 84 L56 96 M64 84 L72 98 M40 84 L34 94 M88 84 L94 94', c.c1, 4) + S('M48 66 A22 22 0 0 1 80 66', c.c2, 4) + S('M40 56 A32 32 0 0 1 88 56', c.c2, 4) },
      { n: '穿透', e: '贯穿弹目标 +2', g: c => S('M24 64 H100', c.c1, 5) + S('M92 56 L102 64 L92 72', c.c1, 5) + `<circle cx="44" cy="64" r="11" fill="none" stroke="${c.c2}" stroke-width="4"/><circle cx="72" cy="64" r="11" fill="none" stroke="${c.c2}" stroke-width="4"/>` },
      { n: '双发', e: '双管齐射概率 +20%', g: c => `<rect x="34" y="50" width="46" height="13" rx="6.5" fill="none" stroke="${c.c1}" stroke-width="4" transform="rotate(-18 57 56)"/><rect x="34" y="68" width="46" height="13" rx="6.5" fill="none" stroke="${c.c1}" stroke-width="4" transform="rotate(-18 57 74)"/>` + rays(88, 40, 5, 12, 4, c.c3, 4) + rays(88, 58, 5, 12, 4, c.c3, 4) },
      { n: '空袭', e: '炮火支援炮弹 +2', g: c => `<path d="${dropP(40, 60, 12)}" fill="${c.c3}" transform="rotate(180 40 60)"/><path d="${dropP(64, 76, 12)}" fill="${c.c3}" transform="rotate(180 64 76)"/><path d="${dropP(88, 60, 12)}" fill="${c.c3}" transform="rotate(180 88 60)"/>` + S('M40 26 V34 M64 40 V48 M88 26 V34', c.c2, 4) },
      { n: '雷场', e: '地雷数量 +2', g: c => S('M28 92 H100', c.c2, 5) + [[44, 78], [64, 72], [84, 78]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${c.c3}" stroke="${c.c1}" stroke-width="3"/>` + rays(x, y, 9, 14, 6, c.c1, 3)).join('') },
      { n: '炮群', e: '炮台数量 +1', g: c => [[38, 74, -1], [64, 64, 0], [90, 74, 1]].map(([x, y, d]) => S(`M ${x - 14} ${y + 16} V ${y + 2} A 14 14 0 0 1 ${x + 14} ${y + 2} V ${y + 16} Z`, c.c1, 4) + S(`M ${x} ${y - 4} L ${x + d * 12} ${y - 20}`, c.c1, 5)).join('') },
      { n: '弹药库', e: '弹药上限 +100', g: c => `<rect x="34" y="46" width="60" height="46" rx="6" fill="none" stroke="${c.c1}" stroke-width="5"/>` + [52, 64, 76].map(x => `<path d="M ${x - 5} 84 v-16 a5 8 0 0 1 10 0 v16 z" fill="${c.c3}" stroke="${c.c1}" stroke-width="3"/>`).join('') },
      { n: '火药', e: '炮塔伤害 +20%', g: c => `<rect x="40" y="48" width="48" height="44" rx="10" fill="none" stroke="${c.c1}" stroke-width="5"/>` + S('M40 62 H88 M40 78 H88', c.c2, 3) + S('M64 48 C64 38 74 38 76 30', c.c2, 4) + rays(78, 26, 4, 10, 4, c.c3, 3) },
      { n: '速射', e: '炮塔攻击间隔 -12%', g: c => [[44, 50], [58, 64], [44, 78]].map(([x, y]) => `<path d="M ${x} ${y - 6} h14 a6 6 0 0 1 0 12 h-14 z" fill="${c.c3}" stroke="${c.c1}" stroke-width="3"/>`).join('') + S('M24 50 H36 M26 64 H46 M24 78 H36', c.c2, 4) },
      { n: '震烈', e: '击退距离 +40%', g: c => `<circle cx="64" cy="64" r="9" fill="${c.c3}"/>` + S('M64 48 V26 M57 33 L64 26 L71 33 M64 80 V102 M57 95 L64 102 L71 95 M48 64 H26 M33 57 L26 64 L33 71 M80 64 H102 M95 57 L102 64 L95 71', c.c1, 5) },
      { n: '火线', e: '贯穿伤害 +30%', g: c => S('M24 64 H82', c.c1, 5) + S('M30 50 H46 M38 78 H54', c.c2, 4) + `<path d="${flameP(94, 78, 26)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` },
      { n: '燃烧弹', e: '炮弹落地 30% 概率点燃', g: c => `<circle cx="50" cy="74" r="15" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` + S('M58 62 C66 54 68 48 66 42', c.c2, 4) + `<path d="${flameP(68, 44, 16)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="3"/>` + S('M26 56 L36 48 M34 42 L42 36', c.c2, 4) },
      { n: '增援', e: '炮台持续 +2 秒', g: c => S('M34 92 V80 A14 14 0 0 1 62 80 V92 Z', c.c1, 4) + S('M48 68 L48 52', c.c1, 5) + S('M72 38 A22 22 0 1 1 50 60', c.c2, 4) + S('M50 60 L44 52 M50 60 L58 54', c.c2, 4) },
      { n: '地雷强化', e: '地雷伤害 +50%', g: c => `<circle cx="64" cy="70" r="20" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` + rays(64, 70, 21, 30, 8, c.c1, 4) + S('M34 98 H94', c.c2, 5) + S('M52 60 A14 14 0 0 1 60 54', c.c2, 3) },
      { n: '军火之王', e: '所有爆炸伤害 +20%', g: c => S('M38 54 L46 34 L58 48 L64 30 L70 48 L82 34 L90 54 Z', c.c1, 5) + rays(64, 80, 10, 22, 8, c.c3, 5) + `<circle cx="64" cy="80" r="8" fill="${c.c3}"/>` }
    ]
  },
  {
    id: 'universal', label: '通用', bg1: '#7a5c14', bg2: '#3a2c08', edge: '#b08f2e',
    c1: '#ffdb7a', c2: '#fff3cf', c3: '#f0b43d',
    icons: [
      { n: '三消之力', e: '三消经验 +30%', g: c => gem(40, 66, 16, c.c1) + gem(88, 66, 16, c.c1) + gem(64, 66, 18, c.c1, c.c3) + rays(64, 34, 4, 10, 4, c.c2, 3) },
      { n: '金库', e: '波末金币 +30%', g: c => `<ellipse cx="58" cy="88" rx="18" ry="6" fill="none" stroke="${c.c1}" stroke-width="4"/><ellipse cx="58" cy="76" rx="18" ry="6" fill="none" stroke="${c.c1}" stroke-width="4"/><ellipse cx="58" cy="64" rx="18" ry="6" fill="none" stroke="${c.c1}" stroke-width="4"/>` + `<circle cx="90" cy="56" r="12" fill="none" stroke="${c.c1}" stroke-width="4"/><circle cx="90" cy="56" r="5" fill="${c.c3}"/>` },
      { n: '城墙加固', e: '城墙血量 +20%', g: c => S('M28 96 V58 H36 V44 H52 V58 H60 V44 H76 V58 H84 V44 H100 V96 Z', c.c1, 5) + S('M28 78 H100', c.c2, 3) },
      { n: '弹药箱', e: '初始弹药 +30', g: c => `<rect x="32" y="50" width="64" height="42" rx="6" fill="none" stroke="${c.c1}" stroke-width="5"/>` + [52, 64, 76].map(x => `<path d="M ${x - 5} 86 v-14 a5 8 0 0 1 10 0 v14 z" fill="${c.c3}" stroke="${c.c1}" stroke-width="3"/>`).join('') },
      { n: '全局充能', e: '全局技能充能 +40%', g: c => `<circle cx="64" cy="64" r="26" fill="none" stroke="${c.c1}" stroke-width="5"/>` + bolt(64, 64, 15, c.c3) + `<ellipse cx="64" cy="64" rx="42" ry="14" fill="none" stroke="${c.c2}" stroke-width="3" stroke-dasharray="6 6" transform="rotate(-18 64 64)"/>` },
      { n: '攻速戒指', e: '全塔攻击间隔 -10%', g: c => `<circle cx="64" cy="72" r="18" fill="none" stroke="${c.c1}" stroke-width="6"/>` + gem(64, 46, 11, c.c1, c.c3, 3) + S('M30 58 a20 20 0 0 0 0 28 M22 52 a30 30 0 0 0 0 40', c.c2, 4) },
      { n: '力量符', e: '全塔伤害 +15%', g: c => S('M64 26 L98 64 L64 102 L30 64 Z', c.c1, 5) + S('M52 76 L64 50 L76 76 M56 66 H72', c.c2, 5) },
      { n: '经验之心', e: '击杀经验 +30%', g: c => `<path d="${heartP(58, 66, 24)}" fill="${c.c3}" stroke="${c.c1}" stroke-width="4"/>` + starPoly(90, 36, 11, 4.5, 5, c.c2, 0, c.c2) },
      { n: '减伤护符', e: '城墙受到的伤害 -10%', g: c => S('M64 26 L94 36 V60 C94 82 82 95 64 102 C46 95 34 82 34 60 V36 Z', c.c1, 5) + S('M64 46 V76 M56 68 L64 76 L72 68', c.c2, 5) },
      { n: '生命回复', e: '每波结束城墙回血 5%', g: c => S(heartP(56, 62, 22), c.c1, 5) + S('M86 76 V98 M75 87 H97', c.c3, 6) },
      { n: '连锁反应', e: '三消 4 连概率 +10%', g: c => S('M56 44 H72 M44 56 V72 M84 56 V72 M56 84 H72', c.c2, 3) + gem(44, 44, 12, c.c1, c.c3, 3) + gem(84, 44, 12, c.c1) + gem(44, 84, 12, c.c1) + gem(84, 84, 12, c.c1) },
      { n: '时间停滞', e: '怪物移速 -10%', g: c => S('M38 30 H90 M38 98 H90', c.c2, 5) + S('M44 32 C44 50 58 56 58 64 C58 72 44 78 44 96 M84 32 C84 50 70 56 70 64 C70 72 84 78 84 96', c.c1, 5) + `<path d="M56 90 L64 76 L72 90 Z" fill="${c.c3}"/>` },
      { n: '冻结时刻', e: '每波首个敌人被冰冻 3 秒', g: c => `<circle cx="64" cy="64" r="30" fill="none" stroke="${c.c1}" stroke-width="6"/>` + snowflake(64, 64, 17, c.c2, 4) },
      { n: '赏金猎人', e: '精英 / Boss 宝箱掉落概率 +50%', g: c => S('M32 62 A32 20 0 0 1 96 62', c.c1, 5) + `<rect x="32" y="62" width="64" height="30" fill="none" stroke="${c.c1}" stroke-width="5"/>` + S('M64 62 V92', c.c2, 4) + `<rect x="57" y="66" width="14" height="14" rx="3" fill="${c.c3}" stroke="${c.c1}" stroke-width="3"/>` },
      { n: '智慧典籍', e: '升级所需经验 -10%', g: c => S('M64 44 C54 36 40 34 30 38 V86 C40 82 54 84 64 92 C74 84 88 82 98 86 V38 C88 34 74 36 64 44 Z', c.c1, 5) + S('M64 44 V92', c.c2, 3) + S('M40 52 H54 M40 62 H54 M74 52 H88 M74 62 H88', c.c2, 3) },
      { n: '战术转移', e: '每波免费洗牌 +1 次', g: c => S('M34 54 C50 36 78 36 94 54', c.c1, 6) + S('M85 48 L95 54 L86 61', c.c1, 5) + S('M94 74 C78 92 50 92 34 74', c.c1, 6) + S('M43 68 L33 74 L42 81', c.c1, 5) }
    ]
  }
];

/* ---------------- 生成 SVG / JSON / HTML ---------------- */
fs.rmSync(ROOT, { recursive: true, force: true });
const mapping = [];
let idx = 0;
for (const cat of cats) {
  const dir = path.join(ROOT, 'svg', cat.id);
  fs.mkdirSync(dir, { recursive: true });
  cat.icons.forEach((ic, i) => {
    const id = `${cat.id}_${String(i + 1).padStart(2, '0')}`;
    let svg;
    if (process.argv[2] === 'v2') {
      const dark = DARK[cat.id];
      const sp = { c1: dark, c2: dark, c3: dark };
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<defs>
<linearGradient id="bg_${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cat.bg1}"/><stop offset="1" stop-color="${cat.bg2}"/></linearGradient>
<radialGradient id="glow_${id}" cx="0.5" cy="0.52" r="0.5"><stop offset="0" stop-color="${cat.c3}" stop-opacity="0.38"/><stop offset="1" stop-color="${cat.c3}" stop-opacity="0"/></radialGradient>
<linearGradient id="gloss_${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<linearGradient id="vig_${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000000" stop-opacity="0.30"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient>
<clipPath id="cp_${id}"><rect x="4" y="4" width="120" height="120" rx="26"/></clipPath>
<filter id="ol_${id}" x="-30%" y="-30%" width="160%" height="160%"><feMorphology operator="dilate" radius="2.4"/></filter>
<filter id="sh_${id}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="1.6" flood-color="#000000" flood-opacity="0.5"/></filter>
</defs>
<rect x="4" y="4" width="120" height="120" rx="26" fill="url(#bg_${id})" stroke="${cat.edge}" stroke-width="3"/>
<g clip-path="url(#cp_${id})">
<rect x="4" y="4" width="120" height="60" fill="url(#gloss_${id})"/>
<rect x="4" y="64" width="120" height="60" fill="url(#vig_${id})"/>
</g>
<rect x="11" y="11" width="106" height="106" rx="20" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
<circle cx="64" cy="64" r="40" fill="url(#glow_${id})"/>
<g filter="url(#ol_${id})">${ic.g(sp)}</g>
<g filter="url(#sh_${id})">${ic.g(cat)}</g>
<g stroke="#ffffff" stroke-opacity="0.6" stroke-width="2.5" stroke-linecap="round"><line x1="100" y1="20" x2="100" y2="30"/><line x1="95" y1="25" x2="105" y2="25"/></g>
<circle cx="30" cy="32" r="2.2" fill="#ffffff" opacity="0.25"/>
<circle cx="96" cy="100" r="2" fill="#ffffff" opacity="0.2"/>
</svg>`;
    } else {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<defs><linearGradient id="g_${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${cat.bg1}"/><stop offset="1" stop-color="${cat.bg2}"/></linearGradient></defs>
<rect x="4" y="4" width="120" height="120" rx="26" fill="url(#g_${id})" stroke="${cat.edge}" stroke-width="3"/>
<rect x="11" y="11" width="106" height="106" rx="20" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
${ic.g(cat)}
</svg>`;
    }
    const file = `svg/${cat.id}/${id}.svg`;
    fs.writeFileSync(path.join(ROOT, file), svg, 'utf8');
    mapping.push({ id, name: ic.n, effect: ic.e, category: cat.id, categoryLabel: cat.label, file });
    idx++;
  });
}
fs.writeFileSync(path.join(ROOT, 'icons.json'), JSON.stringify(mapping, null, 2), 'utf8');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sections = cats.map(cat => {
  const items = mapping.filter(m => m.category === cat.id).map(m => `
      <div class="card" data-name="${esc(m.name)}">
        <img src="${m.file}" alt="${esc(m.name)}" loading="lazy">
        <div class="cname">${esc(m.name)}</div>
        <div class="ceff">${esc(m.effect)}</div>
      </div>`).join('');
  return `
    <section>
      <h2><span class="dot" style="background:${cat.c3}"></span>${cat.label} <small>${cat.icons.length} 枚</small></h2>
      <div class="grid">${items}
      </div>
    </section>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>圣遗物图标总览 · ${idx} 枚</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; background: #f5f2ec; color: #33302a; }
  header { padding: 28px 32px 8px; }
  h1 { margin: 0 0 6px; font-size: 26px; }
  header p { margin: 0; color: #8a8375; font-size: 13px; }
  #search { margin: 16px 32px 0; padding: 10px 14px; width: min(420px, calc(100% - 64px)); border: 1px solid #d8d2c4; border-radius: 10px; font-size: 14px; background: #fff; outline: none; }
  #search:focus { border-color: #b08f2e; }
  section { padding: 8px 32px 8px; }
  h2 { display: flex; align-items: center; gap: 10px; font-size: 19px; margin: 22px 0 12px; }
  h2 small { color: #a09884; font-size: 13px; font-weight: normal; }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 14px; }
  .card { background: #fff; border: 1px solid #e8e2d4; border-radius: 14px; padding: 12px; text-align: center; box-shadow: 0 1px 3px rgba(60,50,20,0.06); }
  .card img { width: 76px; height: 76px; image-rendering: auto; }
  .cname { font-weight: bold; font-size: 14px; margin-top: 6px; }
  .ceff { font-size: 12px; color: #8a8375; margin-top: 4px; line-height: 1.45; min-height: 34px; }
  footer { padding: 20px 32px 40px; color: #a09884; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>圣遗物图标总览</h1>
  <p>共 ${idx} 枚 · 7 大类 · v2 精修版（描边衬底 + 光晕 + 卡面高光）· 矢量 SVG 源文件位于 svg/ 目录，可无损缩放或导出 PNG</p>
</header>
<input id="search" type="text" placeholder="搜索圣遗物名称…">
${sections}
<footer>塔防游戏圣遗物图标 · 按塔系配色：火(赤红) / 冰(霜蓝) / 毒(翠绿) / 电(鎏金) / 回旋镖(青风) / 炮(铁灰) / 通用(金黄)</footer>
<script>
  const inp = document.getElementById('search');
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    document.querySelectorAll('.card').forEach(c => {
      c.style.display = c.dataset.name.toLowerCase().includes(q) ? '' : 'none';
    });
  });
</script>
</body>
</html>`;
fs.writeFileSync(path.join(ROOT, 'index.html'), html, 'utf8');
console.log(`OK: ${idx} icons -> ${ROOT}`);
