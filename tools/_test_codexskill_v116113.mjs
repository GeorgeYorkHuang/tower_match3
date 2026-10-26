// v1.16.113 塔图鉴技能分支弹层重做回归：塔色丝带/大图标/能耗胶囊/A·B·C 分支卡/关闭按钮
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

// ---- 全量遍历：6 塔 × 每塔 8 技能，均须渲染出新版结构 ----
let n = 0;
for (const tk of Object.keys(CONFIG.EFFECT_POOLS)) {
  const pool = CONFIG.EFFECT_POOLS[tk];
  pool.forEach((sk, idx) => {
    texts.length = 0;
    const hits = push();
    game.renderer.codexSkillPanel(ctx2d, { panel: { tower: tk, idx } }, hits);
    const j = texts.join('|');
    const miss = ['技 能 分 支', sk.name, '升级分支 · 三选一', 'Lv1→2', '⚡'].filter((x) => !j.includes(x));
    const hasClose = hits.hits.some((h) => h.key === 'panelClose');
    if (miss.length || !hasClose) {
      console.error(`FAIL [${tk}#${idx} ${sk.name}] missing:${miss.join(',')} closeBtn:${hasClose}`);
      process.exit(1);
    }
    n++;
  });
}
console.log(`遍历 ${n} 个技能分支弹层渲染 OK`);

// ---- 能耗胶囊数值抽检（火塔）：火柱=2（SKILL_ENERGY 表内），点燃=0（表外） ----
const fireIdx = {};
CONFIG.EFFECT_POOLS.fire.forEach((sk, i) => { fireIdx[sk.name] = i; });
for (const [nm, want] of [['火柱', 2], ['点燃', 0]]) {
  texts.length = 0;
  game.renderer.codexSkillPanel(ctx2d, { panel: { tower: 'fire', idx: fireIdx[nm] } }, push());
  const j = texts.join('|');
  if (!j.includes(`${nm}`) || !j.includes(`⚡${want}`)) {
    console.error(`FAIL 能耗胶囊 ${nm} 期望 ⚡${want}，实际:`, (j.match(/⚡\d+/g) || []).join(','));
    process.exit(1);
  }
}
console.log('能耗胶囊数值 OK（火柱 ⚡2 / 点燃 ⚡0）');
console.log('PASS');
