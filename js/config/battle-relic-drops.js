/** 局内圣遗物方案B：节点控制件数，品质标记随宝箱保留到选择完成。 */
'use strict';
module.exports = {
  fields: ['ancient', 'lava', 'frost'],
  firstWave: 2,
  ordinaryBossWaves: [5, 10, 15, 25, 30, 35, 45, 50, 55],
  goldBossWaves: [20, 40],
  // 极端情况下全图所有SSR均已获得：补偿局内银币，不降级或重复发金卡。
  emptyGoldSilver: 500,
};
