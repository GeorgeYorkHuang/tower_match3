// v1.17.28 技能配置实机验收（W 美工/工程师 · 第二批）
// 走真实链路：stub wx + canvas → js/game/main.js → game.menuState() / menuLayer() 收集真命中区
// → game.onMenuTap() 触发 main.js 里 buy/equip/swap 那条分支，断言存档与面板状态。
// 覆盖：三消三槽 / 双全局槽 / 翻页命中 / 购买与换槽 / 长文案溢出 / 命中区几何
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/* ---------------- 1. 环境桩 ---------------- */
const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {}, onEnded() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
};
const TEXTS = [];
/** 记录型 ctx：fillText 收集文本；measureText 按 CJK/ASCII 分别估宽（与真机 sans-serif 接近） */
function makeCtx() {
  const base = {};
  const handler = {
    get(t, k) {
      if (k === 'measureText') {
        return (str) => {
          const sz = parseInt((String(base.font || '').match(/(\d+)px/) || [0, 16])[1], 10) || 16;
          let w = 0;
          for (const ch of String(str)) w += ch.charCodeAt(0) > 0x2e80 ? sz : sz * 0.55;
          return { width: w };
        };
      }
      if (k === 'fillText') return (s) => { TEXTS.push(String(s)); };
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k in base) return base[k];
      return () => undefined;
    },
    set(t, k, v) {
      if (k === 'font' || k === 'fillStyle' || k === 'textAlign' || k === 'textBaseline') base[k] = v;
      return true;
    },
  };
  base.font = '10px sans-serif';
  return new Proxy(base, handler);
}
const ctx2d = makeCtx();
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {};
global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const CONFIG = require('../js/config.js');
const GlobalSkills = require('../js/global-skills.js');

