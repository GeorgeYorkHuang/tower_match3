/**
 * 圣遗物图标统一分层绘制：先品质六边形底框，再物件。
 * 图片未就绪时返回false，由各界面保留原有符号兜底；不缓存离屏大图。
 */
'use strict';
const Art = require('../config/relic-art.js');
const bySource = {};
Object.keys(Art.cards).forEach(id => { bySource[Art.cards[id].icon] = Art.cards[id]; });

function iconSrc(id) { return Art.cards[id] ? Art.cards[id].icon : null; }
function handles(src) { return Object.prototype.hasOwnProperty.call(bySource, src); }
function draw(ctx, src, x, y, w, h, loadImg) {
  const card = bySource[src];
  if (!card) return false;
  // 两层都加载，避免首次只出现底框而被调用方视为完整图标。
  const frame = loadImg(card.frame), icon = loadImg(card.icon);
  if (!(frame && frame.width > 0 && icon && icon.width > 0)) return false;
  const c = Art.canvasSize, item = Art.item;
  ctx.save();
  try {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(frame, x, y, w, h);
    ctx.drawImage(icon, x + w * item.x / c, y + h * item.y / c,
      w * item.size / c, h * item.size / c);
  } finally { ctx.restore(); }
  return true;
}
module.exports = { iconSrc, handles, draw };
