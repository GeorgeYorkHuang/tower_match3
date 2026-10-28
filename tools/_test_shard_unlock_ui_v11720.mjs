// v1.17.20 碎片手动解锁 UI 回归测试
// 覆盖：可解锁态渲染（首页网格 + 图鉴面板 + 详情面板）/ relicUnlock 点击链路 / 未够碎片时不出现解锁入口
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
};
const texts = [];
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 14 });
    if (k === 'fillText') return (s) => { texts.push(String(s)); };
    return () => undefined;
  },
  set() { return true; },
});
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const CONFIG = require('../js/config.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' → ' + extra : ''}`); }
};
const eq = (a, b, name) => ok(a === b, name, `期望 ${b} 实际 ${a}`);
const has = (arr, s) => arr.some((t) => t.indexOf(s) >= 0);

// 取一个金圣遗物（解锁阈值 8）与一个紫圣遗物（阈值 4）
const goldId = Object.keys(CONFIG.RELIC_RARITY).find((id) => CONFIG.RELIC_RARITY[id] === 'ssr' && CONFIG.relicRunDef(id));
const purpleId = Object.keys(CONFIG.RELIC_RARITY).find((id) => CONFIG.RELIC_RARITY[id] === 'sr' && CONFIG.relicRunDef(id));
const goldNeed = CONFIG.DUPLICATE_SHARDS.ssr;
const purpleNeed = CONFIG.DUPLICATE_SHARDS.sr;
console.log(`金遗物 ${goldId}（阈值 ${goldNeed}）/ 紫遗物 ${purpleId}（阈值 ${purpleNeed}）`);

/** 渲染一次主界面圣遗物分页 */
const renderRelicTab = (mutate, scroll) => {
  game.state = 'menu'; game.menuTab = 'relic'; game.menuPanel = null;
  const ms = game.menuState();
  ms.relicScroll = scroll || 0;   // 图鉴按 金→紫→蓝 排序，紫区需滚动到视口内
  mutate(ms);
  texts.length = 0;
  game.menuHits = [];
  game.menuHits = game.renderer.menuLayer(ctx2d, ms, game.menuHits);
  return ms;
};
const findHit = (key, data) => game.menuHits.find((h) => h.key === key && h.data === data);

console.log('\n=== 1. 碎片够（8/8）→ 首页卡显示「可解锁」且可点进详情 ===');
renderRelicTab((ms) => { delete ms.relicStars[goldId]; delete ms.runCodex[goldId]; ms.shards[goldId] = 8; });
ok(has(texts, '可解锁'), '首页卡出现「可解锁」文案');
ok(!!findHit('relicInfo', goldId), '可解锁卡注册为 relicInfo 命中区（不再是无响应的 relicLock）');
ok(!findHit('relicLock', goldId), '可解锁卡不走 relicLock');

console.log('\n=== 2. 碎片不够（7/8）→ 未解锁占位，不给解锁入口 ===');
renderRelicTab((ms) => { delete ms.relicStars[goldId]; delete ms.runCodex[goldId]; ms.shards[goldId] = 7; });
ok(has(texts, '未解锁'), '碎片不足显示「未解锁」');
ok(!has(texts, '可解锁'), '碎片不足不出现「可解锁」');
ok(!!findHit('relicLock', goldId), '碎片不足走 relicLock');

console.log('\n=== 3. 详情面板（可解锁）→ 显示解锁按钮与消耗数量 ===');
renderRelicTab((ms) => { delete ms.relicStars[goldId]; delete ms.runCodex[goldId]; ms.shards[goldId] = 8; });
game.menuPanel = { type: 'relicInfo', id: goldId };
const msInfo = game.menuState();
delete msInfo.relicStars[goldId]; delete msInfo.runCodex[goldId]; msInfo.shards[goldId] = 8;
texts.length = 0; game.menuHits = [];
game.menuHits = game.renderer.menuLayer(ctx2d, msInfo, game.menuHits);
ok(has(texts, `解锁 · 消耗 ${goldNeed} 碎片`), `详情面板显示「解锁 · 消耗 ${goldNeed} 碎片」`);
ok(has(texts, `8 / ${goldNeed}`), '进度条口径为解锁阈值（不再显示 0 / 0）');
ok(!!findHit('relicUnlock', goldId), '注册 relicUnlock 命中区');

console.log('\n=== 4. 详情面板（碎片不足）→ 显示进度，不给解锁按钮 ===');
game.menuPanel = { type: 'relicInfo', id: goldId };
const msInfo2 = game.menuState();
delete msInfo2.relicStars[goldId]; delete msInfo2.runCodex[goldId]; msInfo2.shards[goldId] = 3;
texts.length = 0; game.menuHits = [];
game.menuHits = game.renderer.menuLayer(ctx2d, msInfo2, game.menuHits);
ok(!findHit('relicUnlock', goldId), '碎片不足无解锁命中区');
ok(has(texts, `碎片 3/${goldNeed}`), '显示「碎片 3/8」进度文案');

console.log('\n=== 5. 点击解锁按钮 → 扣碎片 + 点亮图鉴 ===');
game.meta.shards = { [goldId]: 8 };
game.meta.runCodex = {};
game.meta.relicStars = {};
game.state = 'menu'; game.menuTab = 'relic';
game.menuPanel = { type: 'relicInfo', id: goldId };
const msTap = game.menuState();
delete msTap.relicStars[goldId]; delete msTap.runCodex[goldId]; msTap.shards[goldId] = 8;
game.menuHits = [];
game.menuHits = game.renderer.menuLayer(ctx2d, msTap, game.menuHits);
const hitUnlock = findHit('relicUnlock', goldId);
ok(!!hitUnlock, '解锁按钮可点击');
game.onMenuTap({ x: hitUnlock.rect.x + hitUnlock.rect.w / 2, y: hitUnlock.rect.y + hitUnlock.rect.h / 2 });
eq(game.meta.starOf(goldId), 1, '点击后解锁成功 → 1★');
eq(game.meta.shards[goldId], 0, `扣除 ${goldNeed} 张碎片后归零`);

console.log('\n=== 6. 紫遗物阈值 4 的独立校验 ===');
renderRelicTab((ms) => { delete ms.relicStars[purpleId]; delete ms.runCodex[purpleId]; ms.shards[purpleId] = 3; }, 900);
ok(!!findHit('relicLock', purpleId), '紫遗物卡已进入视口（前置条件）');
ok(!has(texts, '可解锁'), '紫遗物 3/4 不可解锁');
renderRelicTab((ms) => { delete ms.relicStars[purpleId]; delete ms.runCodex[purpleId]; ms.shards[purpleId] = 4; }, 900);
ok(has(texts, '可解锁'), '紫遗物 4/4 可解锁');

console.log('\n=== 7. 已解锁圣遗物不误报可解锁 ===');
renderRelicTab((ms) => { ms.relicStars[goldId] = 2; ms.shards[goldId] = 99; });
ok(!has(texts, '可解锁'), '已解锁（2★）即便碎片溢出也不显示「可解锁」');

console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
