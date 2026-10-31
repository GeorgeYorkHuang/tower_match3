// 轻量精英表现；配置/随机数只读，运行状态属于Run和Enemy。
'use strict';
const C = require('../../config/elite-effects.js');
const CONFIG = require('../../config.js');
const enemySize = require('../../enemy-size.js');
const TAU = Math.PI * 2;
function eligible(e) { return e.type === 'elite' && !e.isBoss && !e.isSummon; }
function step(run, enemies, dt) {
  if (!(dt > 0)) return;
  for (const e of enemies) if (eligible(e) && e.hp > 0) e._eliteAge = (e._eliteAge || 0) + dt;
  if (run.eliteBursts) run.eliteBursts = run.eliteBursts.filter(b => (b.t += dt) < C.deathDuration);
}
function emitDeath(run, e) {
  if (!eligible(e)) return;
  if (!run.eliteBursts) run.eliteBursts = [];
  if (run.eliteBursts.length >= C.maxBursts) run.eliteBursts.shift();
  run.eliteBursts.push({ x: e.x, y: e.y, size: enemySize(e, CONFIG.LAYOUT.enemy), t: 0, seed: e.id || 0 });
}
function ellipse(ctx, x, y, rx, ry, start, end) {
  // Sample short arcs without scaling the canvas, so the stroke stays thin.
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = start + (end - start) * i / 24, px = x + Math.cos(a) * rx, py = y + Math.sin(a) * ry;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.stroke();
}
function drawBase(ctx, e, x, y, size) {
  const age = e._eliteAge || 0, cx = x + size / 2, cy = y + size * (0.5 + C.ringOffset);
  ctx.save(); ctx.strokeStyle = C.gold; ctx.lineWidth = C.ringWidth; ctx.globalAlpha *= 0.55;
  ellipse(ctx, cx, cy, size * C.ringX, size * C.ringY, 0, TAU);
  ctx.globalAlpha *= 1.5; ctx.strokeStyle = C.light;
  const angle = age * 0.65 + (e.id || 0) * 0.4;
  for (let i = 0; i < 2; i++) ellipse(ctx, cx, cy, size * (C.ringX + 0.035), size * (C.ringY + 0.015), angle + i * Math.PI, angle + i * Math.PI + 0.7);
  if (age < C.spawnDuration) {
    const p = age / C.spawnDuration; ctx.globalAlpha *= 1 - p;
    ellipse(ctx, cx, cy, size * (0.18 + 0.3 * p), size * (0.04 + 0.08 * p), 0, TAU);
  }
  ctx.restore();
}
function sweep(e, x, y, size) {
  const age = (e._eliteAge || 0) + ((e.id || 0) % 7) * 0.11;
  const t = age % C.sweepPeriod;
  if (t > C.sweepDuration) return null;
  const p = t / C.sweepDuration;
  return { x, y: y + size * (0.9 - p * 0.8), w: size, h: Math.max(3, size * 0.12), alpha: Math.sin(p * Math.PI) * C.sweepAlpha };
}
function drawBadge(ctx, e, x, y, size) {
  const age = e._eliteAge || 0, cx = x + size / 2, cy = y + size * (C.badgeTop[e.genLv] || 0.02) - C.badgeSize - 4;
  ctx.save(); ctx.fillStyle = C.gold; ctx.strokeStyle = C.light; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, cy - C.badgeSize); ctx.lineTo(cx + C.badgeSize, cy);
  ctx.lineTo(cx, cy + C.badgeSize); ctx.lineTo(cx - C.badgeSize, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
  for (let i = 0; i < C.fragments; i++) {
    const p = (age * 0.3 + i / C.fragments + (e.id || 0) * 0.017) % 1;
    const a = i * TAU / C.fragments;
    ctx.globalAlpha = (1 - p) * 0.28;
    ctx.fillRect(cx + Math.cos(a) * size * 0.34, y + size * 0.8 - p * size * 0.5, 1.5, 1.5);
  }
  ctx.restore();
}
function drawDeaths(ctx, run) {
  for (const b of run.eliteBursts || []) {
    const p = Math.min(1, b.t / C.deathDuration);
    ctx.save(); ctx.globalAlpha *= (1 - p) * 0.85; ctx.fillStyle = C.gold;
    for (let i = 0; i < C.fragments; i++) {
      const a = i * TAU / C.fragments + b.seed * 0.13, d = b.size * (0.1 + p * 0.3);
      const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d - p * 10;
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 1.5, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 1.5, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}
module.exports = { eligible, step, emitDeath, drawBase, sweep, drawBadge, drawDeaths };
