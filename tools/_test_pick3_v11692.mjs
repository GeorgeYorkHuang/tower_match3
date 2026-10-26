// v1.16.92 回归测试：①前三波阵亡取消木箱低保 ②三选一三态（新技能/新分支/升级）按钮、角标、标签文案
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const store = {};
const wxHandlers = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart(fn) { wxHandlers.start = fn; }, onTouchMove(fn) { wxHandlers.move = fn; }, onTouchEnd(fn) { wxHandlers.end = fn; },
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

/* ---------- ① 前三波阵亡无木箱 ---------- */
// 用例 A：第 2 波阵亡 → 不发宝箱
game.meta.deepChests = [];
game.run.wave = 2;
game.depthPool = 300; game.depthMult = 1;
game.finishRun(false);
let su = game.runSummary;
console.log('wave2 death: chestSkipped =', su.chestSkipped, ' chestGranted =', su.chestGranted, ' chests =', game.meta.deepChests.length);
if (!su.chestSkipped || su.chestGranted || game.meta.deepChests.length !== 0) { console.error('FAIL: 前三波阵亡仍发木箱'); process.exit(1); }

// 用例 B：第 15 波阵亡 → 正常发放
game.meta.deepChests = [];
game.run.wave = 15;
game.finishRun(false);
su = game.runSummary;
console.log('wave15 death: chestSkipped =', su.chestSkipped, ' chestGranted =', su.chestGranted, ' chests =', game.meta.deepChests.length);
if (su.chestSkipped || !su.chestGranted || game.meta.deepChests.length !== 1) { console.error('FAIL: 中后期阵亡宝箱异常'); process.exit(1); }

/* ---------- ② 三选一三态渲染 ---------- */
const pools = CONFIG.EFFECT_POOLS;
// 取火塔第一个技能名 + 一个分支
const fireTower = 'fire';
const skName = pools[fireTower][0].name;
game.state = 'picking';
game.pickQueue = [
  {
    tower: fireTower,
    target: skName,
    candidates: [
      { name: skName, type: 'skill' },                                  // 新技能
      { name: skName, type: 'branch', branch: 'A', branchLv: 0 },       // 新分支
      { name: skName, type: 'branch', branch: 'B', branchLv: 1 },       // 分支升级
    ],
  },
];
game.pickIndex = 0;
texts.length = 0;
game.pickHits = [];
game.renderer.pickLayer(ctx2d, game.pickQueue[0], game.pickHits, {});
const joined = texts.join('|');
const need = ['确认技能', '确认分支', '确认升级', 'NEW', 'Lv0', 'Lv1 → Lv2', '新技能', '→ '];
const missing = need.filter((n) => !joined.includes(n));
console.log('pickLayer texts check →', missing.length ? 'MISSING: ' + missing.join(', ') : 'all present');
if (missing.length) { console.error('FAIL: 三选一三态文案缺失'); process.exit(1); }
console.log('PASS');
