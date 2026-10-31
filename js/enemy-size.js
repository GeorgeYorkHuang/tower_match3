const VISUAL = require('./config/enemy-visuals.js');
const BOSSES = require('./config/bosses.js');

// 新Boss默认沿用普通倍率；终极Boss可显式标记或在定义中设置tier: 'final'。
module.exports = function enemySize(enemy, sizes) {
  let size = enemy.isBoss ? sizes.boss : (sizes[enemy.type] || sizes.normal);
  if (enemy.isBoss) {
    const def = BOSSES[enemy.bossId];
    const final = enemy.isFinalBoss === true || (def && def.tier === 'final') || enemy.waveNo === VISUAL.finalBossWave;
    size *= final ? VISUAL.finalBossScale : VISUAL.bossScale;
  }
  if (enemy.type === 'elite') size = Math.round(size * 1.35);
  return size;
};
