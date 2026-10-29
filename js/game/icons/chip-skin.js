/**
 * 方块皮肤：底板 × 图案 两层查表（v1.17.44）
 *
 * 资产结构（assets/images/board2/）：
 *   base_<color>.png            6 张无符号玻璃底板
 *   glyph_<part>.png            普通图案（flame/snow/flask/bolt/blade/bomb）
 *   tint/<color>/<glyph>.png    特殊图案，已按来源色染好（row/col/cross/split/sub/rand/rainbow）
 *
 * 特殊块结构：{ c: 来源色, s: 形状, sub?: true }；rainbow 的 c 为 null，用红底板 + 六色图案。
 * 子雷：s === 'split' && sub === true → 用 sub.png。
 *
 * 纯查表，不做运行时染色；图未就绪由 render.js 的 drawImg 返回 false 后回退旧整图。
 */
'use strict';

const DIR = 'assets/images/board2/';
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const SHAPES = ['row', 'col', 'cross', 'split', 'sub', 'rand', 'rainbow'];
const NORMAL_PART = {
  red: 'flame', blue: 'snow', green: 'flask',
  yellow: 'bolt', purple: 'blade', orange: 'bomb',
};
const FALLBACK_COLOR = 'red';   // rainbow 特殊块的底板色（图案自带六色）

const BASES = {};
const NORMALS = {};
for (let i = 0; i < COLORS.length; i++) {
  const c = COLORS[i];
  BASES[c] = DIR + 'base_' + c + '.png';
  NORMALS[c] = DIR + 'glyph_' + NORMAL_PART[c] + '.png';
}

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

/** 特殊块底板色（rainbow 用红底） */
function baseColorOf(piece) {
  const c = piece && piece.c;
  return c && BASES[c] ? c : FALLBACK_COLOR;
}

/** 普通块图案路径 */
function normalSrc(color) {
  return NORMALS[color] || NORMALS[FALLBACK_COLOR];
}

/** 特殊块图案路径（已染色版本） */
function specialSrc(piece) {
  const shape = shapeOf(piece);
  if (!shape) return null;
  return DIR + 'tint/' + baseColorOf(piece) + '/' + shape + '.png';
}

/** 全部资产路径（预载用；54 张 = 底板6 + 普通6 + 特殊 6色x7形） */
function assets() {
  const out = [];
  for (let i = 0; i < COLORS.length; i++) out.push(BASES[COLORS[i]]);
  for (let i = 0; i < COLORS.length; i++) out.push(NORMALS[COLORS[i]]);
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = 0; j < SHAPES.length; j++) {
      out.push(DIR + 'tint/' + COLORS[i] + '/' + SHAPES[j] + '.png');
    }
  }
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
