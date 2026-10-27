// v1.17 回归测试：圣遗物三选一重掷按钮文案与金币状态一致（修复"资金充足也显示金币不足"）
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

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

const pick = {
  t: Date.now(),
  star3: false,
  candidates: [
    { id: 'cm_vault', name: '金库', icon: '🏦', desc: '波末金币 +30%', run: true },
    { id: 'cm_wall', name: '城墙加固', icon: '🏯', desc: '城墙血量 +20%', run: true },
    { id: 'cm_exp', name: '经验之心', icon: '❤️', desc: '击杀经验 +30%', run: true },
  ],
  rerolls: 0,
};
const hits = {};

function renderWithGold(gold, rerolls) {
  texts.length = 0;
  pick.rerolls = rerolls;
  game.renderer.relicPickLayer(ctx2d, pick, hits, 500, gold);
  return texts.join('\n');
}

console.log('[1] 金币充足显示付费重掷');
let out = renderWithGold(500, 0);
ok(out.includes('🔄 重掷 · 200 🪙'), `gold=500 显示"重掷 · 200"（实际：${out.split('\n').filter((t) => t.includes('🔄'))[0] || '无'}）`);
ok(!out.includes('金币不足'), '不显示金币不足');

console.log('[2] 金币不足显示不足');
out = renderWithGold(50, 0);
ok(out.includes('金币不足（需 200）'), 'gold=50 显示金币不足');
ok(!out.includes('🔄 重掷 · 200'), '不显示可重掷');

console.log('[3] 上限显示');
out = renderWithGold(5000, 4);
ok(out.includes('已达重掷上限'), 'rerolls=4 显示上限');
ok(!out.includes('金币不足'), '上限不显示金币不足');

console.log('[4] 第 2 档费用');
out = renderWithGold(500, 1);
ok(out.includes('🔄 重掷 · 400 🪙'), 'rerolls=1 显示 400');

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
