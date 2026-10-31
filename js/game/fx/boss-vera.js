// 无状态、确定性的技能表现；只读单局Boss时钟与事件快照，禁止修改战斗/RNG。
'use strict';
const C = require('../../config/boss-effects.js').vera;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function visible(s) {
  return s.encounter && s.encounter.id === 'altar_vera' && !s.encounter.finished
    && s.boss && s.boss.hp > 0 && s.lock;
}
function age(q, event) { return event ? Math.max(0, q.elapsed - event.at) : Infinity; }
function ellipse(ctx, x, y, rx, ry) {
  // Explicit control points keep line widths in screen pixels (scaled arcs become opaque bands).
  const k = 0.5522847498;
  ctx.beginPath(); ctx.moveTo(x + rx, y);
  ctx.bezierCurveTo(x + rx, y + ry * k, x + rx * k, y + ry, x, y + ry);
  ctx.bezierCurveTo(x - rx * k, y + ry, x - rx, y + ry * k, x - rx, y);
  ctx.bezierCurveTo(x - rx, y - ry * k, x - rx * k, y - ry, x, y - ry);
  ctx.bezierCurveTo(x + rx * k, y - ry, x + rx, y - ry * k, x + rx, y); ctx.stroke();
}
function leaf(ctx, x, y, a, size) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(0, -size * 0.85, size, 0);
  ctx.quadraticCurveTo(0, size * 0.85, -size, 0); ctx.fill(); ctx.restore();
}
function path(s, origin, progress) {
  const ly = s.layout, entry = ly.areaY + ly.entryH;
  const x = clamp(origin.x, ly.areaX + 22, ly.areaX + ly.areaW - 22);
  const y = clamp(origin.y + 25, entry, ly.wallY - 10), points = [];
  for (let i = 0; i <= C.pathSegments; i++) {
    const p = i / C.pathSegments;
    if (p > progress) break;
    points.push([clamp(x + Math.sin(i * 2.31) * (i ? 17 : 0), ly.areaX + 8, ly.areaX + ly.areaW - 8), y + (ly.wallY - y) * p]);
  }
  return points;
}
function strokePath(ctx, points) {
  if (!points.length) return;
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
}
function clipArena(ctx, ly) {
  ctx.beginPath(); ctx.rect(ly.areaX, ly.areaY + ly.entryH, ly.areaW, ly.wallY - ly.areaY - ly.entryH + C.wallBand); ctx.clip();
}
function drawGround(ctx, s) {
  if (!visible(s)) return;
  const q = s.encounter, e = s.boss, ly = s.layout;
  const remaining = q.nextRiftAt - q.elapsed;
  const warning = q.phase >= 3 && remaining >= 0 && remaining <= C.warning;
  const impactAge = age(q, q.riftVisual), hitting = impactAge < C.impact;
  const pulseAge = age(q, q.wardVisual);
  const births = (s.enemies || []).filter(child => child.hp > 0 && child._veraBirthAt != null
    && q.elapsed - child._veraBirthAt < C.summonBirth).slice(0, C.maxBirthRings);
  if (!warning && !hitting && pulseAge >= C.leafPulse && !births.length) return;
  ctx.save(); clipArena(ctx, ly);
  if (pulseAge < C.leafPulse) {
    const p = pulseAge / C.leafPulse;
    ctx.strokeStyle = C.green; ctx.fillStyle = C.green; ctx.lineWidth = 1.5;
    ctx.globalAlpha *= (1 - p) * 0.7;
    let count = 0;
    for (const enemy of s.enemies || []) {
      if (enemy.hp <= 0 || enemy.y < ly.areaY + ly.entryH || enemy.y > ly.wallY) continue;
      if (count++ >= C.maxLeafRings) break;
      ellipse(ctx, enemy.x, enemy.y + 20, 19 + p * 9, 6 + p * 3);
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3 + p * 1.2;
        leaf(ctx, enemy.x + Math.cos(a) * 23, enemy.y + 20 + Math.sin(a) * 7 - p * 10, a, 3);
      }
    }
  }
  ctx.restore();
  for (const child of births) {
    const p = clamp((q.elapsed - child._veraBirthAt) / C.summonBirth, 0, 1);
    ctx.save(); clipArena(ctx, ly);
    ctx.globalAlpha *= (1 - p) * 0.9;
    ctx.strokeStyle = C.green; ctx.fillStyle = C.gold; ctx.lineWidth = 2;
    ellipse(ctx, child.x, child.y + 16, 15 + p * 24, 5 + p * 9);
    for (let i = 0; i < C.leafCount; i++) {
      const a = i * Math.PI * 2 / C.leafCount + p * Math.PI * 1.5;
      const x = child.x + Math.cos(a) * (15 + p * 13), y = child.y + 12 + Math.sin(a) * 7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * 8, y - 12, x + Math.cos(a) * 4, y - 28 * p); ctx.stroke();
      leaf(ctx, x, y - 25 * p, a, 3);
    }
    ctx.restore();
  }
  if (!warning && !hitting) return;
  ctx.save(); clipArena(ctx, ly);
  const origin = hitting ? q.riftVisual : e;
  const progress = hitting ? 1 : clamp(1 - remaining / C.warning, 0, 1);
  const points = path(s, origin, progress);
  ctx.globalAlpha *= hitting ? (1 - impactAge / C.impact) : 0.3 + progress * 0.45;
  ctx.strokeStyle = C.crack; ctx.lineWidth = hitting ? 8 : 2; strokePath(ctx, points);
  ctx.strokeStyle = C.hot; ctx.lineWidth = hitting ? 2.5 : 0.8; strokePath(ctx, points);
  // The target mark is visible throughout the warning; no damage is dealt by this layer.
  ctx.strokeStyle = C.crack; ctx.lineWidth = 2;
  ellipse(ctx, origin.x, ly.wallY - 3, 28 + progress * 8, 7);
  if (hitting) {
    const p = impactAge / C.impact, x = clamp(origin.x, ly.areaX + 30, ly.areaX + ly.areaW - 30);
    ctx.strokeStyle = C.hot; ctx.lineWidth = 4 * (1 - p) + 1;
    ellipse(ctx, x, ly.wallY - 3, 25 + p * 90, 8 + p * 14);
    ctx.fillStyle = C.crack; ctx.globalAlpha *= 0.32;
    ctx.fillRect(x - 75 - p * 30, ly.wallY - 12, 150 + p * 60, C.wallBand);
  }
  ctx.restore();
}
function drawBody(ctx, s) {
  if (!visible(s)) return;
  const q = s.encounter, e = s.boss;
  drawSummonCast(ctx, s);
  drawPhase(ctx, s);
  if (!q.wardVisual) return;
  const t = age(q, q.wardVisual), pulse = Math.max(0, 1 - t / C.wardPulse);
  ctx.save();
  ctx.globalAlpha *= 0.23 + pulse * 0.52;
  ctx.strokeStyle = C.green; ctx.lineWidth = 1.5 + pulse * 2;
  ellipse(ctx, e.x, e.y, C.wardRadius + pulse * 8, C.wardHeight);
  ctx.strokeStyle = C.gold; ctx.lineWidth = 1.4;
  ellipse(ctx, e.x, e.y + 37, C.wardRadius * 0.82, 20);
  ctx.fillStyle = C.gold;
  for (let i = 0; i < C.leafCount; i++) {
    const a = i * Math.PI * 2 / C.leafCount + q.elapsed * 0.28;
    leaf(ctx, e.x + Math.cos(a) * C.wardRadius, e.y + Math.sin(a) * C.wardHeight, a + Math.PI / 2, 5 + pulse * 2);
  }
  if (pulse > 0) {
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
    ellipse(ctx, e.x, e.y - 18, 8 + (1 - pulse) * 55, 10 + (1 - pulse) * 60);
  }
  ctx.restore();
}
function drawSummonCast(ctx, s) {
  const q = s.encounter, e = s.boss, t = age(q, q.summonVisual);
  if (t >= C.summonCast) return;
  const p = t / C.summonCast;
  ctx.save(); ctx.globalAlpha *= Math.sin(Math.PI * Math.min(0.95, p + 0.1));
  ctx.fillStyle = C.gold; ctx.strokeStyle = C.green; ctx.lineWidth = 1.5;
  // Two seed lights hover at the outstretched hands; no projectiles or damage entities.
  for (const side of [-1, 1]) {
    const x = e.x + side * 53, y = e.y - 11 - Math.sin(p * Math.PI) * 7;
    ctx.beginPath(); ctx.arc(x, y, C.seedRadius + Math.sin(p * Math.PI) * 3, 0, Math.PI * 2); ctx.fill();
    ellipse(ctx, x, y, 11 + p * 10, 7 + p * 7);
    leaf(ctx, x + side * 8, y - 7, side * p * 2, 4);
  }
  ctx.restore();
}
function drawPhase(ctx, s) {
  const q = s.encounter, e = s.boss, v = q.phaseVisual;
  if (!v || age(q, v) >= C.phasePulse) return;
  const p = age(q, v) / C.phasePulse, final = v.phase === 3;
  const color = final ? C.phaseRed : C.green;
  ctx.save(); ctx.globalAlpha *= Math.sin(Math.PI * Math.min(0.97, p + 0.08));
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ellipse(ctx, e.x, e.y + 35, 35 + p * 62, 11 + p * 15);
  ctx.fillStyle = C.gold;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 - Math.PI / 2;
    const x = e.x + Math.cos(a) * (45 + p * 32), y = e.y + Math.sin(a) * (60 + p * 30);
    leaf(ctx, x, y, a, 5);
    ctx.beginPath(); ctx.moveTo(x, y);
    if (final) {
      // Red-gold fissures fan out from the vine skirt, without deforming the sprite or hitbox.
      ctx.lineTo(x + Math.cos(a) * 7, y + 8); ctx.lineTo(x - Math.cos(a) * 5, y + 19);
    } else {
      ctx.lineTo(x + Math.cos(a + 0.6) * 9, y + Math.sin(a + 0.6) * 9);
    }
    ctx.stroke();
  }
  if (final) {
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(e.x + side * 22, e.y + 12);
      ctx.bezierCurveTo(e.x + side * (45 + p * 40), e.y + 25, e.x + side * (55 + p * 35), e.y + 65, e.x + side * (65 + p * 25), e.y + 74); ctx.stroke();
    }
  }
  ctx.restore();
}
module.exports = { drawGround, drawBody };
