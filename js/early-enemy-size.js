'use strict';
// 圣坛花园 W1–14 的实例绘制尺寸：按 alpha 主体宽度校准，宽高等比，单种变化不超过10%。
// 不修改共享代际表；后续波次、教学、其他地图、精英、Boss、召唤物保持原值。
const sizes = Object.freeze({1:74.73214285714286,2:50.4,3:81,4:85.8,5:60});
module.exports = function applyEarlyEnemySize(game, enemy) {
  const run = game.run;
  if (game.menuStage !== 'ancient' || !run || (run.chapter && run.chapter.isPrologue)) return;
  if (enemy.waveNo < 1 || enemy.waveNo > 14 || !Number.isInteger(enemy.waveNo)) return;
  if (enemy.isBoss || enemy.isSummon || enemy.bossSummonId || !['normal','runner','tank'].includes(enemy.type)) return;
  const size = sizes[enemy.genLv];
  if (size) enemy.visualSize = size;
};
