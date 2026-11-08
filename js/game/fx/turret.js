/**
 * 召唤炮台表现：已确认的待机/开火图集，基于 pixelfx cannonball 配方改编。
 * 图片缺失时使用固定底座与后坐炮管兜底；不参与伤害或目标选择。
 */
'use strict';
const C = require('../../config/turret-vfx.js');
const Visual = require('../../combat/turret-visual.js');
const Frames = require('./turret-frames.js');

function frameFor(kind, time) {
  const mode = kind === 'fire' ? 'fire' : 'idle';
  const age = Math.max(0, Number.isFinite(time) ? time : 0);
  const index = Math.floor((mode === 'idle' ? age % C.idle.duration : age) * C[mode].fps);
  return Frames[mode][Math.min(Frames[mode].length - 1, index)];
}

function fallback(ctx, phase) {
  const age = phase.time - 0.1;
  let back = 0;
  if (phase.kind === 'fire' && age > 0) {
    back = age < 0.055 ? 6 * (1 - Math.pow(1 - age / 0.055, 3)) : 6 * Math.exp(-(age - 0.055) / 0.13);
    if (age >= 0.55) back = 0;
  }
  // 底座与炮管分层，后坐不移动底座。
  ctx.fillStyle = '#202831';
  ctx.strokeStyle = '#9dafac';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-29, 2); ctx.lineTo(-20, -14); ctx.lineTo(19, -14); ctx.lineTo(30, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(-10, -31, 21, 22);
  ctx.save();
  ctx.translate(-2, -35); ctx.rotate(-0.32); ctx.translate(-back, 0);
  ctx.fillStyle = '#4e626b'; ctx.fillRect(-12, -7, 51, 14); ctx.strokeRect(-12, -7, 51, 14);
  ctx.fillStyle = '#b98040'; ctx.fillRect(25, -9, 5, 18);
  ctx.fillStyle = '#10151b'; ctx.fillRect(37, -8, 4, 16);
  if (phase.kind === 'fire' && age >= 0 && age < 0.1) {
    ctx.fillStyle = '#ffe26b'; ctx.beginPath(); ctx.moveTo(43, -5); ctx.lineTo(60, 0); ctx.lineTo(43, 5); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#b98040'; ctx.beginPath(); ctx.arc(-3, -33, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#202831'; ctx.beginPath(); ctx.arc(-3, -33, 3, 0, Math.PI * 2); ctx.fill();
}

function draw(ctx, turret, drawImg, loadImg) {
  const phase = Visual.sample(turret);
  if (!phase) return false;
  if (typeof loadImg === 'function') {
    loadImg(C.idle.src);
    loadImg(C.fire.src);
  }
  ctx.save();
  ctx.globalAlpha *= Math.min(1, turret.ttl / C.fadeSeconds);
  ctx.imageSmoothingEnabled = false;
  ctx.translate(turret.x, turret.y);
  if (phase.flip) ctx.scale(-1, 1);
  const ready = typeof drawImg === 'function' && drawImg(
    ctx, C[phase.kind].src, -C.pivot.x * C.scale, -C.pivot.y * C.scale,
    C.frameSize.w * C.scale, C.frameSize.h * C.scale, frameFor(phase.kind, phase.time)
  );
  if (!ready) {
    ctx.scale(C.scale, C.scale);
    fallback(ctx, phase);
  }
  ctx.restore();
  return !!ready;
}

module.exports = { draw, frameFor };
