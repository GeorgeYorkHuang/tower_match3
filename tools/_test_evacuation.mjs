// v1.16.86 撤离弹层按钮回归测试：渲染一帧 → 模拟点击 撤离/继续 按钮
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

// 构造撤离态：有 run、有收益池
game.state = 'evacuation';
game.menuStage = 'ancient';
game.run = { wave: 10, gold: 120, slotOrder: [], effects: { buildUpgradeQueue: () => [] } };
game.depthPool = 500; game.depthMult = 1.5;
// 渲染一帧填充 evacHits（与真实渲染循环 main.js:930-933 一致）
game.evacHits = {};
game.renderer.evacuationLayer(ctx2d, game, game.evacHits);
console.log('evacGo =', !!game.evacHits.evacGo, ' evacStay =', !!game.evacHits.evacStay);

// 按钮 rect：w=620 x=65 y=(1626-470)/2-40=538；go: (115, 830, 520, 76) stay: (115, 920, 520, 76)
const tap = (lx, ly) => {
  const c = toClient(lx, ly);
  wxHandlers.start({ touches: [{ clientX: c.x, clientY: c.y }] });
  wxHandlers.end({ touches: [] });
};

// 「继续深入」路径：startNextWave 涉及完整波次系统，此处打桩验证分发链（真实对局 run 为完整实例）
let nextWaveCalled = false;
game.startNextWave = () => { nextWaveCalled = true; game.state = 'fighting'; };

// 1) 点「继续深入」
tap(375, 958);
console.log('after stay tap: state =', game.state, ' startNextWave called =', nextWaveCalled);
if (!nextWaveCalled || game.state !== 'fighting') { console.error('FAIL: 继续按钮未生效'); process.exit(1); }

// 2) 回到撤离态，点「安全撤离」→ 应进入 gameover 结算
game.state = 'evacuation';
game.evacHits = {};
game.renderer.evacuationLayer(ctx2d, game, game.evacHits);
tap(375, 868);
console.log('after go tap: state =', game.state, ' payout =', game.runSummary && game.runSummary.payout);
if (game.state !== 'gameover') { console.error('FAIL: 撤离按钮未生效'); process.exit(1); }
console.log('PASS');
