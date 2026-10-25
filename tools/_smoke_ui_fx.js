/* 临时冒烟（不提交）：mock canvas 实际渲染 towerSkillLayer（新 UI）与 zigzag-glow/icewall/miasma/storm fx，验证不抛错 */
const { Renderer } = require('../js/game/render.js');

function mockCtx() {
  return {
    font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    measureText: (s) => ({ width: (() => { let w = 0; for (const c of String(s)) w += c.charCodeAt(0) > 255 ? 24 : 24 * 0.55; return w; })() }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect() {}, strokeRect() {}, fill() {}, stroke() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, arcTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {}, fillText() {}, strokeText() {},
    rect() {}, drawImage() {}, clip() {}, save() {}, restore() {}, setTransform() {}, translate() {}, rotate() {}, scale() {},
  };
}

const r = new Renderer();
let fails = 0;

// 1) 塔详情层（新分支卡片布局 + 放大字号）
const info = {
  towerKey: 'fire', skillName: '点燃', icon: '🔥', color: '#ff7043', lv: 2, lvMax: false,
  desc: '普攻造成灼烧的概率提升20%→45%；灼烧每秒造成伤害并持续数秒',
  bA: '炽焰', bB: '炽热', bC: '余烬',
  branches: { A: 2, B: 0, C: 1 },
  branchDesc: { A: '灼烧概率提升45%→60%', B: '灼烧持续时间延长3→4秒', C: '灼烧持续时间缩短2→1.5秒，结束时造成50%→70%的伤害' },
};
const hits = {};
try { r.towerSkillLayer(mockCtx(), info, hits); } catch (e) { console.error('towerSkillLayer THROW:', e.message); fails++; }
if (!hits.bg || !hits.back) { console.error('towerSkillLayer hits missing'); fails++; }

// 2) 重做/强化 fx 渲染
const ctx = mockCtx();
try {
  r.fx(ctx, [
    { type: 'shot', kind: 'zigzag', path: [{ x: 200, y: 500 }, { x: 250, y: 520 }, { x: 300, y: 500 }, { x: 380, y: 540 }], t: 0.1, dur: 0.45, color: '#ffe08a', w: 5, glow: true },
    { type: 'shot', kind: 'icewall', x: 375, y: r.ly.wallY, t: 2, dur: 10 },
    { type: 'shot', kind: 'miasma', x: 375, y: r.ly.wallY - 50, w: 750, half: 20, t: 3, dur: 1e9 },
    { type: 'shot', kind: 'storm', x: 300, y: 700, t: 0.3, dur: 0.55, delay: 0, seed: 1234 },
  ]);
} catch (e) { console.error('fx THROW:', e.message); fails++; }

// 3) 加速按钮（去底色，仅图标+倍数）在 ×1/×2/×3/×4 下渲染不抛错
const sBase = { runSpeed: 1, gold: 100, wave: 3, waveTime: 10, waveDuration: 40, state: 'fighting', synergies: [], enemyCount: 3, hasBoss: false };
try {
  [1, 2, 3, 4].forEach((sp) => { r.funcBar(mockCtx(), Object.assign({}, sBase, { runSpeed: sp })); });
} catch (e) { console.error('funcBar THROW:', e.message); fails++; }

console.log(fails === 0 ? 'SMOKE_OK' : ('FAILS = ' + fails));
process.exit(fails === 0 ? 0 : 1);
