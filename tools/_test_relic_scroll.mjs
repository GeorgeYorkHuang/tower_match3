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
const ctx2d = new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return () => undefined; }, set() { return true; } });
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const DESIGN = require('../js/config.js').DESIGN;
const LOGIC_W = DESIGN.W, LOGIC_H = DESIGN.H;
const toClient = (lx, ly) => ({ x: lx * 375 / LOGIC_W, y: ly * 667 / LOGIC_H });

// 进入圣遗物页
game.state = 'menu'; game.menuTab = 'relic'; game.menuPanel = null;
// 先渲染一帧建立 menuHits + _relicMaxScroll
game.renderer.menuLayer(ctx2d, game.menuState(), game.menuHits);
console.log('maxScroll =', game.renderer._relicMaxScroll);

const start = toClient(375, 800);
wxHandlers.start({ touches: [{ clientX: start.x, clientY: start.y }] });
for (let dy = 20; dy <= 200; dy += 20) {
  const p = toClient(375, 800 - dy);   // 上滑 → scroll 增大
  wxHandlers.move({ touches: [{ clientX: p.x, clientY: p.y }] });
}
console.log('after drag up: relicScroll =', game.relicScroll);
wxHandlers.end({ touches: [] });
console.log('after end: relicScroll =', game.relicScroll, '_relicDrag =', game._relicDrag);
if (!(game.relicScroll > 0)) { console.error('FAIL: 拖动未生效'); process.exit(1); }
console.log('PASS');
