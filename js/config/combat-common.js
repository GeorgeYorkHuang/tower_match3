// 通用战斗约束；时间单位秒，距离单位像素。
module.exports = {
  minAttackInterval: 0.15,
  alternateTargetBand: 40,
  scatterHitRadius: 42,
  // 回旋镖普攻：锁定目标后再飞行的距离、抛物线侧向弧度与出程命中位置。
  boomerangSweepOverrun: 200,
  boomerangArcSide: 110,
  boomerangTargetHitProgress: 0.325,
  boomerangTargetHitCurveQ: 0.65,
  glacierSlowCap: 0.9,
};
