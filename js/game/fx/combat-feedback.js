'use strict';
const Presentation = require('../../config/combat-presentation.js');
// Presentation only: actual health plus shield loss, before reentrant death callbacks.
function recordDamage(combat, enemy, hpBefore, sourceKey, kind = 'hit', shieldBefore = 0) {
  if (kind && typeof kind === 'object') {
    sourceKey = kind.sourceKey || sourceKey;
    kind = kind.kind || 'hit';
  }
  const numbers = combat.game && combat.game.dmgNumbers;
  if (!numbers || !Presentation.damageNumbers.enabled || !Presentation.allowsSource(sourceKey)) return;
  const healthLoss = Math.min(Math.max(0, hpBefore), Math.max(0, hpBefore - enemy.hp));
  const shieldLoss = Math.max(0, shieldBefore - Math.max(0, Number(enemy.shield) || 0));
  const amount = healthLoss + shieldLoss;
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  numbers.push({ enemyId: enemy.id, x: enemy.x, y: enemy.y - 40, sourceKey, amount, kind });
}
module.exports = { recordDamage };
