/** 战场数值规则：读取当前地图配置，不修改共享怪物等级表或对局状态。 */
'use strict';

// 仅配置了lateEnemyHp的地图生效；锁定区间外保持原生命预算，避免影响前40波和独立Boss。
function enemyHpMultiplier(field, wave) {
  const curve = field && field.lateEnemyHp;
  if (!curve || wave < curve.startWave || wave > curve.endWave) return 1;
  const progress = (wave - curve.startWave) / Math.max(1, curve.endWave - curve.startWave);
  return curve.startMultiplier + (curve.endMultiplier - curve.startMultiplier) * progress;
}

module.exports = { enemyHpMultiplier };
