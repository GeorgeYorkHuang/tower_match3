// 只读显示体型与动画元数据；不改变血量、伤害、移动或碰撞规则。
module.exports = {
  elite: require('./elite-effects.js'),
  // 图集整帧显示边长（含透明留白），普通代际单位与精英原型共用基准；召唤/Boss另算。
  // 同类型逐代递增：普通72→96，快速56→72，重坦末代96；超界代沿用末代。
  generationSizes: { 1: 72, 2: 56, 3: 90, 4: 78, 5: 60, 6: 98, 7: 84, 8: 64, 9: 106, 10: 90, 11: 68, 12: 96, 13: 96, 14: 72 },
  generationFallbackSizes: { normal: 96, runner: 72, tank: 96 },
  bossScale: 1.3,
  finalBossScale: 1.5,
  finalBossWave: 60,
  bossAnimations: {
    altar_vera: { frames: 8, columns: 4, rows: 2, frameMs: 180, inset: 0.12 },
    altar_galvin_twin: { frames: 8, columns: 4, rows: 2, frameMs: 180 },
    altar_galvin: { frames: 8, columns: 4, rows: 2, frameMs: 180 },
  },
};
