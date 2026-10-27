/* v1.16.128 塔图鉴技能池卡片布局断言
 * 1) 标题只保留「技能池」（无「· 点击卡片查看详情」）
 * 2) 两列各向中间内收 10px：左列 x=48，右列 x=402（750-48-300）
 * 3) 卡高 205（原 210 减 5），卡底不得越过底部 5% 白区（bottomY = 1504-81 = 1423） */
const path = require('path');
const { Renderer } = require('../js/game/render.js');
const CONFIG = require('../js/config.js');

const texts = [];
const ctx = {
  font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
  measureText: (t) => ({ width: String(t).length * 13 }),
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createRadialGradient: () => ({ addColorStop: () => {} }),
  fillRect() {}, strokeRect() {}, fill() {}, stroke() {}, beginPath() {}, moveTo() {}, lineTo() {},
  arc() {}, arcTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {},
  fillText(t) { texts.push(String(t)); }, strokeText() {}, rect() {}, drawImage() {}, clip() {},
  save() {}, restore() {}, setTransform() {}, translate() {}, rotate() {}, scale() {},
};
const push = () => {
  const hits = [];
  const fn = (key, data, x, y, w, h) => hits.push({ key, data, rect: { x, y, w, h } });
  fn.hits = hits;
  return fn;
};
const r = new Renderer();

let fails = 0;
const fail = (m) => { console.error('FAIL ' + m); fails++; };
const W = 750, KH = 205, INSET = 10, CW = 300;

for (const k of Object.keys(CONFIG.TOWERS)) {
  texts.length = 0;
  const P = push();
  r.menuCodex(ctx, { codexSel: k }, P);
  const joined = texts.join('|');

  if (!joined.includes('技能池')) fail(`[${k}] 缺少「技能池」标题`);
  if (joined.includes('点击卡片查看详情')) fail(`[${k}] 仍残留「点击卡片查看详情」`);

  const cards = P.hits.filter((h) => h.key === 'codexSkill');
  const pool = CONFIG.EFFECT_POOLS[k] || [];
  if (cards.length !== pool.length) fail(`[${k}] 技能卡 ${cards.length} 张 ≠ 技能池 ${pool.length}`);

  const xs = [...new Set(cards.map((c) => c.rect.x))].sort((a, b) => a - b);
  const expect = [Math.round(W * 0.05) + INSET, W - Math.round(W * 0.05) - INSET - CW];
  if (xs.length !== 2) fail(`[${k}] 列数=${xs.length}（应为 2）`);
  else if (xs[0] !== expect[0] || xs[1] !== expect[1]) fail(`[${k}] 列 x=${xs.join(',')} 期望 ${expect.join(',')}`);

  const badH = cards.filter((c) => c.rect.h !== KH);
  if (badH.length) fail(`[${k}] ${badH.length} 张卡高 ≠ ${KH}`);

  const maxBottom = Math.max(...cards.map((c) => c.rect.y + c.rect.h));
  if (maxBottom > 1423) fail(`[${k}] 卡底 ${maxBottom} 越界（bottomY=1423）`);

  // 左右外边距对称
  const leftMargin = Math.min(...cards.map((c) => c.rect.x));
  const rightMargin = W - Math.max(...cards.map((c) => c.rect.x + c.rect.w));
  if (leftMargin !== rightMargin) fail(`[${k}] 左右边距不对称 ${leftMargin}/${rightMargin}`);
}
if (!fails) console.log(`PASS 技能池卡片：标题纯文字 / 两列 x=48,402 / 卡高 ${KH} / 不越底部白区`);
process.exit(fails ? 1 : 0);
