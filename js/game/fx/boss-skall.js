'use strict';
const { text, strokeRoundRect } = require('../ui.js');
const B = require('../../config/boss-expansion.js').frost_skall;
function draw(ctx, g) {
  const q = g.run.bossEncounter, e = g.run.bossEnemy;
  if (!g.run.bossLock || !q || q.id !== B.id || q.finished || !e || e.hp <= 0) return;
  const top = g.ly.areaY + g.ly.entryH;
  require('../screens/boss-health.js').draw(ctx, e, top);
  if (q.windUntil > q.elapsed) text(ctx, '寒风 · 攻击间隔 +30%', 375, top + 94, 18, '#a7e7ff', 'center');
  const keys = [...new Set([...(q.freezeTargets || []), ...Object.keys(q.frozenUntil)])];
  ctx.save();
  for (const key of keys) {
    const warning = q.freezeTargets.includes(key), left = (q.frozenUntil[key] || 0) - q.elapsed;
    if (!warning && (left <= -.5 || !q.frozenUntil[key])) continue;
    const pos = g.combat.towerMuzzle(key);
    const sprite = g.renderer && g.renderer.bossSkillSprite;
    if (sprite) {
      const ending = !warning && left <= 0;
      const frame = ending ? Math.min(3, Math.floor(-left / .5 * 4)) : warning ? 0 : left > 3.7 ? 1 : 2;
      const drawn = sprite.call(g.renderer, ctx, ending ? 'skar-shellbreak' : 'skar-freeze', frame,
        pos.x, pos.y, 102, ending ? 1 + left / .5 : .9);
      if (drawn) {
        if (!ending) text(ctx, warning ? '即将冰封' : '冰封 ' + Math.ceil(left) + '秒', pos.x, pos.y - 55, 16, '#d0f5ff', 'center');
        continue;
      }
    }
    if (!warning && left <= 0) continue;
    ctx.globalAlpha = warning ? .55 + Math.sin(q.elapsed * 22) * .35 : .85;
    strokeRoundRect(ctx, pos.x - 33, pos.y - 40, 66, 76, 13, '#b5efff', warning ? 2 : 4);
    text(ctx, warning ? '即将冰封' : '冰封 ' + Math.ceil(left) + '秒', pos.x, pos.y - 47, 16, '#d0f5ff', 'center');
    if (!warning) {
      ctx.strokeStyle = '#b5efff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pos.x - 24, pos.y - 24); ctx.lineTo(pos.x + 24, pos.y + 24);
      ctx.moveTo(pos.x + 24, pos.y - 24); ctx.lineTo(pos.x - 24, pos.y + 24); ctx.stroke();
    }
  }
  ctx.restore();
}
module.exports = { draw };
