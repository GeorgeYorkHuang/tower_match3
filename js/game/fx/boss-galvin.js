// 迦尔文技能表现：仅消费Boss状态/事件与当前塔位，不修改逻辑或消耗随机数。
'use strict';
const C = require('../../config/boss-effects.js').galvin;
const B = require('../../config/bosses.js').altar_galvin;
const TAU = Math.PI * 2;
function label(ctx, str, x, y, color, size) {
  ctx.font = 'bold ' + size + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = '#263329'; ctx.strokeText(str, x, y);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function circle(ctx, x, y, radius, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.stroke();
}
function draw(ctx, s) {
  const q = s.encounter;
  if (!s.lock || !q || q.id !== B.id || q.finished) return;
  const alive = q.members.filter(e => e.hp > 0);
  if (!alive.length) return;
  ctx.save();
  drawEcho(ctx, s, alive);
  drawResonance(ctx, q, alive);
  drawSync(ctx, s, alive);
  ctx.restore();
}
function drawEcho(ctx, s, alive) {
  const q = s.encounter, castAge = q.echoVisual ? Math.max(0, q.elapsed - q.echoVisual.at) : Infinity;
  const source = { x: alive.reduce((n, e) => n + e.x, 0) / alive.length,
    y: alive.reduce((n, e) => n + e.y, 0) / alive.length };
  for (const tower of s.towers || []) {
    if (!((q.slowUntil[tower.key] || 0) > q.elapsed + 1e-9)) continue;
    const { x, y } = tower;
    ctx.save(); ctx.globalAlpha *= 0.8;
    circle(ctx, x, y, 24, C.violet, 2);
    // Two downward chevrons identify attack-speed suppression, without covering the tower icon.
    ctx.strokeStyle = C.violet; ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const dy = y - 30 + i * 6;
      ctx.beginPath(); ctx.moveTo(x - 5, dy - 3); ctx.lineTo(x, dy); ctx.lineTo(x + 5, dy - 3); ctx.stroke();
    }
    label(ctx, '攻速 −' + Math.round(B.echoSlow * 100) + '%', x, y + 32, C.violet, 12);
    if (castAge < C.echoPulse) {
      ctx.globalAlpha *= 1 - castAge / C.echoPulse;
      ctx.strokeStyle = C.violet; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(source.x, source.y + 20);
      ctx.quadraticCurveTo((source.x + x) / 2, y - 45, x, y - 23); ctx.stroke();
    }
    ctx.restore();
  }
}
function drawResonance(ctx, q, alive) {
  if (q.phase !== 2 || !q.resonanceStacks) return;
  const castAge = q.resonanceVisual ? Math.max(0, q.elapsed - q.resonanceVisual.at) : Infinity;
  const pulse = Math.max(0, 1 - castAge / C.resonancePulse);
  if (alive.length === 2) {
    const [a, b] = alive;
    ctx.save(); ctx.globalAlpha *= 0.3 + pulse * 0.45;
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5 + pulse * 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y + 8);
    ctx.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) + 45, b.x, b.y + 8); ctx.stroke();
    ctx.fillStyle = C.green;
    for (const e of alive) for (let i = 0; i < 3; i++) {
      const p = (q.elapsed * 0.65 + i / 3) % 1;
      ctx.globalAlpha = (1 - p) * 0.65;
      ctx.beginPath(); ctx.arc(e.x + Math.sin(i * 2.4) * 26, e.y + 34 - p * 38, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  for (const e of alive) {
    ctx.save(); ctx.globalAlpha *= 0.85;
    for (let i = 0; i < B.resonanceMax; i++) {
      const x = e.x + (i - (B.resonanceMax - 1) / 2) * C.pipGap, y = e.y - 62;
      if (i < q.resonanceStacks) { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(x, y, C.pipRadius, 0, TAU); ctx.fill(); }
      else circle(ctx, x, y, C.pipRadius, C.gold, 1);
    }
    label(ctx, '共鸣 ' + q.resonanceStacks, e.x, e.y - 76, C.gold, 12);
    if (pulse > 0) { ctx.globalAlpha *= pulse; circle(ctx, e.x, e.y + 8, 25 + (1 - pulse) * 40, C.gold, 2); }
    ctx.restore();
  }
}
function drawSync(ctx, s, alive) {
  const q = s.encounter;
  if (q.phase !== 2 || alive.length !== 1 || q.firstDeathAt == null) return;
  const e = alive[0], remaining = Math.max(0, B.syncWindow - (q.elapsed - q.firstDeathAt));
  const y = Math.max(s.layout.areaY + s.layout.entryH + 24, e.y - 107);
  if (!q.syncExpired) {
    const color = remaining <= C.urgentSeconds ? C.urgent : C.gold;
    ctx.save(); circle(ctx, e.x, y, C.countdownRadius, '#607364', 2);
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, y, C.countdownRadius, -Math.PI / 2, -Math.PI / 2 + TAU * remaining / B.syncWindow); ctx.stroke();
    label(ctx, remaining.toFixed(1), e.x, y, color, 12);
    label(ctx, '同步击破', e.x, y - 25, color, 13); ctx.restore();
  }
  const event = q.timeoutVisual, age = event ? q.elapsed - event.at : Infinity;
  if (event && event.id === e.id && age >= 0 && age < C.healPulse) {
    const p = age / C.healPulse;
    ctx.save(); ctx.globalAlpha *= 1 - p;
    circle(ctx, e.x, e.y, 25 + p * 45, C.green, 2.5);
    label(ctx, '回复 +' + Math.round(B.survivorHealRatio * 100) + '%', e.x, y, C.green, 14); ctx.restore();
  }
}
module.exports = { draw };
