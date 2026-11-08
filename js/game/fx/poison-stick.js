/**
 * 毒棒召唤物绘制：复用已确认的 Vine whip 呼吸与挥击图集。
 * 根部固定在召唤物坐标；面向目标镜像时仍绕根部变换，不改变伤害或弹道。
 */
'use strict';
const C = require('../../config/vine-whip.js');
const Visual = require('../../combat/poison-stick-visual.js');
const VineWhip = require('./vine-whip.js');

function draw(ctx, stick, drawImg, loadImg) {
  const phase = Visual.sample(stick);
  if (!phase) return false;
  VineWhip.preload(loadImg);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, stick.ttl / C.fadeSeconds);
  ctx.translate(stick.x, stick.y + C.rootOffsetY);
  if (phase.flip) ctx.scale(-1, 1);
  const ready = VineWhip.drawAt(ctx, phase, 0, 0, C.scale, drawImg);
  ctx.restore();
  return ready;
}

module.exports = { draw };
