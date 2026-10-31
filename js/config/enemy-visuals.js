// 只读显示体型与动画元数据；不改变血量、伤害、移动或碰撞规则。
module.exports = {
  // 图集整帧显示边长（含透明留白），仅普通代际单位；精英/召唤/Boss沿用各自尺寸。
  // 普通1/4/7：84/76/80；快速2/5/8：72/60/64；重坦3/6/9：96/104/108。
  generationSizes: { 1: 84, 2: 72, 3: 96, 4: 76, 5: 60, 6: 104, 7: 80, 8: 64, 9: 108 },
  bossScale: 1.3,
  finalBossScale: 1.5,
  finalBossWave: 60,
  bossAnimations: {
    altar_galvin_twin: { frames: 8, columns: 4, rows: 2, frameMs: 180 },
    altar_galvin: { frames: 8, columns: 4, rows: 2, frameMs: 180 },
  },
};
