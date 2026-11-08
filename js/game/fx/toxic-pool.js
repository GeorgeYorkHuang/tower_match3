/** 毒池地面层：读取区域实体的战斗年龄，不修改伤害、敌人位置或随机数。 */
'use strict';
const C = require('../../config/toxic-pool-vfx.js');
const Frames = require('./toxic-pool-frames.js');

function frameFor(age, seed) {
  const t = ((Math.max(0, age || 0) + (seed || 0) * 0.037) % C.duration + C.duration) % C.duration;
  return Frames[Math.floor(t * C.fps) % Frames.length];
}

function draw(ctx, field, drawImg, loadImg) {
  if (!field || !(field.ttl > 0)) return false;
  if (typeof loadImg === 'function') loadImg(C.src);
  const age = field._poolVisualAge || 0;
  const fade = Math.min(1, age / C.fadeIn, field.ttl / C.fadeOut);
  const radius = field.r || 130;
  // 示例中的椭圆池面按两个轴分别映射，让可见池沿与世界坐标中的圆形判定区域一致。
  const sx = radius / C.footprint.x, sy = radius / C.footprint.y;
  ctx.save();
  ctx.globalAlpha *= fade;
  ctx.imageSmoothingEnabled = false;
  const ready = typeof drawImg === 'function' && drawImg(ctx, C.src,
    field.x - C.pivot.x * sx, field.y - C.pivot.y * sy,
    C.frame.w * sx, C.frame.h * sy, frameFor(age, field.seed));
  if (!ready) {
    // 加载失败时仍保留清晰的池面范围，不恢复旧图集或依赖真实时间。
    ctx.fillStyle = '#123b35'; ctx.strokeStyle = '#b5dd4f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(field.x, field.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#337953'; ctx.lineWidth = 3;
    for (let j = 0; j < 3; j++) {
      ctx.beginPath(); ctx.arc(field.x, field.y, radius * (0.25 + j * 0.22), age + j, age + j + Math.PI * 1.3); ctx.stroke();
    }
  }
  ctx.restore();
  return !!ready;
}

module.exports = { draw, frameFor };
