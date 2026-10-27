// v1.17 验证：①三消经验真实入整体经验池（含形状/三消之力/升级）②经验条 0 级进度显示修复
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CONFIG = require('../js/config.js');
const { Run } = require('../js/run.js');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

/* ---------- ① 三消经验入池（主路径：已获得塔） ---------- */
console.log('[1] 三消经验入池');
const r = new Run({ difficulty: CONFIG.DIFFICULTY.default, seed: 777 });
r.effects.tower('fire').unlock(); // 获得火塔（level 1）
ok(r.exp === 0 && r.expLevel === 0, '初始 exp=0 expLevel=0');
r.applyMatch('red', '3', 3);
ok(r.exp === 6, `三连消除 → exp=6 实际 ${r.exp}`);
r.applyMatch('red', '4', 4);
ok(r.exp === 18, `再直4 → exp=18 实际 ${r.exp}`);
r.applyMatch('red', '5', 5);
// 直5 +20 → exp=38 ≥ expNeed(0)=35 → 立即升级（expLevel=1, exp=3）
ok(r.expLevel === 1, `直5 触发升级 expLevel=1 实际 ${r.expLevel}`);
ok(r.exp === 3, `升级后剩余 exp=3 实际 ${r.exp}`);

/* ---------- ② 三消之力加成 ---------- */
console.log('[2] 三消之力');
const r2 = new Run({ difficulty: CONFIG.DIFFICULTY.default, seed: 778 });
r2.metaRef = { starOf: () => 1 };
r2.runRelic = { cm_triple: 1 }; // 1★ +30%
r2.effects.tower('fire').unlock();
r2.applyMatch('red', '3', 3);
ok(r2.exp === 8, `三消之力1★：6×(1+30%)=7.8→8 实际 ${r2.exp}`);
const r2b = new Run({ difficulty: CONFIG.DIFFICULTY.default, seed: 779 });
r2b.metaRef = { starOf: () => 2 };
r2b.runRelic = { cm_triple: 1 }; // 2★ +45%
r2b.effects.tower('fire').unlock();
r2b.applyMatch('red', '3', 3);
ok(r2b.exp === 9, `三消之力2★：6×1.45=8.7→9 实际 ${r2b.exp}`);

/* ---------- ③ 未得塔消除（得塔分支）不给经验但得塔 ---------- */
console.log('[3] 得塔分支');
const r3 = new Run({ difficulty: CONFIG.DIFFICULTY.default, seed: 780 });
const pre = r3.effects.tower('fire').level;
r3.applyMatch('red', '3', 3);
ok(r3.effects.tower('fire').level === pre + 1, '消除得塔（level+1）');
ok(r3.exp === 0, '得塔分支不加经验（得塔即奖励）');

/* ---------- ④ UI 经验条 0 级进度（main harness） ---------- */
console.log('[4] 经验条 0 级进度');
const store = {};
const wxHandlers = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart(fn) { wxHandlers.start = fn; }, onTouchMove(fn) { wxHandlers.move = fn; }, onTouchEnd(fn) { wxHandlers.end = fn; },
};
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 14 });
    return () => undefined;
  },
  set() { return true; },
});
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
// 进入战斗：解锁火塔后三消
game.run = new Run({ difficulty: CONFIG.DIFFICULTY.default, seed: 781 });
game.run.metaRef = game.meta;
game.run.fxTarget = game.fx;
game.run.slotOrder.push('fire'); // 出战火塔（塔详情展示位）
game.run.effects.tower('fire').unlock();
game.state = 'fighting';
game.run.applyMatch('red', '3', 3);
const hud = game.sceneState();
ok(hud.exp === 6, `battleState exp=6 实际 ${hud.exp}`);
ok(hud.expRatio === 6 / 35, `0 级时 expRatio=${(hud.expRatio * 100).toFixed(1)}%（修复前恒 0）`);
ok(hud.towers[0].expRatio === 6 / 35, '塔详情 expRatio 同步修复');

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
