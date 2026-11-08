/**
 * view.js —— 天赋视图坐标：统一棋盘绘制、点击命中和触摸手势的缩放、平移规则。
 * 集中定义可操作区域、默认倍率、拖动边界及外围金色天赋的位置。
 */
'use strict';
// 绘制、命中检测和手势都以同一可操作区域为准。
const viewport = { x: 20, y: 475, w: 710, h: 920 };
const center = { x: 375, y: 930 },
  cell = 38 * 1.2,
  minZoom = 0.7,
  maxZoom = 2.6,
  defaultZoom = 1.2;
// 以外圈绿点的边缘间距推算金槽距离，避免金槽与天赋盘过近或过远。
const goldRadius = 56 * 0.8 * (cell / 38),
  outerNodeRadius = 0.79 * cell;
const nodeGap = Math.sqrt(3) * (cell - outerNodeRadius);
const goldRing =
  5 + ((Math.sqrt(3) / 2) * (goldRadius + outerNodeRadius) + nodeGap) / (Math.sqrt(3) * cell);
const halfWidth = Math.sqrt(3) * cell * goldRing + goldRadius,
  halfHeight = 1.5 * cell * goldRing + goldRadius;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// 平移上限随缩放变化，避免把整张天赋盘拖出可操作区域。
function normalize(view) {
  const z = clamp(Number.isFinite(view && view.zoom) ? view.zoom : defaultZoom, minZoom, maxZoom),
    maxX = Math.max(0, halfWidth * z - viewport.w / 2),
    maxY = Math.max(0, halfHeight * z - viewport.h / 2);
  return {
    zoom: z,
    x: clamp(Number.isFinite(view && view.x) ? view.x : 0, -maxX, maxX),
    y: clamp(Number.isFinite(view && view.y) ? view.y : 0, -maxY, maxY),
  };
}

function ensure(game) {
  game.talentView = normalize(game.talentView);
  return game.talentView;
}

function contains(p) {
  return (
    p &&
    p.x >= viewport.x &&
    p.x <= viewport.x + viewport.w &&
    p.y >= viewport.y &&
    p.y <= viewport.y + viewport.h
  );
}

// 棋盘原始坐标转换为逻辑屏幕坐标，供点击命中和弹窗锚点共用。
function screen(view, x, y) {
  const v = normalize(view);
  return {
    x: viewport.x + viewport.w / 2 + v.x + (x - center.x) * v.zoom,
    y: viewport.y + viewport.h / 2 + v.y + (y - center.y) * v.zoom,
  };
}

function reset(game) {
  game.talentView = normalize(null);
  game._talentGesture = null;
}

module.exports = {
  viewport,
  center,
  cell,
  goldRadius,
  goldRing,
  minZoom,
  maxZoom,
  defaultZoom,
  normalize,
  ensure,
  contains,
  screen,
  reset,
};
