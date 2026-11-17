'use strict';
const { text, fillRoundRect } = require('../ui.js');
const B = require('../../config/boss-expansion.js').lava_ignis;
function draw(ctx, g) {
  const q = g.run.bossEncounter, e = g.run.bossEnemy;
  if (!g.run.bossLock || !q || q.id !== B.id || q.finished || !e || e.hp <= 0) return;
  const top = g.ly.areaY + g.ly.entryH;
  require('../screens/boss-health.js').draw(ctx, e, top);
  if (q.heatUntil > q.elapsed) text(ctx, '过热 · 攻速 −20%', 375, top + 94, 18, '#ffb267', 'center');
  if (Number.isFinite(q.castEnd)) {
    const left = Math.max(0, q.castEnd - q.elapsed);
    const progress = Math.min(1, q.castDamage / (e.maxHp * B.interruptDamageRatio));
    fillRoundRect(ctx, 225, top + 108, 300, 10, 5, '#301b22');
    if (progress > 0) fillRoundRect(ctx, 225, top + 108, 300 * progress, 10, 5, '#ffc366');
    text(ctx, '过载 ' + left.toFixed(1) + '秒 · 打断 ' + Math.floor(progress * 100) + '%', 375, top + 138, 17, '#ffce88', 'center');
  } else if (q.phase === 3) text(ctx, '已打断 · ' + Math.max(0, Math.ceil(q.nextCastAt - q.elapsed)) + '秒后重新蓄压', 375, top + 128, 17, '#a9e9bd', 'center');
}
module.exports = { draw };
