/**
 * 方块皮肤：来源色底板 × 统一图案 两层查表
 *
 * 资产结构（assets/images/interface/chips/）：
 *   garden-v2/base_<color>.png  6 张圣坛花园晶石底板（旧版底板保留）
 *   garden-v2/glyph_<part>.png 新版普通元素图标（flame/snow/flask/bolt/blade/bomb）
 *   special-garden-v3/glyph_<shape>.png 四消图案（row/col/cross/split/sub/rand）
 *   glyph_rainbow.png           彩虹图案保持独立
 *
 * 特殊块结构：{ c: 来源色, s: 形状, sub?: true }；rainbow 的 c 为 null，只绘制六色图案，不绘制底板。
 * 子雷：s === 'split' && sub === true；与父雷共用核心造型，仅去掉外围四个小球。
 *
 * 特殊图案可按来源色生成缓存；离屏像素读写不可用时直接绘制原图，绝不返回空白成功结果。
 */
'use strict';

const DIR = 'assets/images/interface/chips/';
// 新版底板与原有元素图案分开维护，保留旧资源便于回退。
const BASE_DIR = DIR + 'garden-v2/';
// 普通元素使用新版独立图标；特殊块继续使用原有功能图案。
const GLYPH_DIR = DIR + 'garden-v2/';
// 四消图标使用亮青色与深色粗轮廓增强辨识度，彩虹仍使用原图。
const SPECIAL_DIR = DIR + 'special-garden-v3/';
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const SHAPES = ['row', 'col', 'cross', 'split', 'sub', 'rand', 'rainbow'];
const NORMAL_PART = {
  red: 'flame', blue: 'snow', green: 'flask',
  yellow: 'bolt', purple: 'blade', orange: 'bomb',
};
const FALLBACK_COLOR = 'red';   // 未知来源色的底板回退（彩虹不绘制底板）

const BASES = {};
const NORMALS = {};
for (let i = 0; i < COLORS.length; i++) {
  const c = COLORS[i];
  BASES[c] = BASE_DIR + 'base_' + c + '.png';
  NORMALS[c] = GLYPH_DIR + 'glyph_' + NORMAL_PART[c] + '.png';
}

// 炮塔保留 orange 来源色，显示改为灰铜色，与火焰的红色底板拉开差异。
BASES.orange = BASE_DIR + 'base_cannon-bronze-v3.png';

let _loadImage = null;
let _preloaded = false;

function configure(opts) {
  opts = opts || {};
  if (opts.loadImage) _loadImage = opts.loadImage;
}

/** 特殊块形状 → 图案名（子雷归到 sub） */
function shapeOf(piece) {
  const s = piece && piece.s;
  if (s === 'split' && piece.sub) return 'sub';
  return s && SHAPES.indexOf(s) >= 0 ? s : null;
}

/** 特殊块来源色（彩虹不绘制底板） */
function baseColorOf(piece) {
  const c = piece && piece.c;
  return c && BASES[c] ? c : FALLBACK_COLOR;
}

/** 普通块图案路径 */
function normalSrc(color) {
  return NORMALS[color] || NORMALS[FALLBACK_COLOR];
}

/** 特殊块图案路径（不再引用已删除的tint六色副本） */
function specialSrc(piece) {
  const shape = shapeOf(piece);
  if (!shape) return null;
  if(shape!=='rainbow' && piece.c && BASES[piece.c])return 'chip-tint:'+piece.c+':'+shape;
  return (shape === 'rainbow' ? DIR : SPECIAL_DIR) + 'glyph_' + shape + '.png';
}

/** 全部资产路径（预载用；19 张 = 底板6 + 普通6 + 特殊7，彩虹仅一张） */
function assets() {
  const out = [];
  for (let i = 0; i < COLORS.length; i++) out.push(BASES[COLORS[i]]);
  for (let i = 0; i < COLORS.length; i++) out.push(NORMALS[COLORS[i]]);
  for (let i = 0; i < SHAPES.length; i++) out.push(specialSrc({ s: SHAPES[i] }));
  return out;
}

/** 一次性预载（包内文件，无网络延迟） */
function preload() {
  if (_preloaded || !_loadImage) return;
  _preloaded = true;
  const list = assets();
  for (let i = 0; i < list.length; i++) _loadImage(list[i]);
}

module.exports = {
  COLORS, SHAPES, BASES, NORMALS,
  configure, preload, assets,
  shapeOf, baseColorOf, normalSrc, specialSrc,
};

// 缓存最多六色×六种四消图案；失败后关闭像素着色，避免真机每帧重复读回/抛错。
const tintCache = {};
let tintUnavailable = false;
const tintRGB = {red:[255,90,75],blue:[80,170,255],green:[80,230,130],yellow:[255,220,65],purple:[190,110,255],orange:[238,157,80]};

function tintCanvas(width, height) {
  if (typeof wx !== 'undefined') {
    if (wx.createOffscreenCanvas) return wx.createOffscreenCanvas({ type: '2d', width, height });
  }
  return typeof document !== 'undefined' ? document.createElement('canvas') : null;
}

function drawTint(ctx, src, x, y, w, h) {
  const [, color, shape] = src.split(':'), key = color + ':' + shape;
  if (!tintRGB[color] || !SHAPES.includes(shape) || shape === 'rainbow') return false;
  const img = _loadImage && _loadImage(SPECIAL_DIR + 'glyph_' + shape + '.png');
  // 图片尚未加载属于暂态，不能永久关闭着色或缓存空白。
  if (!img || !(img.width > 0 && img.height > 0)) return false;
  let canvas = tintCache[key];
  if (!canvas && !tintUnavailable) {
    try {
      canvas = tintCanvas(img.width, img.height);
      if (!canvas) throw new Error('No offscreen canvas');
      canvas.width = img.width; canvas.height = img.height;
      const c = canvas.getContext('2d');
      if (!c || !c.getImageData || !c.putImageData) throw new Error('No pixel readback');
      c.drawImage(img, 0, 0);
      const data = c.getImageData(0, 0, canvas.width, canvas.height);
      const d = data && data.data, rgb = tintRGB[color];
      if (!d || d.length !== canvas.width * canvas.height * 4) throw new Error('Invalid pixel buffer');
      let visible = false;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        visible = true;
        const value = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
        const white = Math.max(0, (Math.min(d[i], d[i + 1], d[i + 2]) / 255 - 0.65) / 0.35) * 0.65;
        for (let k = 0; k < 3; k++) d[i + k] = Math.round((rgb[k] * (1 - white) + 255 * white) * value);
      }
      // 部分绘制环境读回全透明且不抛错：不得把空画布当作已着色图标缓存。
      if (!visible) throw new Error('Empty pixel readback');
      c.putImageData(data, 0, 0);
      tintCache[key] = canvas;
    } catch (e) {
      tintUnavailable = true;
      canvas = null;
    }
  }
  if (canvas) {
    try { ctx.drawImage(canvas, x, y, w, h); return true; }
    catch (e) { delete tintCache[key]; tintUnavailable = true; }
  }
  // 着色不可用时保留功能图案，来源色仍由底板表达。
  ctx.drawImage(img, x, y, w, h);
  return true;
}
module.exports.drawTint = drawTint;
