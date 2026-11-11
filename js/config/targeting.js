// 六塔普攻选敌偏好。只改变目标选择，不改变攻击、能耗或Boss收费。
'use strict';
module.exports = {
  maxCandidates: 16,
  emergencyDistance: 120,
  reservedKillPenalty: 5,
  reservationConfidence: 0.75,
  scatterReservationConfidence: 0.55,
  fire: { front: 3, density: 2.4, lane: 1.6, health: 0.3, trajectoryAim:true, geometryScore:true },
  // 冰塔预判/离散评分保留独立开关；本轮对照未证明稳定收益，正式默认沿用原方案。
  ice: { front: 3.5, speed: 1.2, freshControl: 1.8, lane: 2, trajectoryAim:false, geometryScore:false },
  poison: { front: 2.5, freshPoison: 2.8, health: 0.6 },
  electric: { front: 3, density: 1.8, freshControl: 1 },
  boomerang: { front: 2, lane: 3 },
  cannon: { front: 2, density: 2.8, health: 1.8 },
};
