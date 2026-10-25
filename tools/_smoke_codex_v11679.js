/* 临时冒烟（不提交）：v1.16.79 塔图鉴重设计 —— 贴合式标签 + 技能卡片 + 分支面板 */
const CONFIG = require('../js/config.js');
const { Renderer } = require('../js/game/render.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); fails++; } };

function mockCtx() {
  return {
    font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    measureText: () => ({ width: 100 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect() {}, strokeRect() {}, fill() {}, stroke() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, arcTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {}, fillText() {}, strokeText() {},
    rect() {}, drawImage() { return true; }, clip() {}, save() {}, restore() {}, setTransform() {}, translate() {}, rotate() {}, scale() {},
  };
}

const r = new Renderer();
const s = {
  tab: 'codex', gold: 5000, diamond: 50, panel: null, codexSel: 'fire',
  towerCodex: { fire: 1, ice: 1, poison: 1, electric: 1 },
  relicStars: {}, shards: {}, starStones: 0, deepChests: [], bestWave: 22,
};

// 1) 图鉴页：6 塔标签 + 8 技能卡命中区
try {
  const items = r.menuLayer(mockCtx(), s);
  const sels = items.filter((i) => i.key === 'codexSel');
  const cards = items.filter((i) => i.key === 'codexSkill');
  ok(sels.length === Object.keys(CONFIG.TOWERS).length, '贴合式标签 6 个');
  ok(cards.length === (CONFIG.EFFECT_POOLS.fire || []).length, '技能卡数量 = 技能池 8');
  const c0 = cards[0].rect;
  ok(c0.w > 0 && c0.h >= 140, '技能卡尺寸放大（h>=140）');
  console.log('codex page OK, tabs=' + sels.length, 'cards=' + cards.length);
} catch (e) { console.error('codex THROW:', e.stack.split('\n')[0]); fails++; }

// 2) 分支面板：每个塔每张卡都能渲染
for (const tk of Object.keys(CONFIG.TOWERS)) {
  const pool = CONFIG.EFFECT_POOLS[tk] || [];
  for (let i = 0; i < pool.length; i++) {
    s.panel = { type: 'codexSkill', tower: tk, idx: i };
    try {
      const items = r.menuLayer(mockCtx(), s);
      ok(items.some((x) => x.key === 'panelClose'), `分支面板有关闭按钮 ${tk}#${i}`);
    } catch (e) { console.error(`codexSkill[${tk}#${i}] THROW:`, e.stack.split('\n')[0]); fails++; }
  }
}
console.log('codexSkill panels OK');

// 3) 分支数据完整性：扁平键 a/ap, b/bp, c/cp
let brCnt = 0, withDesc = 0;
for (const tk of Object.keys(CONFIG.TOWERS)) {
  for (const sk of CONFIG.EFFECT_POOLS[tk] || []) {
    for (const [ak, pk] of [['a', 'ap'], ['b', 'bp'], ['c', 'cp']]) {
      if (sk[ak]) { brCnt++; if ((sk[pk] || []).length >= 1) withDesc++; }
    }
  }
}
console.log(`branches=${brCnt}, withDesc=${withDesc}`);
ok(brCnt > 0, '分支数据存在');
ok(withDesc === brCnt, '每个分支都有描述文案');

process.exit(fails ? 1 : 0);
