// v1.16.110 图鉴胶囊化回归：圣遗物胶囊进度条 / 塔图鉴等宽页签 + 能耗胶囊 / 技能卡删"点击查看详情"
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

// ---- 塔图鉴：能耗胶囊 + 删详情入口 ----
const keys = Object.keys(CONFIG.TOWERS);
for (const k of keys) {
  texts.length = 0;
  game.renderer.menuCodex(ctx2d, { codexSel: k }, push());
  const j = texts.join('|');
  const miss = ['⚡ 耗能', '技能池', '伤害', '攻速', '射程'].filter((n) => !j.includes(n));
  const gone = ['点击查看详情', '能耗 '].filter((n) => j.includes(n));
  console.log(`[codex ${k}] ${miss.length ? 'MISSING:' + miss.join(',') : 'ok'}${gone.length ? ' | 残留:' + gone.join(',') : ''}`);
  if (miss.length || gone.length) process.exit(1);
}
// 能耗数值抽检：火塔 火柱=2（周期技能），不在 SKILL_ENERGY 表内的技能=0
texts.length = 0;
game.renderer.menuCodex(ctx2d, { codexSel: 'fire' }, push());
const j2 = texts.join('|');
const bolts = j2.match(/⚡\d+/g) || [];
console.log('fire 能耗胶囊:', bolts.join(', '));
if (!bolts.includes('⚡2') || !bolts.includes('⚡0')) { console.error('FAIL: 能耗胶囊数值异常'); process.exit(1); }

// ---- 圣遗物图鉴：胶囊进度条三种状态 ----
const list = game.renderer._relicRunList();
const s = { relicScroll: 0, relicStars: {}, runCodex: {}, shards: {} };
[list[0], list[1], list[2]].forEach((d) => { s.runCodex[d.id] = 1; });
s.shards[list[1].id] = 9999;     // 碎片超阈值 → 可升星
s.relicStars[list[2].id] = 3;    // 3★ → 已满级
texts.length = 0;
game.renderer.menuRelic(ctx2d, s, push());
const j3 = texts.join('|');
const capOk = /\d+\/\d+/.test(j3);
console.log(`[relic] 可升星:${j3.includes('可升星')} 已满级:${j3.includes('已满级')} 碎片标签:${capOk}`);
if (!j3.includes('可升星') || !j3.includes('已满级') || !capOk) { console.error('FAIL: 胶囊进度条状态标签缺失'); process.exit(1); }
console.log('PASS');
