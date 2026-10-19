/**
 * test_touch.mjs —— 三消触摸交互测试（mock canvas 事件，验证点击交换 + 滑动共存）
 * 运行：node tools/test_touch.mjs
 */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);

const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; },
  setStorageSync(k, v) { store[k] = v; },
};
const ctx2d = new Proxy({}, { get() { return () => undefined; }, set() { return true; } });
const handlers = {};
global.canvas = { width: 375, height: 667, getContext: () => ctx2d, addEventListener: (t, fn) => { handlers[t] = fn; } };
global.GameGlobal = {};
global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;

/* 新状态机：初始在主界面，触摸用例先进战斗 */
game.newRun(true);

/* 逻辑坐标 → 物理坐标（真机 canvas 缩放 scale） */
const { boardX, boardY, cell } = game.ly;
const S = game.scale;
const phys = (lx, ly) => ({ x: lx * S, y: ly * S });
const center = (r, c) => phys(boardX + c * cell + cell / 2, boardY + r * cell + cell / 2);

function tap(r, c) {
  const p = center(r, c);
  handlers.touchstart({ touches: [{ clientX: p.x, clientY: p.y }] });
  handlers.touchend({ touches: [] });
}
function swipe(r1, c1, r2, c2) {
  const a = center(r1, c1), b = center(r2, c2);
  handlers.touchstart({ touches: [{ clientX: a.x, clientY: a.y }] });
  handlers.touchmove({ touches: [{ clientX: b.x, clientY: b.y }] });
  handlers.touchend({ touches: [] });
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

/* spy match3.trySwap 记录最近调用 */
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

t('点击一次：选中格子（pickCell 高亮）', () => {
  reset();
  tap(0, 0);
  assert.deepStrictEqual(game.pickCell, [0, 0], '首次点击应选中 (0,0)');
  assert.strictEqual(lastSwap, null, '选中不应触发交换');
});

t('点击同一格：取消选中', () => {
  reset();
  tap(0, 0); tap(0, 0);
  assert.strictEqual(game.pickCell, null, '点同一格应取消选中');
});

t('点击相邻格：触发交换', () => {
  reset();
  tap(0, 0);
  assert.deepStrictEqual(game.pickCell, [0, 0], '前置：已选中 (0,0)');
  tap(0, 1);
  assert.deepStrictEqual(lastSwap, [0, 0, 0, 1], '点相邻格应尝试交换 (0,0)→(0,1)');
  assert.strictEqual(game.pickCell, null, '交换后应清除选中');
});

t('点击不相邻格：重选到新格', () => {
  reset();
  tap(0, 0);
  tap(2, 2);
  assert.deepStrictEqual(game.pickCell, [2, 2], '点不相邻格应重选到 (2,2)');
  assert.strictEqual(lastSwap, null, '不相邻不应触发交换');
});

t('滑动交换：滑动清除点击选中并正常交换', () => {
  reset();
  tap(0, 0); // 先有点击选中
  assert.deepStrictEqual(game.pickCell, [0, 0], '前置：已选中 (0,0)');
  swipe(0, 0, 0, 1); // 滑动到相邻格
  assert.deepStrictEqual(lastSwap, [0, 0, 0, 1], '滑动应触发交换 (0,0)→(0,1)');
  assert.strictEqual(game.pickCell, null, '滑动后应清除点击选中');
});

t('波次结束（非战斗态）点击不残留选中', () => {
  reset();
  game.state = 'waveclear';
  tap(0, 0);
  game.state = 'fighting';
  assert.strictEqual(game.pickCell, null, '非战斗态点击不应选中');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
