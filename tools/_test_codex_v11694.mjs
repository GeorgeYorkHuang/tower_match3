// v1.16.94 塔图鉴改版回归：标签仅图标 / 塔色透明面板 / 4列属性胶囊条 / 技能卡能耗标识
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

const push = () => {
  const hits = [];
  const fn = (key, data, x, y, w, h) => { hits.push({ key, data, x, y, w, h }); return hits; };
  fn.hits = hits;
  return fn;
};
const keys = Object.keys(CONFIG.TOWERS);
for (const k of keys) {
  texts.length = 0;
  game.renderer.menuCodex(ctx2d, { codexSel: k }, push());
  const joined = texts.join('|');
  // 4 列属性 + 数值 + 技能池标题必须在
  const needCols = ['伤害', '攻速', '射程', '耗能', '技能池 · 点击卡片查看详情'];
  const missing = needCols.filter((n) => !joined.includes(n));
  // 旧第二行信息必须已删除
  const gone = ['直线弹道', '闪电折线', '回旋弧线', '抛物线炮弹'].filter((n) => joined.includes(n));   // 旧弹道字段（技能描述里偶发的"能量上限"不算）
  // 技能卡能耗：火塔 3 个周期技能能耗均应出现（2/2/2），且「能耗 0」也存在（普攻强化类）
  const hasEnergy = joined.includes('能耗 ');
  console.log(`[${k}] ${missing.length ? 'MISSING:' + missing.join(',') : 'cols ok'}${gone.length ? ' | 旧信息未删:' + gone.join(',') : ''} | 能耗标识:${hasEnergy ? 'ok' : 'MISSING'}`);
  if (missing.length || gone.length || !hasEnergy) process.exit(1);
}
// 火塔能耗数值抽检：火柱=2（周期），不在表内的技能=0
texts.length = 0;
game.renderer.menuCodex(ctx2d, { codexSel: 'fire' }, push());
const j2 = texts.join('|');
console.log('fire 能耗样本:', (j2.match(/能耗 \d+/g) || []).join(', '));
if (!/能耗 2/.test(j2) || !/能耗 0/.test(j2)) { console.error('FAIL: 能耗数值异常'); process.exit(1); }
console.log('PASS');
