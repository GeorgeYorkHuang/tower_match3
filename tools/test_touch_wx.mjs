/**
 * test_touch_wx.mjs —— 真机触摸通道测试（mock wx.onTouchStart 全局通道 + 逻辑像素坐标）
 * 验证：真机优先走 wx 全局触摸事件（非同层渲染下 canvas 事件可能不派发），
 * 坐标按 windowWidth/Height 逻辑像素归一化到 750×1334。
 * 运行：node tools/test_touch_wx.mjs
 */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);

const store = {};
const wxHandlers = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; },
  setStorageSync(k, v) { store[k] = v; },
  // 真机：全局触摸通道（逻辑像素坐标）
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart(fn) { wxHandlers.start = fn; },
  onTouchMove(fn) { wxHandlers.move = fn; },
  onTouchEnd(fn) { wxHandlers.end = fn; },
};
const ctx2d = new Proxy({}, { get() { return () => undefined; }, set() { return true; } });
const canvasHandlers = {};
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: (t, fn) => { canvasHandlers[t] = fn; } };
global.GameGlobal = {};
global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const DESIGN = require('../js/config.js').DESIGN;
const LOGIC_W = DESIGN.W, LOGIC_H = DESIGN.H;

/* 新状态机：初始在主界面，触摸用例先进战斗 */
game.newRun(true);

const { boardX, boardY, cell } = game.ly;
/* 逻辑坐标 → 真机逻辑像素坐标（windowWidth/Height 系） */
const toClient = (lx, ly) => ({ x: lx * 375 / LOGIC_W, y: ly * 667 / LOGIC_H });
const center = (r, c) => toClient(boardX + c * cell + cell / 2, boardY + r * cell + cell / 2);

function tap(r, c) {
  const p = center(r, c);
  wxHandlers.start({ touches: [{ clientX: p.x, clientY: p.y }] });
  wxHandlers.end({ touches: [] });
}
function swipe(r1, c1, r2, c2) {
  const a = center(r1, c1), b = center(r2, c2);
  wxHandlers.start({ touches: [{ clientX: a.x, clientY: a.y }] });
  wxHandlers.move({ touches: [{ clientX: b.x, clientY: b.y }] });
  wxHandlers.end({ touches: [] });
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

let lastSwap = null;
const origTrySwap = game.match3.trySwap.bind(game.match3);
game.match3.trySwap = function (r1, c1, r2, c2) { lastSwap = [r1, c1, r2, c2]; return origTrySwap(r1, c1, r2, c2); };

function reset() {
  game.pickCell = null;
  game.selected = null;
  game.anim = null;
  game.swapped = false;
  lastSwap = null;
}

t('wx 全局通道已绑定（真机事件源）', () => {
  assert.ok(wxHandlers.start && wxHandlers.move && wxHandlers.end, '应绑定 wx.onTouchStart/Move/End');
  assert.strictEqual(Object.keys(canvasHandlers).length, 0, 'wx 通道可用时不应再用 canvas 事件通道');
});

t('wx 通道点击：逻辑像素坐标正确选中格子', () => {
  reset();
  tap(0, 0);
  assert.deepStrictEqual(game.pickCell, [0, 0], '点击 (0,0) 应选中（真机坐标归一化正确）');
});

t('wx 通道相邻点击：触发交换', () => {
  reset();
  tap(0, 0);
  tap(0, 1);
  assert.deepStrictEqual(lastSwap, [0, 0, 0, 1], '点相邻格应交换 (0,0)→(0,1)');
  assert.strictEqual(game.pickCell, null, '交换后应清除选中');
});

t('wx 通道滑动：正常触发滑动交换', () => {
  reset();
  swipe(0, 0, 0, 1);
  assert.deepStrictEqual(lastSwap, [0, 0, 0, 1], '滑动应交换 (0,0)→(0,1)');
});

t('toLogic 物理像素坐标自适应（canvas 坐标源兜底）', () => {
  // canvas.width=1125（dpr3）；取超出逻辑宽 375 的物理坐标触发自适应分支
  const p = game.toLogic(1000, 1800);
  assert.strictEqual(Math.round(p.x), Math.round(1000 * LOGIC_W / 1125), '物理像素 x 应按 canvas 宽归一化');
  assert.strictEqual(Math.round(p.y), Math.round(1800 * LOGIC_H / 2001), '物理像素 y 应按 canvas 高归一化');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
