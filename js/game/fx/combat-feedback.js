'use strict';
const Presentation = require('../../config/combat-presentation.js');
// Presentation only: emit positive actual health loss, before reentrant death callbacks.
function recordDamage(combat, enemy, hpBefore, sourceKey, kind = 'hit') {
  if (kind && typeof kind === 'object') {
    sourceKey = kind.sourceKey || sourceKey;
    kind = kind.kind || 'hit';
  }
  const numbers = combat.game && combat.game.dmgNumbers;
  if (!numbers || !Presentation.damageNumbers.enabled || !Presentation.allowsSource(sourceKey)) return;
  const amount = Math.min(Math.max(0, hpBefore), Math.max(0, hpBefore - enemy.hp));
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  numbers.push({ enemyId: enemy.id, x: enemy.x, y: enemy.y - 40, sourceKey, amount, kind });
}
module.exports = { recordDamage };
