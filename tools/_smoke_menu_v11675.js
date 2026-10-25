/* 临时冒烟（不提交）：mock canvas 渲染 menuLayer 四分页，验证返回命中区 */
const { Renderer } = require('../js/game/render.js');
function mockCtx() {
  return {
    font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    measureText: () => ({ width: 100 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect() {}, strokeRect() {}, fill() {}, stroke() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, arcTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {}, fillText() {}, strokeText() {},
    rect() {}, drawImage() {}, clip() {}, save() {}, restore() {}, setTransform() {}, translate() {}, rotate() {}, scale() {},
  };
}
const r = new Renderer();
const s = {
  tab: 'battle', gold: 12345, diamond: 8, stage: 'ancient', chests: 2, chestOpenSec: 30,
  relics: [], daily: { picks: [] }, panel: null,
  codexSel: 'fire', towerCodex: { fire: 1, ice: 1, poison: 1, electric: 1 },
};
let fails = 0;
for (const tab of ['battle', 'shop', 'relic', 'codex']) {
  s.tab = tab;
  let items;
  try { items = r.menuLayer(mockCtx(), s); } catch (e) { console.error(`menuLayer[${tab}] THROW:`, e.stack.split('\n')[0]); fails++; continue; }
  const keys = items.map((i) => i.key);
  if (!keys.includes('tab')) { console.error(`menuLayer[${tab}] missing tab hits`); fails++; }
  if (tab === 'codex') {
    if (!keys.includes('codexSel')) { console.error('codex missing codexSel hits'); fails++; }
    else console.log('codexSel hits:', items.filter((i) => i.key === 'codexSel').length);
  }
  console.log('menuLayer[' + tab + '] OK, hits=' + items.length);
}
s.tab = 'codex'; s.codexSel = 'boomerang';
try { const items = r.menuLayer(mockCtx(), s); console.log('codex locked OK, learnBtn=' + items.some((i) => i.key === 'codexLearn')); } catch (e) { console.error('codex locked THROW:', e.stack.split('\n')[0]); fails++; }
process.exit(fails ? 1 : 0);
