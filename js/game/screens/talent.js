/**
 * talent.js —— 天赋页面绘制入口：依次绘制天赋盘和当前弹窗。
 * 具体图形、布局和交互命中由各子模块负责。
 */
'use strict';
const Board = require('./talent-board.js'),
  Panels = require('./talent-panels.js'),
  Art = require('./talent-art.js');

function draw(ctx, s, push, drawImg, relicIconSrc) {
  if (!s.talent) return;
  Board.draw(ctx, s, push, drawImg, relicIconSrc);
  Panels.draw(ctx, s, push, drawImg, relicIconSrc);
}

module.exports = { draw, mini: Art.mini, wrap: Art.wrap };