/* ---------------- 2. 断言工具 ---------------- */
let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' → ' + extra : ''}`); }
};
const eq = (a, b, name) => ok(a === b, name, `期望 ${b} 实际 ${a}`);
const has = (arr, s) => arr.some((t) => t.indexOf(s) >= 0);
const fmt = (r) => `(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)}x${Math.round(r.h)})`;

/* 渲染一次主界面（可指定面板），返回 { s, hits, texts } */
function renderMenu(panel, mutate) {
  game.state = 'menu'; game.menuTab = 'battle'; game.menuPanel = panel || null;
  const s = game.menuState();
  if (mutate) mutate(s);
  TEXTS.length = 0;
  game.menuHits = [];
  game.menuHits = game.renderer.menuLayer(ctx2d, s, game.menuHits);
  return { s, hits: game.menuHits, texts: TEXTS.slice() };
}
const hitsOf = (hits, key) => hits.filter((h) => h.key === key);
const tapHit = (hit) => { const r = hit.rect; game.onMenuTap({ x: r.x + r.w / 2, y: r.y + r.h / 2 }); };
/** 在 hits 里按 key+data 过滤后点击 */
function tapKey(key, match) {
  const h = game.menuHits.find((x) => x.key === key && (!match || match(x.data)));
  if (!h) { ok(false, `命中区存在：${key}`, '未找到'); return false; }
  tapHit(h);
  return true;
}
const lastToast = () => (game.toasts.length ? game.toasts[game.toasts.length - 1].text : '');
const clearToasts = () => { game.toasts.length = 0; };
const resetMeta = () => {
  game.meta.gold = 0;
  game.meta.skillUnlocks = {};
  game.meta.matchSkills = { match4: 'random', match5: 'rainbow', chain: 'attack' };
  game.meta.globalSkills = { slots: ['shuffle', 'refill'] };
  clearToasts();
};

/* ===================================================================== */
console.log('\n=== 1. 主页两行：三消三槽 + 双全局槽 ===');
resetMeta();
let R = renderMenu(null);
const mHits = hitsOf(R.hits, 'matchCfg');
const gHits = hitsOf(R.hits, 'globalCfg');
eq(mHits.length, 3, '三消技能行注册 3 个 matchCfg 命中区');
eq(mHits.map((h) => h.data.slot).join(','), 'match4,match5,chain', '三槽顺序 match4/match5/chain');
eq(gHits.length, 2, '全局技能行注册 2 个 globalCfg 命中区（双槽，无第三格）');
eq(gHits.map((h) => h.data.index).join(','), '0,1', '双槽 index 0/1');
ok(mHits.every((h) => h.rect.w === 150 && h.rect.h === 200), '技能卡 3:4 尺寸 150x200', mHits.map((h) => fmt(h.rect)).join(' '));
eq(mHits[0].rect.x, 145, '三消首卡 x=145（标签列右缘 + 55）');
eq(mHits[0].rect.y, 970, '三消行 y=970');
eq(gHits[0].rect.y, 1234, '全局行 y=1234（行距 264）');
eq(gHits[1].rect.x - (gHits[0].rect.x + gHits[0].rect.w), 18, '全局双卡间距 18');
ok(has(R.texts, '四连技能') && has(R.texts, '高连技能') && has(R.texts, '连消技能'), '三槽顶部标签文案齐全');
ok(has(R.texts, '全局槽位 1') && has(R.texts, '全局槽位 2'), '全局双槽标签「全局槽位 1/2」');
ok(!has(R.texts, '全局槽位 3'), '不存在第三全局槽标签');

// 行内 / 行间不重叠
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
let intraOverlap = 0;
for (let i = 0; i < R.hits.length; i++) for (let j = i + 1; j < R.hits.length; j++) {
  if (overlap(R.hits[i].rect, R.hits[j].rect)) intraOverlap++;
}
eq(intraOverlap, 0, '主页 ' + R.hits.length + ' 个命中区两两不重叠');

/* ===================================================================== */
console.log('\n=== 2. 三消三槽面板：候选数与文案 ===');
const panelCase = (slot, expectN, expectTitle) => {
  resetMeta();
  const RR = renderMenu({ type: 'matchCfg', slot });
  const cards = hitsOf(RR.hits, 'mSkill');
  eq(cards.length, expectN, `${slot} 候选卡 ${expectN} 张`);
  ok(has(RR.texts, expectTitle), `${slot} 面板标题「${expectTitle}」`);
  ok(RR.hits.some((h) => h.key === 'panelClose'), `${slot} 面板有 panelClose`);
  return { cards, RR };
};
let C4 = panelCase('match4', 6, '四连技 · 技能选择');
ok(has(C4.RR.texts, '随机抽取'), '四连面板首张为「随机抽取」');
panelCase('match5', 4, '高连技 · 技能选择');
panelCase('chain', 2, '连消技 · 技能选择');

/** 状态条三分支 */
console.log('\n=== 3. 状态条三分支（✓已配置 / 点击配置 / 解锁价） ===');
resetMeta();
let RS = renderMenu({ type: 'matchCfg', slot: 'chain' });
ok(has(RS.texts, '✓ 已配置'), '已配置且已解锁 → 「✓ 已配置」');
ok(has(RS.texts, '解锁 · ' + CONFIG.SKILL_UNLOCK.price.chain + ' 金币'), '未解锁 → 「解锁 · N 金币」');
resetMeta();
game.meta.skillUnlocks = { chain: ['attack', 'skill'] };   // 全部解锁，则另一张应为「点击配置」
RS = renderMenu({ type: 'matchCfg', slot: 'chain' });
ok(has(RS.texts, '点击配置'), '已解锁未选中 → 「点击配置」');
ok(!has(RS.texts, '解锁 ·'), '全解锁后面板不再出现解锁价');

/* ===================================================================== */
console.log('\n=== 4. 全局面板：16 技能 / 3 页 / 翻页命中 ===');
const gpCase = (page) => {
  resetMeta();
  const RR = renderMenu({ type: 'globalCfg', index: 0, page });
  const cards = hitsOf(RR.hits, 'mSkill');
  const pager = hitsOf(RR.hits, 'globalPage');
  return { RR, cards, pager };
};
const gp0 = gpCase(0), gp1 = gpCase(1), gp2 = gpCase(2);
eq(gp0.cards.length, 6, '第 1 页 6 张');
eq(gp1.cards.length, 6, '第 2 页 6 张');
eq(gp2.cards.length, 4, '第 3 页 4 张（16 池尾页）');
ok(has(gp0.RR.texts, '1 / 3') && has(gp1.RR.texts, '2 / 3') && has(gp2.RR.texts, '3 / 3'), '页码文案 1/3、2/3、3/3');
eq(gp0.pager.map((h) => h.data).join(','), '1', '第 1 页只有「下一页 → 1」');
eq(gp1.pager.map((h) => h.data).sort().join(','), '0,2', '第 2 页「上一页 0 / 下一页 2」都在');
eq(gp2.pager.map((h) => h.data).join(','), '1', '第 3 页只有「上一页 → 1」');
ok(has(gp0.RR.texts, '下一页 ›') && !has(gp2.RR.texts, '下一页 ›'), '末页无「下一页」按钮');
ok(has(gp2.RR.texts, '‹ 上一页') && !has(gp0.RR.texts, '‹ 上一页'), '首页无「上一页」按钮');
ok(has(gp0.RR.texts, '装备与另一槽相同的技能时，自动交换两个槽位'), '互换提示文案存在');
// 翻页按钮与卡片不重叠、且在面板内
const cardRects = gp0.cards.map((h) => h.rect);
ok(gp0.pager.every((p) => cardRects.every((c) => !overlap(p.rect, c))), '翻页按钮不与任何卡片重叠');
ok(gp2.pager.every((p) => hitsOf(gp2.RR.hits, 'mSkill').map((h) => h.rect).every((c) => !overlap(p.rect, c))), '末页翻页按钮不与卡片重叠');
ok(gp2.pager.every((p) => p.rect.y + p.rect.h < 1626), '末页翻页按钮在屏内', fmt(gp2.pager[0].rect));

// 点击翻页：走 main.js 的 globalPage 分支
console.log('\n=== 5. 翻页点击链路 ===');
resetMeta();
renderMenu({ type: 'globalCfg', index: 0, page: 0 });
tapKey('globalPage', (d) => d === 1);
eq(game.menuPanel.page, 1, '点「下一页」→ page=1');
renderMenu({ type: 'globalCfg', index: 0, page: 1 });
tapKey('globalPage', (d) => d === 2);
eq(game.menuPanel.page, 2, '再点「下一页」→ page=2');
renderMenu({ type: 'globalCfg', index: 0, page: 2 });
ok(!game.menuHits.some((h) => h.key === 'globalPage' && h.data === 3), '第 3 页不存在「下一页」命中区（无越界入口）');
tapKey('globalPage', (d) => d === 1);
eq(game.menuPanel.page, 1, '点「上一页」→ page=1');

/* ===================================================================== */
console.log('\n=== 6. 购买：金币不足 / 金币足够 ===');
resetMeta();
const crossPrice = CONFIG.SKILL_UNLOCK.price.match4;
game.meta.gold = 100;
renderMenu({ type: 'matchCfg', slot: 'match4' });
tapKey('mSkill', (d) => d.id === 'cross');
eq(game.meta.gold, 100, '金币不足时不扣款');
ok(!game.meta.skillUnlocked('match4', 'cross'), '金币不足时未解锁');
eq(game.meta.matchSkills.match4, 'random', '金币不足时配置不变');
ok(lastToast().indexOf('金币不足') >= 0, '提示「金币不足」', lastToast());

resetMeta();
game.meta.gold = 5000;
renderMenu({ type: 'matchCfg', slot: 'match4' });
tapKey('mSkill', (d) => d.id === 'cross');
eq(game.meta.gold, 5000 - crossPrice, `购买扣除 ${crossPrice} 金币`);
ok(game.meta.skillUnlocked('match4', 'cross'), '购买后已解锁');
eq(game.meta.matchSkills.match4, 'cross', '购买后自动配置到该槽');
ok(game.toasts.some((t) => t.text.indexOf('购买解锁') >= 0), '提示「购买解锁」（随后再提示「已配置」）', game.toasts.map((t) => t.text).join(' / '));

// 重复点已配置的同一技能 → 无副作用
const goldBefore = game.meta.gold;
renderMenu({ type: 'matchCfg', slot: 'match4' });
tapKey('mSkill', (d) => d.id === 'cross');
eq(game.meta.gold, goldBefore, '重复点已解锁技能不扣款');
eq(game.meta.matchSkills.match4, 'cross', '重复点已解锁技能配置不变');

/* ===================================================================== */
console.log('\n=== 7. 换槽：配另一槽已装备的技能 → 两槽互换 ===');
resetMeta();
game.meta.gold = 9999;
game.meta.globalSkills = { slots: ['shuffle', 'refill'] };
// 记录项：槽 2 默认装备 refill，但 SKILL_UNLOCK.defaults.global 只有 shuffle
resetMeta();
game.meta.globalSkills = { slots: ['shuffle', 'refill'] };
let R1 = renderMenu({ type: 'globalCfg', index: 1, page: 0 });
ok(has(R1.texts, '当前槽位 · 待解锁'), '（发现）槽 2 默认装备 refill 但默认解锁集无 refill → 状态条显示「当前槽位 · 待解锁」');
game.meta.gold = 9999;
// 先解锁 refill
renderMenu({ type: 'globalCfg', index: 0, page: 0 });
tapKey('mSkill', (d) => d.id === 'refill');
ok(game.meta.skillUnlocked('global', 'refill'), 'refill 已解锁');
eq(GlobalSkills.slots(game.meta.globalSkills).join(','), 'refill,shuffle', '槽 0 配 refill → 与槽 1 的 refill 互换，槽 1 回落 shuffle');
ok(lastToast().indexOf('已配置') >= 0, '提示「已配置」', lastToast());

// 反向：槽 1 选槽 0 的技能
renderMenu({ type: 'globalCfg', index: 1, page: 0 });
tapKey('mSkill', (d) => d.id === 'refill');
eq(GlobalSkills.slots(game.meta.globalSkills).join(','), 'shuffle,refill', '槽 1 再选 refill → 换回 shuffle,refill');

/* ===================================================================== */
console.log('\n=== 8. 长文案：全 20 技能名 + desc 换行不压状态条 ===');
const cardW = 291, cardH = 252, descMaxW = cardW - 36;
const descTop = 126, lineH = 24, statusTop = cardH - 42;
const allDefs = [];
Object.keys(CONFIG.MATCH_SKILL).forEach((k) => {
  if (!Array.isArray(CONFIG.MATCH_SKILL[k])) return;
  CONFIG.MATCH_SKILL[k].forEach((d) => { if (d && d.id) allDefs.push({ slot: k, name: d.name, desc: d.desc || '' }); });
});
GlobalSkills.POOL.forEach((d) => allDefs.push({ slot: 'global', name: d.name, desc: d.desc || '' }));
eq(allDefs.length, 27, '技能总数 27 = 三消 11（5+4+2）+ 全局 16');
let worst = { lines: 0, name: '', lastBottom: 0 };
let overflow = [];
allDefs.forEach((d) => {
  const lines = game.renderer.wrapText(ctx2d, d.desc, descMaxW, 18);
  const lastBottom = descTop + (lines.length - 1) * lineH + 9;   // textBaseline=middle，半高 9
  if (lines.length > worst.lines || lastBottom > worst.lastBottom) worst = { lines: lines.length, name: d.name, lastBottom };
  if (lastBottom > statusTop) overflow.push(`${d.slot}/${d.name} ${lines.length} 行 bottom=${lastBottom} > ${statusTop}`);
});
ok(overflow.length === 0, '全部 desc 换行后不压状态条', overflow.join(' | '));
console.log(`        最紧：${worst.name} ${worst.lines} 行，末行底 y=${worst.lastBottom}，状态条顶 y=${statusTop}（余 ${statusTop - worst.lastBottom}px）`);
const nameOver = allDefs.filter((d) => game.renderer.wrapText(ctx2d, d.name, cardW - 24, 23).length > 1);
ok(nameOver.length === 0, '全部技能名单行放得下', nameOver.map((d) => d.name).join(','));

/* ===================================================================== */
console.log('\n=== 9. 面板几何：卡片网格与外壳 ===');
resetMeta();
renderMenu({ type: 'matchCfg', slot: 'match4' });
const pc = hitsOf(game.menuHits, 'mSkill').map((h) => h.rect);
eq(pc[0].w, 291, '候选卡宽 291');
eq(pc[0].h, 252, '候选卡高 252');
eq(pc[1].x - (pc[0].x + pc[0].w), 18, '两列间距 18');
eq(pc[2].y - (pc[0].y + pc[0].h), 16, '行距 = 252 + 16');
let pcOverlap = 0;
for (let i = 0; i < pc.length; i++) for (let j = i + 1; j < pc.length; j++) if (overlap(pc[i], pc[j])) pcOverlap++;
eq(pcOverlap, 0, '6 张候选卡两两不重叠');
const close = game.menuHits.find((h) => h.key === 'panelClose');
ok(!!close, 'panelClose 存在');
ok(pc.every((r) => r.y > close.rect.y), '候选卡在标题下方');

/* ===================================================================== */
eq(gHits[0].rect.x, 229, '全局首卡 x=229，保持标签原左缘');
console.log(`\n================ ${pass} PASS / ${fail} FAIL ================`);
process.exit(fail ? 1 : 0);
