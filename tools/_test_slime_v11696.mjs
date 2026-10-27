// v1.16.96 lv1 史莱姆 6 帧动画回归：非等时长表 [140,160,200,310,200,220]ms 切帧 + 6 帧宽裁剪
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  createImage() { return { width: 576, height: 96, onload: null, onerror: null, set src(v) {} }; },
};
const drawCalls = [];
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 14 });
    if (k === 'drawImage') return (img, sx, sy, sw, sh, dx, dy, dw, dh) => { drawCalls.push([sx, sw]); };
    return () => undefined;
  },
  set() { return true; },
});
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;

const realNow = Date.now;
const draw = (tMs) => { Date.now = () => tMs; drawCalls.length = 0; game.renderer.drawEnemyAnim(ctx2d, 'assets/images/enemies/lv1.png', { id: 0 }, 0, 0, 40, false, 1); return drawCalls[0]; };
try {
  // 期望帧边界（6 帧累计：0/140/300/500/810/1010，总 1230ms 循环）
  const cases = [[0, 0], [139, 0], [140, 96], [299, 96], [300, 192], [499, 192], [500, 288], [809, 288], [810, 384], [1009, 384], [1010, 480], [1229, 480], [1230, 0]];
  for (const [t, wantSx] of cases) {
    const [sx, sw] = draw(t);
    if (sx !== wantSx || sw !== 96) { console.error(`FAIL t=${t}: sx=${sx}(期望${wantSx}) fw=${sw}(期望96)`); process.exit(1); }
  }
  console.log('6 帧切帧边界全部正确（fw=96，总周期 1230ms）');
  // 其他等级仍走 5 帧等时长路径（fw = width/5）
  Date.now = () => 0;
  drawCalls.length = 0;
  game.renderer.drawEnemyAnim(ctx2d, 'assets/images/enemies/lv2.png', { id: 0 }, 0, 0, 40, false, 2);
  const [, sw2] = drawCalls[0] || [];
  console.log('lv2 5 帧路径 fw =', sw2, '(期望 width/5 = 115.2 若图未加载则为 undefined)');
} finally {
  Date.now = realNow;
}
console.log('PASS');
