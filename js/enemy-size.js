const MONSTERS = require('./config/monsters.js').ENEMY;
const VISUAL = require('./config/enemy-visuals.js');
const BOSSES = require('./config/bosses.js');

// 新Boss默认沿用普通倍率；终极Boss可显式标记或在定义中设置tier: 'final'。
module.exports = function enemySize(enemy, sizes) {
  let size = enemy.isBoss ? sizes.boss : (sizes[enemy.type] || sizes.normal);
  if (!enemy.isBoss && !enemy.isSummon && ['normal', 'runner', 'tank'].includes(enemy.type)) {
    size = VISUAL.generationSizes[enemy.genLv] || VISUAL.generationFallbackSizes[enemy.type] || size;
  }
  if (enemy.isBoss) {
    const def = BOSSES[enemy.bossId];
    const final = enemy.isFinalBoss === true || (def && def.tier === 'final') || enemy.waveNo === VISUAL.finalBossWave;
    size *= final ? VISUAL.finalBossScale : VISUAL.bossScale;
  }
  if (enemy.type === 'elite' && !enemy.isBoss && !enemy.isSummon) {
    const lv = Number.isFinite(enemy.genLv) && enemy.genLv >= 1 ? Math.floor(enemy.genLv) : 1;
    const baseType = MONSTERS.levelOf(lv).type;
    size = Math.round((VISUAL.generationSizes[lv] || VISUAL.generationFallbackSizes[baseType] || sizes[baseType] || sizes.normal) * VISUAL.elite.scale);
  }
  return size;
};
