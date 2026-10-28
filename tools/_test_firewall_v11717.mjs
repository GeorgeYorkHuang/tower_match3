// v1.17.17 回归：火墙 4 帧贴图接入
//  ① 贴图可用时：12fps 循环取帧、主体 source-over + 45% lighter 辉光叠加、尺寸 180x56、底边贴地面线
//  ② 贴图缺失时：回退程序化绘制，不崩、不出现空墙
//  ③ 4 张帧资源均已登记在 IMG_SRC
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const store = {};
let imagesAvailable = true;      // 控制 createImage 是否"加载成功"
const drawnImages = [];          // 记录 drawImage 调用
const compSeq = [];              // 记录 globalCompositeOperation 设置序列
let alphaSeq = [];

const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'drawImage') return (img, x, y, w, h) => { drawnImages.push({ src: img.src, x, y, w, h }); };
    if (k === 'fillRect') return () => { drawnImages.push({ src: '__fillRect__' }); };
    if (k === 'arc' || k === 'ellipse') return () => undefined;
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 14 });
    if (k === 'fillText') return () => undefined;
    if (k === 'save') return () => { compSeq.push('save'); };
    if (k === 'restore') return () => { compSeq.push('restore'); };
    return () => undefined;
  },
  set(t, k, v) {
    if (k === 'globalCompositeOperation') compSeq.push(v);
    return true;
  },
});

global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  createImage() {
    const img = { onload: null, onerror: null, src: '' };
    Object.defineProperty(img, 'width', { get: () => (imagesAvailable ? 512 : 0) });
    Object.defineProperty(img, 'height', { get: () => (imagesAvailable ? 160 : 0) });
    return img;
  },
};
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: () => {} };
global.GameGlobal = {}; global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const R = game.renderer;
const { IMG_SRC } = require('../js/game/render.js');

// ---- ③ 资源登记 ----
for (let i = 1; i <= 4; i++) {
  const src = IMG_SRC['firewall' + i];
  if (!src || !src.includes('anim_firewall_0' + i)) {
    console.error(`FAIL: IMG_SRC.firewall${i} 未登记`, src); process.exit(1);
  }
}
console.log('③ 4 张帧资源已登记 OK');

// ---- ① 贴图命中路径 ----
const wall = { x: 375, y: 500, w: 180, h: 45, dur: 6, t: 0, seed: 0 };
drawnImages.length = 0; compSeq.length = 0;
R.fxFireWall(ctx2d, wall);
const sprite = drawnImages.find((d) => d.src && d.src.includes('anim_firewall'));
if (!sprite) { console.error('FAIL: 未绘制火墙贴图', drawnImages); process.exit(1); }
if (!compSeq.includes('lighter')) { console.error('FAIL: 未启用加法混合 lighter', compSeq); process.exit(1); }
// 尺寸：宽=墙宽180，高=180*160/512≈56
if (Math.abs(sprite.w - 180) > 0.5) { console.error('FAIL: 贴图宽应=墙宽180，实际', sprite.w); process.exit(1); }
if (Math.abs(sprite.h - Math.round(180 * 160 / 512)) > 0.5) { console.error('FAIL: 贴图高不符 512:160 比例，实际', sprite.h); process.exit(1); }
// 底边对齐地面线 cy + h/2 = 522.5
const bottom = sprite.y + sprite.h;
if (Math.abs(bottom - (500 + 45 / 2)) > 1) { console.error('FAIL: 贴图底边未对齐地面线，实际', bottom, '期望', 522.5); process.exit(1); }
// 水平居中
if (Math.abs(sprite.x + sprite.w / 2 - 375) > 0.5) { console.error('FAIL: 贴图未水平居中'); process.exit(1); }
console.log(`① 贴图绘制 OK（${sprite.w}x${sprite.h}，底边 ${bottom}，lighter 混合）`);

// 帧序：12fps 下 0 / 1/12 / 2/12 / 3/12 秒应依次取第 1..4 帧，并回到第 1 帧
const frameAt = (t) => {
  drawnImages.length = 0;
  R.fxFireWall(ctx2d, { ...wall, t });
  const d = drawnImages.find((v) => v.src && v.src.includes('anim_firewall'));
  return d ? d.src.replace(/.*anim_firewall_0?/, '').replace('.png', '') : null;
};
const seq = [0, 1 / 12 + 0.001, 2 / 12 + 0.001, 3 / 12 + 0.001, 4 / 12 + 0.001].map(frameAt);
if (seq.join(',') !== '1,2,3,4,1') {
  console.error('FAIL: 12fps 帧序不符，实际', seq.join(',')); process.exit(1);
}
console.log('① 12fps 循环帧序 1→2→3→4→1 OK');

// ---- ② 回退路径 ----
imagesAvailable = false;
drawnImages.length = 0; compSeq.length = 0;
let crashed = false;
try { R.fxFireWall(ctx2d, { ...wall, t: 1 }); } catch (e) { crashed = true; console.error('回退异常:', e.message); }
if (crashed) process.exit(1);
if (compSeq.includes('lighter')) { console.error('FAIL: 回退路径不应出现 lighter 辉光叠加（v1.17.18 辉光仅在有贴图时叠加）', compSeq); process.exit(1); }
if (drawnImages.some((d) => d.src && d.src.includes('anim_firewall'))) {
  console.error('FAIL: 贴图缺失时仍绘制了贴图'); process.exit(1);
}
if (drawnImages.filter((d) => d.src === '__fillRect__').length < 3) {
  console.error('FAIL: 贴图缺失时未回退程序化火焰条', drawnImages); process.exit(1);
}
console.log('② 贴图缺失回退程序化绘制 OK');

console.log('PASS');
