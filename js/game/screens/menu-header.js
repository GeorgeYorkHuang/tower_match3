'use strict';
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
function createMenuHeader({ drawImg, IMG_SRC, fmtK }) {
  return function menuHeader(ctx, s, push) {
    // Shared header: square menu button and both currencies on one baseline.
    const mcy = 110, mch = 52, mw = 164;
    const menuX = 30, coinX = 102, diamondX = 290;
    ctx.fillStyle = 'rgba(13,20,31,0.94)';
    ctx.fillRect(0, 0, 750, 186);
    ctx.fillStyle = 'rgba(124,168,255,0.26)';
    ctx.fillRect(0, 185, 750, 1);
    fillRoundRect(ctx, menuX, mcy, mch, mch, 12, '#263447');
    strokeRoundRect(ctx, menuX, mcy, mch, mch, 12, '#7ca8ff', 1.2);
    for (let i = 0; i < 3; i++) fillRoundRect(ctx, menuX + 13, mcy + 15 + i * 10, 26, 3, 1.5, '#eef4ff');
    push('accountOpen', null, menuX, mcy, mch, mch);
    fillRoundRect(ctx, coinX, mcy, mw, mch, 26, 'rgba(247,201,72,0.12)');
    strokeRoundRect(ctx, coinX, mcy, mw, mch, 26, '#f7c948', 1.5);
    if (IMG_SRC.coin) drawImg(ctx, IMG_SRC.coin, coinX + 12, mcy + 10, 32, 32);
    else text(ctx, '🪙', coinX + 28, mcy + 26, 26, '#f7c948', 'center');
    text(ctx, fmtK(s.gold || 0), coinX + 52, mcy + 27, 28, '#f7c948', 'left');
    fillRoundRect(ctx, diamondX, mcy, mw, mch, 26, 'rgba(124,168,255,0.12)');
    strokeRoundRect(ctx, diamondX, mcy, mw, mch, 26, '#7ca8ff', 1.5);
    if (IMG_SRC.diamond) drawImg(ctx, IMG_SRC.diamond, diamondX + 12, mcy + 10, 32, 32);
    else text(ctx, '💎', diamondX + 28, mcy + 26, 26, '#7ca8ff', 'center');
    text(ctx, fmtK(s.diamond), diamondX + 52, mcy + 27, 28, '#7ca8ff', 'left');
    if (s.testProfile) text(ctx, '测试档案', 30, 194, 20, '#f7c948', 'left');
  };
}
module.exports = { createMenuHeader };
