/**
 * talent-gestures.js —— 天赋触摸手势：识别单指拖动、双指缩放和轻点，避免拖动后误触节点。
 * 只接管天赋盘可操作区域；弹窗打开时不接管手势。
 */
'use strict';
const V = require('../../talents/view.js');

function active(g) {
  return g.state === 'menu' && g.menuTab === 'talent' && !g.menuPanel;
}

function points(g, touches) {
  return Array.from(touches || [])
    .map((t, i) => {
      const x = Number.isFinite(t.clientX) ? t.clientX : t.x,
        y = Number.isFinite(t.clientY) ? t.clientY : t.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { ...g.toLogic(x, y), id: t.identifier == null ? i : t.identifier };
    })
    .filter(Boolean);
}

function midpoint(p) {
  return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
}

function distance(p) {
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
}

function seed(g, p) {
  const d = g._talentGesture,
    v = V.ensure(g);
  if (p.length >= 2) {
    d.mode = 'pinch';
    d.moved = true;
    d.mid = midpoint(p);
    d.distance = Math.max(1, distance(p));
    d.view = { ...v };
  } else if (p.length) {
    d.mode = 'pan';
    d.anchor = p[0];
    d.view = { ...v };
  }
}

function begin(g, e) {
  if (!active(g)) return false;
  const p = points(g, e.touches);
  if (!p.length) return false;
  if (!g._talentGesture) {
    if (!p.every(V.contains)) return false;
    g._talentGesture = { down: p[0], moved: false };
  }
  seed(g, p);
  return true;
}

function move(g, e) {
  const d = g._talentGesture;
  if (!d) return false;
  if (!active(g)) {
    g._talentGesture = null;
    return true;
  }
  const p = points(g, e.touches);
  if (!p.length) return true;
  if (p.length >= 2) {
    if (d.mode !== 'pinch') {
      seed(g, p);
      return true;
    }
    const mid = midpoint(p),
      zoom = Math.max(V.minZoom, Math.min(V.maxZoom, (d.view.zoom * distance(p)) / d.distance)),
      cx = V.viewport.x + V.viewport.w / 2,
      cy = V.viewport.y + V.viewport.h / 2;
    // 保持双指中点下的棋盘内容稳定，缩放时同步补偿平移。
    g.talentView = V.normalize({
      zoom,
      x: mid.x - cx - ((d.mid.x - cx - d.view.x) * zoom) / d.view.zoom,
      y: mid.y - cy - ((d.mid.y - cy - d.view.y) * zoom) / d.view.zoom,
    });
    d.moved = true;
    return true;
  }
  if (d.mode !== 'pan') {
    seed(g, p);
    return true;
  }
  const dx = p[0].x - d.anchor.x,
    dy = p[0].y - d.anchor.y;
  if (Math.hypot(dx, dy) > 7) d.moved = true;
  if (d.moved)
    g.talentView = V.normalize({ zoom: d.view.zoom, x: d.view.x + dx, y: d.view.y + dy });
  return true;
}

function end(g, e) {
  const d = g._talentGesture;
  if (!d) return false;
  // 部分适配器的 touches 仍含已抬起手指，按 changedTouches 的标识排除。
  const ended = points(g, e.changedTouches),
    ids = new Set(ended.map((p) => p.id)),
    remaining = points(g, e.touches).filter((p) => !ids.has(p.id));
  if (remaining.length && active(g)) {
    d.moved = true;
    seed(g, remaining);
    return true;
  }
  g._talentGesture = null;
  const last = ended[0];
  if (last && Math.hypot(last.x - d.down.x, last.y - d.down.y) > 7) d.moved = true;
  // 等抬手且确认没有拖动后才派发轻点，避免移动天赋盘时弹出详情。
  if (!d.moved && active(g)) g.dispatchTouch(d.down);
  return true;
}

function cancel(g) {
  g._talentGesture = null;
}

module.exports = { begin, move, end, cancel };
