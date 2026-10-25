// v1.16.75 主菜单 4 张分页背景 + 战场卡图标（SVG→PNG，750×1626 逻辑分辨率）
// 主题：battle 红橙战场 / shop 金色商店 / relic 紫色圣物 / codex 蓝钢塔图鉴
import { Resvg } from 'file:///C:/Users/kindf/.workbuddy/binaries/node/workspace/node_modules/@resvg/resvg-js/index.js';
import { writeFileSync, mkdirSync } from 'fs';

const W = 750, H = 1626;

const svgWrap = (inner, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${inner}</svg>`;

// 公共：顶部渐亮 + 底部压暗 + 细噪点星
const vignette = (top, bot) => `
  <rect width="${W}" height="${H}" fill="url(#gVig)"/>
  <defs>
    <linearGradient id="gVig" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}" stop-opacity="0.9"/>
      <stop offset="0.45" stop-color="${top}" stop-opacity="0.25"/>
      <stop offset="1" stop-color="${bot}" stop-opacity="0.85"/>
    </linearGradient>
  </defs>`;

const stars = (seedN, color) => {
  let s = '';
  for (let i = 0; i < seedN; i++) {
    const x = ((i * 137.7) % W).toFixed(1), y = ((i * 211.3) % (H * 0.7)).toFixed(1);
    const r = (0.8 + (i % 3) * 0.5).toFixed(1);
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${(0.15 + (i % 5) * 0.07).toFixed(2)}"/>`;
  }
  return s;
};

/* ---------- 1. 战斗：红橙 · 城墙剪影 + 战旗 ---------- */
function bgBattle() {
  const defs = `
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#33161c"/><stop offset="0.5" stop-color="#180d12"/><stop offset="1" stop-color="#0d1117"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.3" r="0.85">
      <stop offset="0" stop-color="#ff7a45" stop-opacity="0.13"/><stop offset="1" stop-color="#ff7a45" stop-opacity="0"/>
    </radialGradient>`;
  // 两层城墙剪影（底部）
  let wall1 = 'M0 1500 L0 1430';
  for (let x = 0; x < W; x += 60) wall1 += ` L${x + 30} 1430 L${x + 30} 1400 L${x + 60} 1400 L${x + 60} 1430`;
  wall1 += ` L${W} 1430 L${W} 1500 Z`;
  let wall2 = 'M0 1600 L0 1520';
  for (let x = -30; x < W; x += 90) wall2 += ` L${x + 45} 1520 L${x + 45} 1480 L${x + 90} 1480 L${x + 90} 1520`;
  wall2 += ` L${W} 1520 L${W} 1600 Z`;
  // 远处战旗
  const flags = [[120, 480], [630, 430], [375, 560]].map(([fx, fy], i) => `
    <g opacity="0.5">
      <rect x="${fx}" y="${fy}" width="5" height="120" fill="#5a2a20"/>
      <path d="M${fx + 5} ${fy} L${fx + 75} ${fy + 18} L${fx + 5} ${fy + 40} Z" fill="${['#c0392b', '#e67e22', '#8e3b2f'][i]}"/>
    </g>`).join('');
  const inner = `
    <rect width="${W}" height="${H}" fill="url(#base)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${stars(40, '#ffb08a')}${flags}
    <path d="${wall1}" fill="#241016" opacity="0.9"/>
    <path d="${wall2}" fill="#160a0e"/>
    ${vignette('#3a1a20', '#0d1117')}`;
  return svgWrap(inner, defs);
}

