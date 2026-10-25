// v1.16.87 圣遗物详情页/图鉴页重渲染冒烟：断言无异常
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
};
const ctx2d = new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'measureText') return (s) => ({ width: String(s).length * 14 }); return () => undefined; }, set() { return true; } });
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const CONFIG = require('../js/config.js');

// 取一个圣遗物 id，构造已解锁 1★ + 有碎片的状态
const cat = CONFIG.RELIC_RUN.tower;
const id = cat[Object.keys(cat)[0]][0].id;
game.state = 'menu'; game.menuTab = 'relic'; game.menuPanel = null;
const ms = game.menuState();
ms.shards[id] = 12; ms.relicStars[id] = 1;
// 1) 图鉴网格页
game.renderer.menuLayer(ctx2d, ms, game.menuHits);
console.log('grid render OK');
// 2) 详情面板
game.menuPanel = { type: 'relicInfo', id };
const ms2 = game.menuState();
ms2.shards[id] = 12; ms2.relicStars[id] = 1;
game.renderer.menuLayer(ctx2d, ms2, game.menuHits);
console.log('relicInfo panel render OK');
// 3) 满级态（3★）
const ms3 = game.menuState();
ms3.shards[id] = 99; ms3.relicStars[id] = 3;
game.menuPanel = { type: 'relicInfo', id };
game.renderer.menuLayer(ctx2d, ms3, game.menuHits);
console.log('relicInfo max-star render OK');
console.log('PASS');
