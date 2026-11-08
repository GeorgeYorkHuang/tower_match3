/**
 * 毒棒使用的 Vine whip 图集绘制：保留素材的常驻呼吸与挥击形态。
 * 攻击与待机共用根部和静止姿态；图片未加载时保留完整藤身的矢量兜底。
 * MIT 版权与原作者说明随 assets/images/towers/fx/vine-whip-v1/ 保存。
 */
'use strict';
const C = require('../../config/vine-whip.js');
const Frames = require('./vine-whip-frames.js');
const TAU = Math.PI * 2;

function preload(loadImg) {
  if (typeof loadImg !== 'function') return;
  // 使用渲染器已有的图片缓存，首次攻击时同时预载待机，避免切换空帧。
  loadImg(C.attack.src);
  loadImg(C.idle.src);
}

function frameFor(kind, time) {
  const mode = kind === 'idle' ? 'idle' : 'attack';
  const list = Frames[mode];
  const age = Math.max(0, Number.isFinite(time) ? time : 0);
  const index = Math.floor((mode === 'idle' ? age % C.idle.duration : age) * C[mode].fps);
  return list[Math.min(list.length - 1, index)];
}

function smooth(from, to, value) {
  const u = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return u * u * (3 - 2 * u);
}

// 贴图失败时使用同样的常驻姿态，不退回旧的出土/下沉或绕身符号。
function fallback(ctx, x, y, scale, phase) {
  const pts = [[0, 0]], t = phase.time, idle = phase.kind === 'idle';
  const cycle = TAU * t / C.idle.duration;
  for (let i = 0; i < 24; i++) {
    const s = i / 24;
    const rest = -Math.PI / 2 + 0.25 * Math.sin(s * 3) * s - 0.25 * Math.pow(s, 2.4);
    let a = rest, length = 3.3;
    if (idle) {
      a += 0.08 * (Math.sin(cycle + s * 1.8) - Math.sin(s * 1.8)) * s;
      length *= 1 + 0.012 * Math.sin(cycle);
    } else {
      const u = t - 0.36 - 0.0052 * i;
      const omega = TAU / 0.21;
      const spring = u <= 0 ? 0 : 1 - Math.exp(-u / 0.055) *
        (Math.cos(omega * u) + Math.sin(omega * u) / (omega * 0.055));
      const back = -Math.PI / 2 - 0.3 - 1.65 * Math.pow(s, 1.3);
      const out = -1 + 0.9 * Math.pow(s, 0.6);
      a += (back - a) * smooth(0.06, 0.36, t);
      a += (out - a) * spring;
      a += (rest - a) * smooth(0.82, 1.2, t);
    }
    const last = pts[pts.length - 1];
    pts.push([last[0] + Math.cos(a) * length, last[1] + Math.sin(a) * length]);
  }
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], width = 1.2 + 4.8 * Math.pow(1 - i / 24, 0.7);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = '#173a1a'; ctx.lineWidth = width + 1.5; ctx.stroke();
    ctx.strokeStyle = '#86c84e'; ctx.lineWidth = Math.max(1, width * 0.5); ctx.stroke();
  }
  for (const i of [7, 13, 18]) {
    const a = pts[i], b = pts[i + 1];
    ctx.beginPath(); ctx.ellipse(a[0], a[1], 4.5, 1.8, Math.atan2(b[1] - a[1], b[0] - a[0]) + 1.1, 0, TAU);
    ctx.fillStyle = '#52a03e'; ctx.fill();
  }
}

function drawAt(ctx, phase, rootX, rootY, scale, drawImg) {
  const frame = frameFor(phase.kind, phase.time);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const ready = typeof drawImg === 'function' && drawImg(
    ctx, C[phase.kind].src,
    rootX - C.pivot.x * scale, rootY - C.pivot.y * scale,
    C.frameSize.w * scale, C.frameSize.h * scale, frame
  );
  if (!ready) fallback(ctx, rootX, rootY, scale, phase);
  ctx.restore();
  return !!ready;
}

module.exports = { preload, frameFor, drawAt };