/* ---------- 2. 商店：金色 · 悬浮钱币 + 帐篷幔布 ---------- */
function bgShop() {
  const defs = `
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2e2312"/><stop offset="0.5" stop-color="#181207"/><stop offset="1" stop-color="#0d1117"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.28" r="0.85">
      <stop offset="0" stop-color="#f7c948" stop-opacity="0.12"/><stop offset="1" stop-color="#f7c948" stop-opacity="0"/>
    </radialGradient>`;
  // 悬浮钱币（圆 + 内圈 + 方孔）
  const coins = [[90, 360, 26], [660, 320, 32], [590, 620, 20], [140, 700, 18], [375, 250, 16], [700, 900, 22], [60, 980, 20]]
    .map(([x, y, r]) => `
      <g opacity="0.55">
        <circle cx="${x}" cy="${y}" r="${r}" fill="#f7c948" opacity="0.25"/>
        <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#f7c948" stroke-width="2.5"/>
        <rect x="${x - r * 0.28}" y="${y - r * 0.28}" width="${r * 0.56}" height="${r * 0.56}" fill="none" stroke="#f7c948" stroke-width="2"/>
      </g>`).join('');
  // 顶部帐篷幔布
  let drape = 'M0 0 H750 V150 ';
  for (let x = 750; x > 0; x -= 94) drape += `Q${x - 47} 210 ${x - 94} 150 `;
  drape += 'Z';
  const inner = `
    <rect width="${W}" height="${H}" fill="url(#base)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${stars(36, '#ffe6a0')}
    <path d="${drape}" fill="#3a2c10" opacity="0.8"/>
    <path d="${drape}" fill="none" stroke="#f7c948" stroke-width="2" opacity="0.35"/>
    ${coins}
    ${vignette('#33270f', '#0d1117')}`;
  return svgWrap(inner, defs);
}

/* ---------- 3. 圣物：紫色 · 宝石棱面 + 光尘 ---------- */
function bgRelic() {
  const defs = `
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#221538"/><stop offset="0.5" stop-color="#130c22"/><stop offset="1" stop-color="#0d1117"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#a86bff" stop-opacity="0.12"/><stop offset="1" stop-color="#a86bff" stop-opacity="0"/>
    </radialGradient>`;
  // 大宝石（低透明棱面切工，装饰右下）
  const gem = (x, y, r, c) => `
    <g opacity="0.4" transform="translate(${x},${y})">
      <polygon points="0,${-r} ${r * 0.8},${-r * 0.35} ${r * 0.55},${r * 0.75} ${-r * 0.55},${r * 0.75} ${-r * 0.8},${-r * 0.35}" fill="${c}" opacity="0.28"/>
      <polygon points="0,${-r} ${r * 0.8},${-r * 0.35} 0,${-r * 0.1} ${-r * 0.8},${-r * 0.35}" fill="${c}" opacity="0.4"/>
      <polygon points="0,${-r * 0.1} ${r * 0.55},${r * 0.75} 0,${r * 0.5} ${-r * 0.55},${r * 0.75}" fill="${c}" opacity="0.35"/>
      <polygon points="0,${-r} ${r * 0.8},${-r * 0.35} ${r * 0.55},${r * 0.75} ${-r * 0.55},${r * 0.75} ${-r * 0.8},${-r * 0.35}" fill="none" stroke="${c}" stroke-width="2"/>
    </g>`;
  const inner = `
    <rect width="${W}" height="${H}" fill="url(#base)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${stars(48, '#d7b6ff')}
    ${gem(660, 1180, 110, '#a86bff')}
    ${gem(90, 480, 60, '#7c5cff')}
    ${gem(140, 1260, 44, '#c886ff')}
    ${vignette('#291a3d', '#0d1117')}`;
  return svgWrap(inner, defs);
}

