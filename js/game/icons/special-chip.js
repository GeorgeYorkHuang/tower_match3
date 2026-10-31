/**
 * v1.17.35 特殊方块染色贴图模块（双层：body 中性玻璃体 + mark 深色描边刻印）
 *
 * 设计依据（art/special_blocks_v1/chroma2 已定稿验收，v1.17.34）：
 *   - 一套中性灰母版承载「玻璃质感 / 高光 / 体积」，运行时按来源色以 source-atop 染色
 *     （α0.78：0.78 × 来源色 + 0.22 × 母版灰度，高光与暗面得以保留）
 *   - mark 层只含描边与中心刻印，恒深色、不参与染色，因此六色下轮廓符号依旧可读
 *   - 轮廓谱系（灰度可辨）：扁横条 row / 竖条 col / 方头十字 cross / 八角 split /
 *     长尖头十字 sub / 菱形 rand / 六角星 rainbow
 *
 * 组合数：6 形 × 6 色 = 36，加 rainbow 整图 1，共 37 张按需离屏合成为缓存位图，
 * 绘制时单次 drawImage（成本与现在的「底图 + 矢量徽记」相当甚至更低）。
 *
 * 依赖注入：图片加载与离屏画布均由宿主（render.js）提供，避免与 render.js 循环依赖，
 * 也保证与棋盘底图共用同一份图片缓存。
 */
'use strict';

/** 与 render.js TOWER_HEX 同源的六色（染色统一取自六塔主色，保证与塔/技能视觉一致） */
const TINT = {
  red: '#ff6b6b', blue: '#5dade2', green: '#58d68d',
  yellow: '#f4d03f', purple: '#af7ac5', orange: '#e67e22',
};
const TINT_ALPHA = 0.78;
const RES = 128;   // 离屏合成分辨率（显示 56 逻辑 px，最高 DPR 场景约 150 物理 px）

const DIR = 'assets/images/interface/board/special/';
const BODY = {
  cross: DIR + 'body_cross.png', split: DIR + 'body_split.png', sub: DIR + 'body_sub.png',
  row: DIR + 'body_row.png', col: DIR + 'body_col.png', rand: DIR + 'body_rand.png',
  rainbow: DIR + 'body_rainbow.png',
};
const MARK = {
  cross: DIR + 'mark_cross.png', split: DIR + 'mark_split.png', sub: DIR + 'mark_sub.png',
  row: DIR + 'mark_row.png', col: DIR + 'mark_col.png', rand: DIR + 'mark_rand.png',
};

let _loadImage = null;     // (src) => img|null，img.width>0 视为就绪
let _createCanvas = null;  // () => canvas|null（离屏）
const _chipCache = {};     // 'shape|color' => canvas（仅缓存成功结果）
let _preloaded = false;

function configure(deps) {
  _loadImage = deps.loadImage || null;
  _createCanvas = deps.createCanvas || null;
}

/** 型别归一：split + sub 走独立「子雷」贴图 */
function shapeOf(piece) {
  if (!piece) return null;
  if (piece.s === 'rainbow') return 'rainbow';
  if (piece.s === 'split' && piece.sub) return 'sub';
  return BODY[piece.s] ? piece.s : null;
}

function makeOffscreen() {
  if (!_createCanvas) return null;
  let cv = null;
  try { cv = _createCanvas(); } catch (e) { return null; }
  if (!cv) return null;
  // 首次 wx.createCanvas() 会返回主画布；若拿到主画布则放弃（不能污染屏幕）
  if (typeof GameGlobal !== 'undefined' && GameGlobal.__mainCanvas && cv === GameGlobal.__mainCanvas) return null;
  cv.width = RES; cv.height = RES;
  return cv;
}

/** source-atop 能力探测（个别基础库对合成模式支持不全，不支持则整体回退矢量徽记）。
 *  不做结果缓存：每个组合只合成一次，探测成本可忽略，且便于换机型/测试环境复检。 */
function canComposite(ctx) {
  try {
    ctx.globalCompositeOperation = 'source-atop';
    const ok = ctx.globalCompositeOperation === 'source-atop';
    ctx.globalCompositeOperation = 'source-over';
    return ok;
  } catch (e) { return false; }
}

/** 预加载全部贴图（进入棋盘前调用一次，避免首帧集体回退矢量徽记） */
function preload() {
  if (_preloaded || !_loadImage) return;
  _preloaded = true;
  Object.keys(BODY).forEach((k) => _loadImage(BODY[k]));
  Object.keys(MARK).forEach((k) => _loadImage(MARK[k]));
}

/**
 * 取合成好的染色贴图（canvas）；未就绪/不支持合成/无此型别返回 null，调用方回退旧绘制。
 * @param {{c?:string,s:string,sub?:boolean}} piece 棋盘格特殊块数据
 */
function specialChip(piece) {
  const shape = shapeOf(piece);
  if (!shape || !_loadImage) return null;
  const color = shape === 'rainbow' ? 'rainbow' : (piece.c || piece.tint || null);
  const key = shape + '|' + color;
  if (key in _chipCache) return _chipCache[key];

  preload();   // 首格绘制触发全量预载
  const bodyImg = _loadImage(BODY[shape]);
  const needMark = !!MARK[shape];
  const markImg = needMark ? _loadImage(MARK[shape]) : null;
  if (!bodyImg || !(bodyImg.width > 0)) return null;                    // 还在下载
  if (needMark && (!markImg || !(markImg.width > 0))) return null;      // mark 未就绪，先回退

  const cv = makeOffscreen();
  if (!cv) return null;
  const c2 = cv.getContext('2d');
  if (!c2) return null;
  // 染色依赖 source-atop；不支持则整块回退矢量徽记（否则会画出无颜色的灰块）
  const tinted = color !== 'rainbow' && !!TINT[color];
  if (tinted && !canComposite(c2)) return null;

  c2.clearRect(0, 0, RES, RES);
  c2.drawImage(bodyImg, 0, 0, RES, RES);
  if (tinted) {
    c2.save();
    c2.globalCompositeOperation = 'source-atop';
    c2.globalAlpha = TINT_ALPHA;
    c2.fillStyle = TINT[color];
    c2.fillRect(0, 0, RES, RES);
    c2.restore();
  }
  if (markImg) c2.drawImage(markImg, 0, 0, RES, RES);

  _chipCache[key] = cv;
  return cv;
}

/** 诊断用：当前已缓存的组合键（测试脚本断言用） */
function cachedKeys() { return Object.keys(_chipCache); }

module.exports = { configure, preload, specialChip, cachedKeys, TINT, RES };
