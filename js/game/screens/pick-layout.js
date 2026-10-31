// 技能/圣遗物选择共用塔区避让与遮罩开口；不持有游戏实例。
'use strict';
const CONFIG = require('../../config.js');
const UI = require('../../config/pick-ui.js');
function geometry(kind, options = {}) {
  const def = UI[kind], top = Number.isFinite(options.towerTop) ? options.towerTop : UI.defaultTowerTop;
  const bottom = Number.isFinite(options.towerBottom) ? options.towerBottom : top + CONFIG.LAYOUT.towerSlot.size;
  return { w: def.w, h: def.h, x: (CONFIG.DESIGN.W - def.w) / 2,
    y: Math.min((CONFIG.DESIGN.H - def.h) / 2 - def.lift, top - UI.gap - def.h), top, bottom };
}
function backdrop(ctx, box) {
  // Draw outside the tower strip so icons stay at their normal brightness.
  ctx.fillRect(0, 0, CONFIG.DESIGN.W, Math.max(0, box.top - UI.bandPad));
  const y = box.bottom + UI.bandPad;
  if (y < CONFIG.DESIGN.H) ctx.fillRect(0, y, CONFIG.DESIGN.W, CONFIG.DESIGN.H - y);
}
module.exports = { geometry, backdrop };