/* ---------- 4. 塔图鉴：蓝钢 · 图纸网格 + 塔形蓝图 ---------- */
function bgCodex() {
  const defs = `
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#12233d"/><stop offset="0.5" stop-color="#0e1726"/><stop offset="1" stop-color="#0d1117"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.28" r="0.85">
      <stop offset="0" stop-color="#4d8fd6" stop-opacity="0.11"/><stop offset="1" stop-color="#4d8fd6" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M50 0 H0 V50" fill="none" stroke="#3d6ea5" stroke-width="0.8" opacity="0.16"/>
    </pattern>`;
  // 蓝图塔形（左侧装饰，六种塔身简笔）
  const tower = (x, y, s, c) => `
    <g opacity="0.35" stroke="${c}" fill="none" stroke-width="2">
      <rect x="${x - s * 0.3}" y="${y - s * 0.2}" width="${s * 0.6}" height="${s}" rx="3"/>
      <rect x="${x - s * 0.14}" y="${y - s * 0.62}" width="${s * 0.28}" height="${s * 0.42}" rx="2"/>
      <circle cx="${x}" cy="${y - s * 0.68}" r="${s * 0.1}"/>
      <line x1="${x - s * 0.5}" y1="${y + s}" x2="${x + s * 0.5}" y2="${y + s}"/>
    </g>`;
  const inner = `
    <rect width="${W}" height="${H}" fill="url(#base)"/>
    <rect width="${W}" height="${H}" fill="url(#grid)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${tower(96, 640, 120, '#5b9bd5')}
    ${tower(660, 1080, 90, '#5b9bd5')}
    <circle cx="375" cy="380" r="130" fill="none" stroke="#4d8fd6" stroke-width="1.5" opacity="0.3" stroke-dasharray="6 8"/>
    ${vignette('#152a47', '#0d1117')}`;
  return svgWrap(inner, defs);
}

/* ---------- 5. 战场卡图标：远古城堡徽章 / 测试烧瓶徽章（192×192） ---------- */
const iconAncient = `
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#45d48a"/><stop offset="1" stop-color="#14694a"/></linearGradient>
  </defs>
  <circle cx="96" cy="96" r="88" fill="url(#bg)"/>
  <circle cx="96" cy="96" r="88" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="4"/>
  <circle cx="96" cy="96" r="76" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2" stroke-dasharray="4 7"/>
  <g fill="#ffffff">
    <rect x="52" y="88" width="88" height="52" rx="4"/>
    <rect x="62" y="64" width="22" height="34"/><rect x="108" y="64" width="22" height="34"/>
    <rect x="84" y="52" width="24" height="46"/>
  </g>
  <g fill="#14694a">
    <rect x="62" y="64" width="8" height="10"/><rect x="76" y="64" width="8" height="10"/>
    <rect x="108" y="64" width="8" height="10"/><rect x="122" y="64" width="8" height="10"/>
    <rect x="84" y="52" width="9" height="10"/><rect x="99" y="52" width="9" height="10"/>
    <path d="M86 140 V116 a10 10 0 0 1 20 0 V140 Z"/>
  </g>
  <circle cx="96" cy="30" r="6" fill="#ffe08a"/>
</svg>`;

const iconTest = `
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f83f5"/><stop offset="1" stop-color="#3c2f8f"/></linearGradient></defs>
  <circle cx="96" cy="96" r="88" fill="url(#bg)"/>
  <circle cx="96" cy="96" r="88" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="4"/>
  <circle cx="96" cy="96" r="76" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2" stroke-dasharray="4 7"/>
  <g fill="#ffffff">
    <rect x="84" y="42" width="24" height="12" rx="4"/>
    <path d="M88 52 h16 v34 l26 46 a14 14 0 0 1 -12 21 H74 a14 14 0 0 1 -12 -21 l26 -46 Z"/>
  </g>
  <path d="M78 112 h36 l16 28 a10 10 0 0 1 -9 15 H71 a10 10 0 0 1 -9 -15 Z" fill="#3c2f8f" opacity="0.85"/>
  <circle cx="86" cy="126" r="5" fill="#b7a4e8"/><circle cx="106" cy="140" r="4" fill="#b7a4e8"/>
</svg>`;

mkdirSync('images/menubg', { recursive: true });
const jobs = [
  ['menu_battle.png', bgBattle()], ['menu_shop.png', bgShop()],
  ['menu_relic.png', bgRelic()], ['menu_codex.png', bgCodex()],
  ['icon_stage_ancient.png', iconAncient], ['icon_stage_test.png', iconTest],
];
for (const [name, svg] of jobs) {
  const png = new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
  writeFileSync(`images/menubg/${name}`, png);
  console.log('OK', name, (png.length / 1024).toFixed(1) + 'KB');
}
