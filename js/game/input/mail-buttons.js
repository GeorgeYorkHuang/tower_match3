/**
 * mail-buttons.js —— 邮箱按钮手势：为底部批量领取、批量删除提供按下反馈和抬手确认。
 * 拖动、取消、多指触摸或切换档案后取消操作，避免误领取或误删除。
 */
'use strict';
const keys = ['accountMailClaimAll', 'accountMailDeleteRead'];

function active(g, panel) {
  return (
    g.state === 'menu' &&
    g.menuPanel &&
    g.menuPanel.type === 'accountMail' &&
    (!panel || g.menuPanel === panel)
  );
}

// 按下时只记录目标并显示反馈，不立即执行领取或删除；同时取消列表惯性滚动。
function begin(g, p, count = 1) {
  const existing = g._mailButtonGesture;
  if (existing) {
    if (count > 1) {
      existing.cancelled = true;
      g._mailPressFeedback = null;
    }
    return true;
  }
  if (!active(g) || count > 1) return false;
  const hit = (g.menuHits || []).find((h) => keys.includes(h.key) && h.hit(p.x, p.y));
  if (!hit) return false;
  require('./panel-scroll.js').cancel(g);
  g._mailButtonGesture = {
    key: hit.key,
    data: hit.data,
    panel: g.menuPanel,
    storageKey: g.save && g.save.storageKey,
    down: p,
    cancelled: false,
  };
  g._mailPressFeedback = { key: hit.key, panel: g.menuPanel, down: true };
  return true;
}

// 抬手前重新确认仍是同一弹窗、同一档案且触点仍位于原按钮。
function valid(g, d, p) {
  return (
    active(g, d.panel) &&
    (g.save && g.save.storageKey) === d.storageKey &&
    (g.menuHits || []).some((h) => h.key === d.key && h.data === d.data && h.hit(p.x, p.y))
  );
}

// 移动超过阈值或离开有效按钮即取消本次操作，之后移回也不会恢复。
function move(g, p) {
  const d = g._mailButtonGesture;
  if (!d) return false;
  if (!p || Math.hypot(p.x - d.down.x, p.y - d.down.y) > 10 || !valid(g, d, p)) {
    d.cancelled = true;
    g._mailPressFeedback = null;
  }
  return true;
}

// 有效抬手才派发一次点击，并短暂保留按下反馈，便于用户感知操作。
function end(g, p) {
  const d = g._mailButtonGesture;
  if (!d) return false;
  g._mailButtonGesture = null;
  if (!d.cancelled && p && Math.hypot(p.x - d.down.x, p.y - d.down.y) <= 10 && valid(g, d, p)) {
    g._mailPressFeedback = { key: d.key, panel: d.panel, down: false, until: Date.now() + 110 };
    g.dispatchTouch(p);
  } else g._mailPressFeedback = null;
  return true;
}

function cancel(g) {
  g._mailButtonGesture = null;
  g._mailPressFeedback = null;
}

// 按下效果属于临时界面状态，弹窗变化或反馈超时后不再显示。
function pressed(g, now = Date.now()) {
  const p = g._mailPressFeedback;
  if (!p || !active(g, p.panel) || (!p.down && p.until <= now)) return null;
  return { key: p.key };
}

module.exports = { begin, move, end, cancel, pressed };
