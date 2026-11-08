/**
 * mail-rail.js —— 邮箱滚动条交互：支持拖动滑块及点击轨道定位邮件列表。
 * 与列表滑动、底部按钮手势互斥，并在弹窗或档案变化后停止处理。
 */
'use strict';
const UI = require('../../config/mail-ui.js');

// 持续校验弹窗对象和存档键，切换账号或关闭邮箱后不再改动滚动位置。
function active(g, d) {
  return (
    g.state === 'menu' &&
    g.menuPanel &&
    g.menuPanel.type === 'accountMail' &&
    (!d || (g.menuPanel === d.panel && (g.save && g.save.storageKey) === d.storageKey))
  );
}

function metrics(g) {
  return UI.scrollbar(g.meta.mails || [], g.menuPanel.scrollY || 0);
}

// 按抓取位置计算滑块比例，再换算为内容偏移；首尾均限制在有效范围内。
function apply(g, d, p) {
  if (!p || d.cancelled || !active(g, d)) return;
  const m = metrics(g),
    travel = m.track.h - m.thumb.h;
  g.menuPanel.scrollY =
    m.max > 0 && travel > 0
      ? Math.max(0, Math.min(1, (p.y - m.track.y - d.grab * m.thumb.h) / travel)) * m.max
      : 0;
}

// 抓住滑块时保留手指在滑块内的位置；点击空轨道则把滑块中心移向触点。
function begin(g, p, count = 1) {
  const d = g._mailRailGesture;
  if (d) {
    if (count > 1) d.cancelled = true;
    return true;
  }
  if (!active(g) || count > 1) return false;
  const m = metrics(g),
    hit = m.hit;
  if (m.max <= 0 || p.x < hit.x || p.x > hit.x + hit.w || p.y < hit.y || p.y > hit.y + hit.h)
    return false;
  require('./panel-scroll.js').cancel(g);
  require('./mail-buttons.js').cancel(g);
  const onThumb = p.y >= m.thumb.y && p.y <= m.thumb.y + m.thumb.h;
  g._mailRailGesture = {
    panel: g.menuPanel,
    storageKey: g.save && g.save.storageKey,
    grab: onThumb ? (p.y - m.thumb.y) / m.thumb.h : 0.5,
    cancelled: false,
  };
  apply(g, g._mailRailGesture, p);
  return true;
}

function move(g, p) {
  const d = g._mailRailGesture;
  if (!d) return false;
  if (!active(g, d)) d.cancelled = true;
  apply(g, d, p);
  return true;
}

function end(g, p) {
  const d = g._mailRailGesture;
  if (!d) return false;
  apply(g, d, p);
  g._mailRailGesture = null;
  return true;
}

function cancel(g) {
  g._mailRailGesture = null;
}

function held(g) {
  return !!(g._mailRailGesture && !g._mailRailGesture.cancelled && active(g, g._mailRailGesture));
}

module.exports = { begin, move, end, cancel, held };
