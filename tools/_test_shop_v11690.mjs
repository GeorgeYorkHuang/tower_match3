// v1.16.90 局内商店回归测试：开局 → 点功能条「商店」→ 面板渲染（closeRect 出现）→ 点商品格购买 → 金币扣减
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const store = {};
const wxHandlers = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart(fn) { wxHandlers.start = fn; }, onTouchMove(fn) { wxHandlers.move = fn; }, onTouchEnd(fn) { wxHandlers.end = fn; },
  showToast() {}, showToastWithId() {},
};
const ctx2d = new Proxy({}, { get(t, k) {
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
  if (k === 'measureText') return (s) => ({ width: String(s).length * 14 });
  return () => undefined;
}, set() { return true; } });
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
global.wx.vibrateShort = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const DESIGN = require('../js/config.js').DESIGN;
const LOGIC_W = DESIGN.W, LOGIC_H = DESIGN.H;
const toClient = (lx, ly) => ({ x: lx * 375 / LOGIC_W, y: ly * 667 / LOGIC_H });
const tap = (lx, ly) => {
  const c = toClient(lx, ly);
  wxHandlers.start({ touches: [{ clientX: c.x, clientY: c.y }] });
  wxHandlers.end({ touches: [] });
};

// 开局进入战斗
game.menuStage = 'ancient';
game.newRun();
game.state = 'fighting';
game.render();   // 渲染一帧：生成 funcHits + 底部功能条
const shopBtn = game.funcHits.find((f) => f.key === 'shop');
if (!shopBtn) { console.error('FAIL: 底部功能条没有商店按钮'); process.exit(1); }
// 命中区是闭包，反查矩形：扫描三个功能键 y 区间中心（底部功能条内第三键）
// 直接用 hit 探测：在面板条 y 附近全宽扫描找响应点
let sx = null, sy = null;
for (let y = 0; y < LOGIC_H && !sx; y += 8) {
  for (let x = 0; x < LOGIC_W; x += 8) {
    if (shopBtn.hit(x, y)) { sx = x; sy = y; break; }
  }
}
if (sx === null) { console.error('FAIL: 商店按钮命中区全屏扫描无响应'); process.exit(1); }
tap(sx, sy);
console.log('after shop tap: shopOpen =', game.shopOpen);
if (!game.shopOpen) { console.error('FAIL: 点击商店按钮未打开商店'); process.exit(1); }
// 渲染一帧让面板出现（shopItemRects/shopCloseRect 由渲染填充）
game.render();
if (!game.renderer.shopCloseRect || !(game.renderer.shopItemRects || []).length) {
  console.error('FAIL: 商店面板未渲染（sceneState 缺 shopOpen/store？）');
  process.exit(1);
}
// 购买第一件商品（金币给足）
const ITEM = require('../js/config.js').STORE.items[0];
game.run.gold = 10000;
const r0 = game.renderer.shopItemRects[0];
tap(r0.x + r0.w / 2, r0.y + r0.h / 2);
console.log('after buy: gold =', game.run.gold, ' store.atk =', game.run.store[ITEM.id]);
if (game.run.store[ITEM.id] !== 1) { console.error('FAIL: 购买未生效'); process.exit(1); }
// 关闭商店
const cl = game.renderer.shopCloseRect;
tap(cl.x + cl.w / 2, cl.y + cl.h / 2);
console.log('after close: shopOpen =', game.shopOpen);
if (game.shopOpen) { console.error('FAIL: 关闭按钮未生效'); process.exit(1); }
console.log('PASS');
