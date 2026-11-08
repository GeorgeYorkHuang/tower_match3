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
 * 纯查表，不做运行时染色；图未就绪由 render.js 的 drawImg 返回 false 后回退旧整图。
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
